export const STATUSES = ["Pending", "Under Review", "Requires Information", "Recommended for Approval", "Recommended for Rejection", "Approved", "Rejected"];
export const FINAL = ["Approved", "Rejected"];
// Statuses an administrator can move to with the normal status action (never Approved/Rejected).
export const TRANSITIONS = {
  "Pending": ["Under Review", "Requires Information"],
  "Under Review": ["Requires Information", "Recommended for Approval", "Recommended for Rejection"],
  "Requires Information": ["Under Review"],
  "Recommended for Approval": ["Under Review", "Requires Information", "Recommended for Rejection"],
  "Recommended for Rejection": ["Under Review", "Requires Information", "Recommended for Approval"],
};
// An official decision can only follow a review.
export const DECISION_FROM = ["Under Review", "Recommended for Approval", "Recommended for Rejection"];
export const COMM_TYPES = ["approval", "rejection", "additional_information", "under_review", "receipt_confirmation", "general_update", "clarification"];

// Changes status, writes history and audit in ONE atomic batch.
// Returns false if the application was no longer in the expected status (concurrent change).
export async function changeStatus(env, { id, from, to, internalNote, publicMessage, adminId, type = "status", ip, decided = false }) {
  const db = env.DB;
  const results = await db.batch([
    db.prepare(
      `UPDATE applications SET status = ?1, public_message = ?2, updated_at = datetime('now'),
              decided_at = CASE WHEN ?5 = 1 THEN datetime('now') ELSE decided_at END
        WHERE id = ?3 AND status = ?4`
    ).bind(to, publicMessage || null, id, from, decided ? 1 : 0),
    db.prepare(
      `INSERT INTO application_status_history (application_id, previous_status, new_status, change_type, internal_note, public_message, admin_id)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7 WHERE changes() > 0`
    ).bind(id, from, to, type, internalNote || null, publicMessage || null, adminId),
    db.prepare(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details, ip_hash)
       SELECT ?1, ?2, 'application', ?3, ?4, ?5 WHERE changes() > 0`
    ).bind(adminId, `application.${type}`, String(id), JSON.stringify({ from, to }), ip),
  ]);
  return results[0].meta.changes > 0;
}
