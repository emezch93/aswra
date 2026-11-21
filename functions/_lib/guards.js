import { ApiError, clientIp, isLocalhost } from "./http.js";
import { keyed } from "./crypto.js";

/* ------------------------------------------------------------------ */
/* Rate limiting (fixed windows stored in D1)                          */
/* ------------------------------------------------------------------ */
const nowSec = () => Math.floor(Date.now() / 1000);

async function bump(env, key, windowSeconds) {
  const now = nowSec();
  const k = await keyed(env, `rl:${key}`);
  return env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count, window_start`
  ).bind(k, now, now - windowSeconds).first();
}

const tooMany = (window_start, windowSeconds) =>
  new ApiError(429, "Too many attempts. Please wait a while and try again.", "rate_limited", {
    retryAfter: Math.max(1, window_start + windowSeconds - nowSec()),
  });

// Counts this call and refuses it when the limit is exceeded (used for login and status lookups).
export async function rateLimit(env, key, limit, windowSeconds) {
  const row = await bump(env, key, windowSeconds);
  if (row.count > limit) throw tooMany(row.window_start, windowSeconds);
}

// Refuses the call when the limit is ALREADY reached, but does not count it.
export async function assertUnderLimit(env, key, limit, windowSeconds) {
  const k = await keyed(env, `rl:${key}`);
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE key = ?1").bind(k).first();
  if (row && row.window_start > nowSec() - windowSeconds && row.count >= limit) throw tooMany(row.window_start, windowSeconds);
}

// Counts an event without refusing anything (used to record successful applications).
export const recordHit = (env, key, windowSeconds) => bump(env, key, windowSeconds);

export async function ipHash(env, request) {
  return keyed(env, `ip:${clientIp(request)}`);
}

export function requireSecret(env) {
  if (!env.APP_SECRET && env.ENVIRONMENT !== "development")
    throw new ApiError(503, "The service is not fully configured.", "not_configured");
}

/* ------------------------------------------------------------------ */
/* Cloudflare Turnstile server side verification (Siteverify)          */
/* https://developers.cloudflare.com/turnstile/get-started/server-side-validation/ */
/* ------------------------------------------------------------------ */
export const TURNSTILE_ACTION = "membership_application";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Dashboards often add stray spaces, line breaks or quote marks when keys are pasted. Remove them.
export const cleanKey = (v) => String(v ?? "").trim().replace(/^["'\u201C\u2018]+|["'\u201D\u2019]+$/g, "").trim();

// Accept the common alternate binding name as a compatibility fallback. The documented
// TURNSTILE_SECRET binding remains authoritative whenever it contains a usable value.
export const turnstileSecret = (env) => cleanKey(env.TURNSTILE_SECRET) || cleanKey(env.TURNSTILE_SECRET_KEY);

// A test only override of the Siteverify address. It is IGNORED unless ENVIRONMENT=development AND the host is localhost.
function verifyUrl(env, request) {
  return env.TURNSTILE_VERIFY_URL && env.ENVIRONMENT === "development" && isLocalhost(request) ? env.TURNSTILE_VERIFY_URL : SITEVERIFY_URL;
}

export const captchaBypassed = (env, request) => !turnstileSecret(env) && env.ENVIRONMENT === "development" && isLocalhost(request);

// Calls Siteverify. A random idempotency_key makes the single retry safe. Throws if the service cannot be reached.
export async function callSiteverify(env, request, token) {
  const body = new URLSearchParams({ secret: turnstileSecret(env), response: token, idempotency_key: crypto.randomUUID() });
  const ip = request.headers.get("cf-connecting-ip");
  if (ip) body.set("remoteip", ip);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(verifyUrl(env, request), { method: "POST", body, signal: ctl.signal });
      clearTimeout(timer);
      if (res.status >= 500) { lastError = new Error(`siteverify status ${res.status}`); continue; }
      return await res.json();
    } catch (e) { clearTimeout(timer); lastError = e; }
  }
  throw lastError;
}

const errorCodes = (data) => (Array.isArray(data && data["error-codes"]) ? data["error-codes"].map((c) => String(c).slice(0, 60)).slice(0, 8) : []);

// Records WHY verification failed (never the token or any secret). Throttled so it cannot flood the table.
async function logTurnstile(env, reason, codes, hostname) {
  try {
    const row = await bump(env, `turnstile-log:${reason}`, 3600);   // throttled PER reason, so a flood of one kind cannot hide another
    if (row.count > 20) return;
    await env.DB.prepare("INSERT INTO audit_logs (action, entity_type, details) VALUES ('turnstile.failed','turnstile',?1)")
      .bind(JSON.stringify({ reason, codes, hostname: hostname ? String(hostname).slice(0, 100) : null })).run();
  } catch { /* diagnostics must never break the request */ }
}

// Verifies a widget token. In production a missing secret FAILS CLOSED. Failure reasons:
//   expired        timeout-or-duplicate (token older than 5 minutes, or already used)
//   invalid        invalid-input-response (token malformed, or issued by a DIFFERENT widget than the secret belongs to)
//   misconfigured  missing/invalid secret
//   unavailable    Cloudflare could not be reached
export async function verifyTurnstile(env, request, token) {
  if (!turnstileSecret(env)) {
    if (captchaBypassed(env, request)) return;
    throw new ApiError(503, "Spam protection is not configured. Please contact ASWRA.", "captcha_unconfigured", { reason: "unconfigured" });
  }
  if (!token || typeof token !== "string" || token.length > 2048)
    throw new ApiError(400, "Please complete the verification and try again.", "captcha_missing", { reason: "missing" });

  let data;
  try { data = await callSiteverify(env, request, token); }
  catch (e) {
    await logTurnstile(env, "unavailable", [String((e && e.name) || "error")]);
    throw new ApiError(503, "The verification service could not be reached. Please try again in a moment.", "captcha_unavailable", { reason: "unavailable" });
  }

  if (!data || data.success !== true) {
    const codes = errorCodes(data);
    const reason = codes.some((c) => c === "missing-input-secret" || c === "invalid-input-secret") ? "misconfigured"
      : codes.includes("timeout-or-duplicate") ? "expired"
      : codes.includes("internal-error") ? "unavailable"
      : "invalid";
    await logTurnstile(env, reason, codes, data && data.hostname);
    if (reason === "misconfigured") throw new ApiError(503, "Spam protection is not set up correctly. Please contact the ASWRA secretariat.", "captcha_misconfigured", { reason });
    if (reason === "unavailable") throw new ApiError(503, "The verification service had a problem. Please try again in a moment.", "captcha_unavailable", { reason });
    throw new ApiError(400, reason === "expired"
      ? "Your verification expired or was already used. Please complete it again and resubmit."
      : "The verification could not be confirmed. Please complete it again and resubmit.", "captcha_failed", { reason });
  }

  // The token must have been solved on this site and for this form.
  const host = new URL(request.url).hostname;
  if ((data.hostname && data.hostname !== host) || (data.action && data.action !== TURNSTILE_ACTION)) {
    await logTurnstile(env, "mismatch", [data.hostname !== host ? "hostname-mismatch" : "action-mismatch"], data.hostname);
    throw new ApiError(400, "The verification could not be confirmed. Please complete it again and resubmit.", "captcha_failed", { reason: "mismatch" });
  }
}

// Administrator diagnostics. Sends a deliberately fake token: Cloudflare answers "invalid-input-response" when the SECRET is
// accepted and "invalid-input-secret" when it is not. Nothing is stored and no applicant data is involved.
export async function turnstileProbe(env, request) {
  if (!turnstileSecret(env)) return { result: "no_secret", codes: [] };
  try {
    const codes = errorCodes(await callSiteverify(env, request, "aswra-diagnostic-probe"));
    return { result: codes.some((c) => c === "invalid-input-secret" || c === "missing-input-secret") ? "secret_rejected" : "secret_accepted", codes };
  } catch { return { result: "unreachable", codes: [] }; }
}
