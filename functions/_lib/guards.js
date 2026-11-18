import { ApiError, clientIp, isLocalhost } from "./http.js";
import { keyed } from "./crypto.js";

// Fixed window counter stored in D1. Throws 429 when the limit is exceeded.
export async function rateLimit(env, key, limit, windowSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const k = await keyed(env, `rl:${key}`);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
     RETURNING count, window_start`
  ).bind(k, now, now - windowSeconds).first();
  if (row.count > limit) {
    const retryAfter = Math.max(1, row.window_start + windowSeconds - now);
    throw new ApiError(429, "Too many attempts. Please wait a while and try again.", "rate_limited", { retryAfter });
  }
}

export async function ipHash(env, request) {
  return keyed(env, `ip:${clientIp(request)}`);
}

// Cloudflare Turnstile. In production a missing secret FAILS CLOSED.
// The development bypass only works when ENVIRONMENT=development AND the host is localhost.
export async function verifyTurnstile(env, request, token) {
  if (!env.TURNSTILE_SECRET) {
    if (env.ENVIRONMENT === "development" && isLocalhost(request)) return;
    throw new ApiError(503, "Spam protection is not configured. Please contact ASWRA.", "captcha_unconfigured");
  }
  if (!token || typeof token !== "string" || token.length > 2048)
    throw new ApiError(400, "Please complete the verification challenge and try again.", "captcha_missing");
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  form.append("remoteip", clientIp(request));
  let ok = false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    ok = (await res.json()).success === true;
  } catch {
    throw new ApiError(503, "Verification service unavailable. Please try again shortly.", "captcha_unavailable");
  }
  if (!ok) throw new ApiError(400, "Verification failed. Please try again.", "captcha_failed");
}

export function requireSecret(env) {
  if (!env.APP_SECRET && env.ENVIRONMENT !== "development")
    throw new ApiError(503, "The service is not fully configured.", "not_configured");
}
