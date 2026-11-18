import { ApiError, handle, json } from "../_lib/http.js";
import { REFERENCE_PATTERN } from "../_lib/crypto.js";
import { ipHash, rateLimit } from "../_lib/guards.js";

const NOT_FOUND = "We could not find an application with that reference. Please check it and try again.";

// GET /api/application-status?reference=ASWRA-2026-XXXXXXXXXXXX
// Returns the minimum public information: status, applicant-facing message and last update date.
export const onRequestGet = handle(async ({ request, env }) => {
  const ip = await ipHash(env, request);
  await rateLimit(env, `status:${ip}`, 30, 600);
  const ref = (new URL(request.url).searchParams.get("reference") || "").trim().toUpperCase();
  if (!REFERENCE_PATTERN.test(ref)) throw new ApiError(404, NOT_FOUND, "not_found");
  const row = await env.DB.prepare("SELECT status, public_message, updated_at FROM applications WHERE reference = ?1").bind(ref).first();
  if (!row) throw new ApiError(404, NOT_FOUND, "not_found");
  return json({ status: row.status, message: row.public_message || null, updatedAt: row.updated_at });
});
