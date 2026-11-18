import { ApiError, json, parseId, readJson } from "../../../_lib/http.js";
import { audit, withAdmin } from "../../../_lib/auth.js";
import { ipHash } from "../../../_lib/guards.js";

// PATCH /api/admin/communications/:id  { status: "Marked as Sent" }
// A manual record kept by the administrator. It is not proof of delivery.
export const onRequestPatch = withAdmin(async ({ request, env, params, session }) => {
  const id = parseId(params.id);
  const b = await readJson(request, 2000);
  if (b.status !== "Marked as Sent") throw new ApiError(422, 'Only "Marked as Sent" can be recorded.', "validation");
  const row = await env.DB.prepare("SELECT application_id, status FROM communication_logs WHERE id = ?1").bind(id).first();
  if (!row) throw new ApiError(404, "Message not found.", "not_found");
  if (row.status === "Marked as Sent") throw new ApiError(409, "This message is already marked as sent.", "conflict");
  await env.DB.batch([
    env.DB.prepare("UPDATE communication_logs SET status = 'Marked as Sent', sent_recorded_at = datetime('now'), admin_id = ?2 WHERE id = ?1 AND status = 'Prepared'").bind(id, session.admin_id),
    audit(env, { adminId: session.admin_id, action: "communication.marked_sent", entityType: "application", entityId: row.application_id, details: { communicationId: id }, ip: await ipHash(env, request) }),
  ]);
  return json({ ok: true, status: "Marked as Sent" });
});
