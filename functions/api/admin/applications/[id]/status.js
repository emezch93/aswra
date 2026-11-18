import { ApiError, json, parseId, readJson } from "../../../../_lib/http.js";
import { withAdmin } from "../../../../_lib/auth.js";
import { ipHash } from "../../../../_lib/guards.js";
import { FINAL, STATUSES, TRANSITIONS, changeStatus } from "../../../../_lib/workflow.js";
import { tidy } from "../../../../_lib/validate.js";

// PATCH /api/admin/applications/:id/status  (never sets Approved or Rejected: those need the official decision action)
export const onRequestPatch = withAdmin(async ({ request, env, params, session }) => {
  const id = parseId(params.id);
  const b = await readJson(request, 10000);
  const to = String(b.status || "");
  if (!STATUSES.includes(to)) throw new ApiError(422, "Unknown status.", "validation");
  if (FINAL.includes(to)) throw new ApiError(422, "Approval and rejection must be recorded with the official decision action.", "use_decision");
  const note = tidy(b.internalNote, true);
  const message = tidy(b.publicMessage, true);
  if (note.length > 4000 || message.length > 1000) throw new ApiError(422, "Text is too long.", "validation");
  if (to === "Requires Information" && message.length < 10)
    throw new ApiError(422, "Write the applicant facing message that tells the applicant what is needed.", "validation");

  const app = await env.DB.prepare("SELECT status FROM applications WHERE id = ?1").bind(id).first();
  if (!app) throw new ApiError(404, "Application not found.", "not_found");
  if (FINAL.includes(app.status)) throw new ApiError(409, "A final decision has already been recorded for this application.", "final");
  if (!(TRANSITIONS[app.status] || []).includes(to)) throw new ApiError(409, `An application that is "${app.status}" cannot be moved to "${to}".`, "bad_transition");

  const ok = await changeStatus(env, { id, from: app.status, to, internalNote: note, publicMessage: message, adminId: session.admin_id, ip: await ipHash(env, request) });
  if (!ok) throw new ApiError(409, "This application was just changed. Please reload and try again.", "conflict");
  return json({ ok: true, status: to });
});
