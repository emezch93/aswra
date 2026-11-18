import { json, parseId } from "../../../../_lib/http.js";
import { withAdmin } from "../../../../_lib/auth.js";

export const onRequestGet = withAdmin(async ({ env, params }) => {
  const id = parseId(params.id);
  const { results } = await env.DB.prepare(
    "SELECT id, previous_status, new_status, change_type, internal_note, public_message, created_at FROM application_status_history WHERE application_id = ?1 ORDER BY id DESC"
  ).bind(id).all();
  return json({ history: results });
});
