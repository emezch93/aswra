import { ApiError, handle, json, readJson } from "../../_lib/http.js";
import { hashPassword, safeEqual } from "../../_lib/crypto.js";
import { ipHash, rateLimit } from "../../_lib/guards.js";
import { audit } from "../../_lib/auth.js";

// POST /api/admin/setup : one time creation of the single administrator.
// Requires the secret ADMIN_SETUP_TOKEN (set in Cloudflare, never in Git). Disabled once an administrator exists.
export const onRequestPost = handle(async ({ request, env }) => {
  if (!env.ADMIN_SETUP_TOKEN) throw new ApiError(404, "Not found.", "not_found");
  const ip = await ipHash(env, request);
  await rateLimit(env, `setup:${ip}`, 5, 3600);
  if (!safeEqual(request.headers.get("x-setup-token") || "", env.ADMIN_SETUP_TOKEN)) throw new ApiError(403, "Invalid setup token.", "forbidden");
  const existing = await env.DB.prepare("SELECT COUNT(*) AS c FROM admin_users").first();
  if (existing.c > 0) throw new ApiError(403, "Setup has already been completed.", "setup_done");

  const { email, password } = await readJson(request, 2000);
  const mail = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail) || mail.length > 254) throw new ApiError(422, "Enter a valid email address.", "validation");
  const pw = String(password || "");
  if (pw.length < 12 || pw.length > 128 || !/[A-Za-z]/.test(pw) || !/[^A-Za-z]/.test(pw) || pw.toLowerCase().includes(mail.split("@")[0]))
    throw new ApiError(422, "Use a password of at least 12 characters with letters and numbers or symbols, and not containing your email name.", "weak_password");

  const hash = await hashPassword(pw);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO admin_users (email, password_hash) VALUES (?1, ?2)").bind(mail, hash),
      audit(env, { action: "admin.setup", entityType: "admin", details: { email: mail }, ip }),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) throw new ApiError(403, "Setup has already been completed.", "setup_done");
    throw e;
  }
  return json({ ok: true, message: "Administrator created. Remove ADMIN_SETUP_TOKEN from Cloudflare now." }, 201);
});
