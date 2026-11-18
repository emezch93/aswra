import { ApiError, json, parseId, readJson } from "../../../../_lib/http.js";
import { audit, withAdmin } from "../../../../_lib/auth.js";
import { ipHash } from "../../../../_lib/guards.js";
import { COMM_TYPES } from "../../../../_lib/workflow.js";
import { tidy } from "../../../../_lib/validate.js";

// POST /api/admin/applications/:id/communications : records a PREPARED email. Nothing is ever sent by the server.
export const onRequestPost = withAdmin(async ({ request, env, params, session }) => {
  const id = parseId(params.id);
  const b = await readJson(request, 20000);
  const type = String(b.type || "");
  const subject = tidy(b.subject);
  const body = tidy(b.body, true);
  if (!COMM_TYPES.includes(type)) throw new ApiError(422, "Unknown message type.", "validation");
  if (subject.length < 3 || subject.length > 200) throw new ApiError(422, "Subject must be 3 to 200 characters.", "validation");
  if (body.length < 20 || body.length > 8000) throw new ApiError(422, "The message must be 20 to 8000 characters.", "validation");
  if (/\[[A-Za-z' ]*(Applicant Name|Application Reference|Administrator|Specific)[^\]]*\]/i.test(body + subject))
    throw new ApiError(422, "The message still contains a template placeholder in square brackets. Replace it before saving.", "validation");

  const app = await env.DB.prepare("SELECT email FROM applications WHERE id = ?1").bind(id).first();
  if (!app) throw new ApiError(404, "Application not found.", "not_found");
  const ip = await ipHash(env, request);
  const [ins] = await env.DB.batch([
    env.DB.prepare("INSERT INTO communication_logs (application_id, comm_type, recipient, subject, body, admin_id) VALUES (?1,?2,?3,?4,?5,?6) RETURNING id, created_at").bind(id, type, app.email, subject, body, session.admin_id),
    audit(env, { adminId: session.admin_id, action: "communication.prepared", entityType: "application", entityId: id, details: { type }, ip }),
  ]);
  const row = ins.results[0];
  return json({ communication: { id: row.id, comm_type: type, recipient: app.email, subject, body, status: "Prepared", created_at: row.created_at, sent_recorded_at: null } }, 201);
});
