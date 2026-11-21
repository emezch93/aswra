import { json } from "../../_lib/http.js";
import { withAdmin } from "../../_lib/auth.js";
import { STATUSES } from "../../_lib/workflow.js";

export const onRequestGet = withAdmin(async ({ env }) => {
  const { results } = await env.DB.prepare("SELECT status, COUNT(*) AS c FROM applications WHERE archived_at IS NULL GROUP BY status").all();
  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const r of results) { byStatus[r.status] = r.c; total += r.c; }
  return json({ total, byStatus });
});
