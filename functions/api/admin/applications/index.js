import { json } from "../../../_lib/http.js";
import { withAdmin } from "../../../_lib/auth.js";
import { STATUSES } from "../../../_lib/workflow.js";
import { CATEGORIES } from "../../../../assets/js/form-schema.js";

const SORTS = {
  submitted: "submitted_at",
  name: "applicant_name COLLATE NOCASE",
  status: "status",
  category: "category",
  reference: "reference",
};

export const onRequestGet = withAdmin(async ({ request, env }) => {
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") || "").trim().slice(0, 100);
  const status = p.get("status") || "";
  const category = p.get("category") || "";
  const sort = SORTS[p.get("sort")] || SORTS.submitted;
  const dir = p.get("dir") === "asc" ? "ASC" : "DESC";
  const size = Math.min(50, Math.max(5, parseInt(p.get("pageSize"), 10) || 20));
  const page = Math.max(1, parseInt(p.get("page"), 10) || 1);

  const where = ["archived_at IS NULL"];
  const binds = [];

  if (q) {
    const like = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
    where.push(
      "(reference LIKE ? ESCAPE '\\' OR applicant_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR lga LIKE ? ESCAPE '\\')"
    );
    binds.push(like, like, like, like, like);
  }

  if (STATUSES.includes(status)) {
    where.push("status = ?");
    binds.push(status);
  }

  if (CATEGORIES.some((c) => c.label === category)) {
    where.push("category = ?");
    binds.push(category);
  }

  const whereSql = "WHERE " + where.join(" AND ");
  const countSql = "SELECT COUNT(*) AS c FROM applications " + whereSql;
  const total = (
    await env.DB.prepare(countSql).bind(...binds).first()
  ).c;

  const listSql =
    "SELECT id, reference, applicant_name, category, status, submitted_at " +
    "FROM applications " +
    whereSql +
    " ORDER BY " +
    sort +
    " " +
    dir +
    ", id DESC LIMIT ? OFFSET ?";

  const { results } = await env.DB.prepare(listSql)
    .bind(...binds, size, (page - 1) * size)
    .all();

  return json({
    items: results.map((r) => ({
      id: r.id,
      reference: r.reference,
      name: r.applicant_name,
      category: r.category,
      status: r.status,
      submittedAt: r.submitted_at,
    })),
    total,
    page,
    pageSize: size,
    pages: Math.max(1, Math.ceil(total / size)),
  });
});
