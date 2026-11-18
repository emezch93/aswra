import { ApiError, json, parseId } from "../../../../_lib/http.js";
import { withAdmin } from "../../../../_lib/auth.js";

export const onRequestGet = withAdmin(async ({ env, params }) => {
  const id = parseId(params.id);
  const a = await env.DB.prepare("SELECT * FROM applications WHERE id = ?1").bind(id).first();
  if (!a) throw new ApiError(404, "Application not found.", "not_found");
  const [reviews, history, comms] = await env.DB.batch([
    env.DB.prepare("SELECT id, notes, recommendation, created_at FROM application_reviews WHERE application_id = ?1 ORDER BY id DESC").bind(id),
    env.DB.prepare("SELECT id, previous_status, new_status, change_type, internal_note, public_message, created_at FROM application_status_history WHERE application_id = ?1 ORDER BY id DESC").bind(id),
    env.DB.prepare("SELECT id, comm_type, recipient, subject, body, status, created_at, sent_recorded_at FROM communication_logs WHERE application_id = ?1 ORDER BY id DESC").bind(id),
  ]);
  return json({
    application: {
      id: a.id, reference: a.reference, category: a.category, applicantName: a.applicant_name, contactPerson: a.contact_person,
      email: a.email, phone: a.phone, address: a.address, lga: a.lga, formData: JSON.parse(a.form_data),
      declarationAccepted: !!a.declaration_accepted, privacyAccepted: !!a.privacy_accepted,
      status: a.status, publicMessage: a.public_message, submittedAt: a.submitted_at, updatedAt: a.updated_at, decidedAt: a.decided_at,
    },
    reviews: reviews.results, history: history.results, communications: comms.results,
  });
});
