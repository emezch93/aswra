import { json } from "../../_lib/http.js";
import { audit, withAdmin } from "../../_lib/auth.js";
import { captchaBypassed, cleanKey, ipHash, turnstileProbe } from "../../_lib/guards.js";

// GET: configuration health (never returns key values) and the most recent verification failures.
export const onRequestGet = withAdmin(async ({ request, env }) => {
  const site = cleanKey(env.TURNSTILE_SITE_KEY), secret = cleanKey(env.TURNSTILE_SECRET);
  const dirty = (raw, clean) => raw != null && String(raw) !== clean;
  const warnings = [];
  if (!site) warnings.push("TURNSTILE_SITE_KEY is not set for this environment (Production and Preview are configured separately).");
  if (!secret) warnings.push("TURNSTILE_SECRET is not set for this environment. The application form refuses submissions until it is.");
  if (site && secret && site === secret) warnings.push("TURNSTILE_SECRET is identical to TURNSTILE_SITE_KEY. The secret key must be the different, private value.");
  if (dirty(env.TURNSTILE_SITE_KEY, site) || dirty(env.TURNSTILE_SECRET, secret)) warnings.push("A Turnstile key contained extra spaces or quote marks. They are removed automatically, but re-enter the value cleanly.");
  if (!env.APP_SECRET) warnings.push("APP_SECRET is not set.");
  const recent = (await env.DB.prepare("SELECT created_at, details FROM audit_logs WHERE action = 'turnstile.failed' ORDER BY id DESC LIMIT 15").all()).results
    .map((r) => { let d = {}; try { d = JSON.parse(r.details); } catch {} return { at: r.created_at, reason: d.reason, codes: d.codes, hostname: d.hostname }; });
  const counts = Object.fromEntries((await env.DB.prepare(
    "SELECT json_extract(details,'$.reason') AS reason, COUNT(*) AS c FROM audit_logs WHERE action = 'turnstile.failed' AND created_at > datetime('now','-1 day') GROUP BY reason"
  ).all()).results.map((r) => [r.reason, r.c]));
  if (counts.invalid) warnings.push("Recent verifications failed with invalid-input-response. If this affects every visitor, the site key and secret key probably belong to DIFFERENT Turnstile widgets.");
  if (counts.misconfigured) warnings.push("Cloudflare rejected the secret key. Copy the secret again from the Turnstile widget.");
  return json({
    turnstile: { siteKeyConfigured: !!site, secretConfigured: !!secret, bypassedForLocalDevelopment: captchaBypassed(env, request), serverHostname: new URL(request.url).hostname },
    appSecretConfigured: !!env.APP_SECRET, warnings, failuresLast24Hours: counts, recentFailures: recent,
  });
});

// POST: asks Cloudflare whether the configured secret key is accepted (uses a fake token, stores nothing).
export const onRequestPost = withAdmin(async ({ request, env, session }) => {
  const result = await turnstileProbe(env, request);
  await audit(env, { adminId: session.admin_id, action: "diagnostics.turnstile_probe", details: { result: result.result }, ip: await ipHash(env, request) }).run();
  return json(result);
});
