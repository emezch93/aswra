import { ApiError, handle, json, readJson } from "../../_lib/http.js";
import { DUMMY_HASH, verifyPassword } from "../../_lib/crypto.js";
import { ipHash, rateLimit, requireSecret } from "../../_lib/guards.js";
import { audit, createSession, sessionCookie } from "../../_lib/auth.js";

export const onRequestPost = handle(async ({ request, env }) => {
  requireSecret(env);
  const ip = await ipHash(env, request);
  await rateLimit(env, `login:ip:${ip}`, 10, 900);
  const body = await readJson(request, 2000);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
  const password = String(body.password || "").slice(0, 200);
  await rateLimit(env, `login:em:${email}`, 5, 900);

  const user = await env.DB.prepare("SELECT id, email, password_hash FROM admin_users WHERE email = ?1 AND status = 'active'").bind(email).first();
  const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH); // same work whether or not the user exists
  if (!user || !ok) {
    await audit(env, { action: "admin.login_failed", details: { email: email.slice(0, 80) }, ip }).run();
    throw new ApiError(401, "Incorrect email or password.", "bad_credentials");
  }
  const s = await createSession(env, request, user.id);
  await env.DB.batch([
    env.DB.prepare("UPDATE admin_users SET last_login_at = datetime('now') WHERE id = ?1").bind(user.id),
    env.DB.prepare("DELETE FROM admin_sessions WHERE expires_at < datetime('now')"),
    env.DB.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(Math.floor(Date.now() / 1000) - 86400),
    audit(env, { adminId: user.id, action: "admin.login", ip }),
  ]);
  return json({ authenticated: true, email: user.email, csrfToken: s.csrf }, 200, { "set-cookie": sessionCookie(request, s.token, s.maxAge) });
});
