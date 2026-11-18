import { ApiError, json, parseId, readJson } from "../../../../_lib/http.js";
import { withAdmin } from "../../../../_lib/auth.js";
import { ipHash } from "../../../../_lib/guards.js";
import { DECISION_FROM, FINAL, changeStatus } from "../../../../_lib/workflow.js";
import { tidy } from "../../../../_lib/validate.js";

const REASONS = ["Eligibility requirements not met", "Required information missing", "Submitted information could not be verified", "Organisational documentation insufficient", "Does not meet the membership category requirements", "Other reason specified by the administrator"];

// POST /api/admin/applications/:id/decision : the ONLY way to reach Approved or Rejected.
export const onRequestPost = withAdmin(async ({ request, env, params, session }) => {
  const id = parseId(params.id);
  const b = await readJson(request, 10000);
  const decision = String(b.decision || "");
  if (!["Approved", "Rejected"].includes(decision)) throw new ApiError(422, "Decision must be Approved or Rejected.", "validation");
  if (b.confirmed !== true) throw new ApiError(422, "The decision must be explicitly confirmed.", "validation");
  const note = tidy(b.internalNote, true);
  const message = tidy(b.publicMessage, true);
  const reason = tidy(b.reasonCategory);
  if (note.length > 4000 || message.length > 1000) throw new ApiError(422, "Text is too long.", "validation");
  if (decision === "Rejected" && (!REASONS.includes(reason) || note.length < 10))
    throw new ApiError(422, "A rejection needs a reason category and a written explanation of at least 10 characters.", "validation");

  const app = await env.DB.prepare("SELECT status FROM applications WHERE id = ?1").bind(id).first();
  if (!app) throw new ApiError(404, "Application not found.", "not_found");
  if (FINAL.includes(app.status)) throw new ApiError(409, "A final decision has already been recorded.", "final");
  if (!DECISION_FROM.includes(app.status)) throw new ApiError(409, `Review the application first. A decision cannot be recorded while it is "${app.status}".`, "bad_transition");

  const internal = decision === "Rejected" ? `Reason: ${reason}. ${note}` : note;
  const ok = await changeStatus(env, { id, from: app.status, to: decision, internalNote: internal, publicMessage: message, adminId: session.admin_id, type: "decision", decided: true, ip: await ipHash(env, request) });
  if (!ok) throw new ApiError(409, "This application was just changed. Please reload and try again.", "conflict");
  return json({ ok: true, status: decision });
});
