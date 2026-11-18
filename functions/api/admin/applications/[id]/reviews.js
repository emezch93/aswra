import { ApiError, json, parseId, readJson } from "../../../../_lib/http.js";
import { audit, withAdmin } from "../../../../_lib/auth.js";
import { ipHash } from "../../../../_lib/guards.js";
import { FINAL, TRANSITIONS, changeStatus } from "../../../../_lib/workflow.js";
import { tidy } from "../../../../_lib/validate.js";

// POST /api/admin/applications/:id/reviews : private note, optionally with a recommendation.
// A recommendation is NOT a decision. It only moves the status to "Recommended for ...".
export const onRequestPost = withAdmin(async ({ request, env, params, session }) => {
  const id = parseId(params.id);
  const b = await readJson(request, 10000);
  const notes = tidy(b.notes, true);
  const rec = String(b.recommendation || "None");
  const message = tidy(b.publicMessage, true);
  if (notes.length < 3 || notes.length > 4000) throw new ApiError(422, "Write a note of 3 to 4000 characters.", "validation");
  if (!["None", "Approve", "Reject"].includes(rec)) throw new ApiError(422, "Unknown recommendation.", "validation");
  if (message.length > 1000) throw new ApiError(422, "Applicant message is too long.", "validation");

  const app = await env.DB.prepare("SELECT status FROM applications WHERE id = ?1").bind(id).first();
  if (!app) throw new ApiError(404, "Application not found.", "not_found");
  const ip = await ipHash(env, request);

  if (rec !== "None") {
    const to = rec === "Approve" ? "Recommended for Approval" : "Recommended for Rejection";
    if (FINAL.includes(app.status)) throw new ApiError(409, "A final decision has already been recorded.", "final");
    if (app.status === to) throw new ApiError(409, `This application is already ${to}.`, "bad_transition");
    if (!(TRANSITIONS[app.status] || []).includes(to)) throw new ApiError(409, `Mark the application "Under Review" before recording a recommendation.`, "bad_transition");
    const ok = await changeStatus(env, { id, from: app.status, to, internalNote: notes, publicMessage: message, adminId: session.admin_id, type: "recommendation", ip });
    if (!ok) throw new ApiError(409, "This application was just changed. Please reload and try again.", "conflict");
  }
  await env.DB.batch([
    env.DB.prepare("INSERT INTO application_reviews (application_id, notes, recommendation, admin_id) VALUES (?1,?2,?3,?4)").bind(id, notes, rec, session.admin_id),
    audit(env, { adminId: session.admin_id, action: "application.review_note", entityType: "application", entityId: id, details: { recommendation: rec }, ip }),
  ]);
  return json({ ok: true }, 201);
});
