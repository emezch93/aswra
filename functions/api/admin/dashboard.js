import { json } from "../../_lib/http.js";
import { withAdmin } from "../../_lib/auth.js";
import { STATUSES } from "../../_lib/workflow.js";

export const onRequestGet = withAdmin(async ({ env }) => {
  // Keep the admin dashboard operational while the archive migration is pending.
  const columns = await env.DB.prepare("PRAGMA table_info(applications)").all();
  const hasArchiveColumn = (columns.results || []).some((column) => column.name === "archived_at");
  const where = hasArchiveColumn ? " WHERE archived_at IS NULL" : "";
  const { results } = await env.DB.prepare(
    "SELECT status, COUNT(*) AS c FROM applications" + where + " GROUP BY status"
  ).all();

  const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const r of results) {
    byStatus[r.status] = r.c;
    total += r.c;
  }
  return json({ total, byStatus });
});
