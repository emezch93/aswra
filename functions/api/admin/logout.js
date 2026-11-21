import { json } from "../../_lib/http.js";
import { audit, sessionCookie, withAdmin } from "../../_lib/auth.js";
import { ipHash } from "../../_lib/guards.js";

export const onRequestPost = withAdmin(async ({ request, env, session }) => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM admin_sessions WHERE id = ?1").bind(session.session_id),
    audit(env, { adminId: session.admin_id, action: "admin.logout", ip: await ipHash(env, request) }),
  ]);
  return json({ ok: true }, 200, { "set-cookie": sessionCookie(request, "", 0) });
});
