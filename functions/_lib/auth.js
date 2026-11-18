import { ApiError, handle, json } from "./http.js";
import { b64u, randomBytes, safeEqual, sha256 } from "./crypto.js";
import { ipHash } from "./guards.js";

const SESSION_HOURS = 8;
const IDLE_MINUTES = 120;

const isHttps = (request) => new URL(request.url).protocol === "https:";
export const cookieName = (request) => (isHttps(request) ? "__Host-aswra_session" : "aswra_session");

export function sessionCookie(request, value, maxAge) {
  return `${cookieName(request)}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${isHttps(request) ? "; Secure" : ""}`;
}

function readCookie(request) {
  const name = cookieName(request);
  for (const part of (request.headers.get("cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

export async function createSession(env, request, adminId) {
  const token = b64u(randomBytes(32));
  const csrf = b64u(randomBytes(24));
  await env.DB.prepare(
    `INSERT INTO admin_sessions (token_hash, csrf_token, admin_id, expires_at, ip_hash, user_agent)
     VALUES (?1, ?2, ?3, datetime('now', ?4), ?5, ?6)`
  ).bind(await sha256(token), csrf, adminId, `+${SESSION_HOURS} hours`, await ipHash(env, request),
         (request.headers.get("user-agent") || "").slice(0, 200)).run();
  return { token, csrf, maxAge: SESSION_HOURS * 3600 };
}

export async function getSession(env, request) {
  const token = readCookie(request);
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    `SELECT s.id AS session_id, s.csrf_token, u.id AS admin_id, u.email
       FROM admin_sessions s JOIN admin_users u ON u.id = s.admin_id
      WHERE s.token_hash = ?1 AND u.status = 'active'
        AND s.expires_at > datetime('now') AND s.last_seen_at > datetime('now', ?2)`
  ).bind(await sha256(token), `-${IDLE_MINUTES} minutes`).first();
  if (!row) return null;
  await env.DB.prepare("UPDATE admin_sessions SET last_seen_at = datetime('now') WHERE id = ?1").bind(row.session_id).run();
  return row;
}

// Protects an endpoint: valid session, same origin and CSRF token for state changing methods.
export const withAdmin = (fn) =>
  handle(async (ctx) => {
    const session = await getSession(ctx.env, ctx.request);
    if (!session) throw new ApiError(401, "Please sign in to continue.", "unauthenticated");
    if (!["GET", "HEAD"].includes(ctx.request.method)) {
      const origin = ctx.request.headers.get("origin");
      if (origin !== new URL(ctx.request.url).origin) throw new ApiError(403, "Request origin not allowed.", "bad_origin");
      if (!safeEqual(ctx.request.headers.get("x-csrf-token") || "", session.csrf_token))
        throw new ApiError(403, "Your session security token is invalid. Please refresh the page.", "bad_csrf");
    }
    return fn({ ...ctx, session });
  });

export const audit = (env, { adminId = null, action, entityType = null, entityId = null, details = null, ip = null }) =>
  env.DB.prepare(
    "INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_hash) VALUES (?1,?2,?3,?4,?5,?6)"
  ).bind(adminId, action, entityType, entityId == null ? null : String(entityId), details ? JSON.stringify(details) : null, ip);

export { json };
