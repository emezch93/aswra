import { ApiError, assertSameOrigin, handle, json, readJson } from "../_lib/http.js";
import { keyed, newReference } from "../_lib/crypto.js";
import { assertUnderLimit, ipHash, rateLimit, recordHit, requireSecret, verifyTurnstile } from "../_lib/guards.js";
import { validateApplication } from "../_lib/validate.js";

// Rate limit design (keys use new "apply:*" names so counters from older versions are never reused):
//   apply:try      every request, generous flood guard (120 per hour per IP)
//   apply:ok:h/d   SUCCESSFULLY saved applications only: 30 per hour and 100 per day per IP (shared networks are common)
//   apply:capfail  failed verification attempts (60 per hour per IP)
// Invalid forms, failed verification and duplicates never use up the successful application allowance.
const LIMITS = { tryPerHour: 120, okPerHour: 30, okPerDay: 100, capFailPerHour: 60 };

// POST /api/applications : public membership application
export const onRequestPost = handle(async ({ request, env }) => {
  requireSecret(env);
  assertSameOrigin(request);
  const ip = await ipHash(env, request);
  await rateLimit(env, `apply:try:${ip}`, LIMITS.tryPerHour, 3600);
  await assertUnderLimit(env, `apply:ok:h:${ip}`, LIMITS.okPerHour, 3600);
  await assertUnderLimit(env, `apply:ok:d:${ip}`, LIMITS.okPerDay, 86400);
  await assertUnderLimit(env, `apply:capfail:${ip}`, LIMITS.capFailPerHour, 3600);

  const body = await readJson(request, 20000);
  if (body.website) throw new ApiError(400, "The submission could not be processed.", "rejected"); // honeypot

  // Validate BEFORE verification so an invalid form does not burn the applicant's single use token.
  const v = validateApplication(body);
  if (!v.ok) throw new ApiError(422, "Please correct the highlighted fields.", "validation", { fields: v.errors });
  const c = v.clean;

  try { await verifyTurnstile(env, request, body.turnstileToken); }
  catch (e) {
    if (e instanceof ApiError && (e.code === "captcha_failed" || e.code === "captcha_missing")) await recordHit(env, `apply:capfail:${ip}`, 3600);
    throw e; // misconfiguration and outages are the system's fault and are not counted against the visitor
  }

  const dedupe = await keyed(env, ["dedupe", c.category, c.applicantName.toLowerCase(), c.email, c.phone].join("|"));
  const dup = await env.DB.prepare("SELECT 1 FROM applications WHERE dedupe_hash = ?1 AND submitted_at > datetime('now','-1 day')").bind(dedupe).first();
  if (dup) throw new ApiError(409, "An application with these details was received in the last 24 hours, so this submission was not saved again. Please do not submit twice. Contact ASWRA if you need help.", "duplicate");

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newReference();
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO applications (reference, category, applicant_name, contact_person, email, phone, address, lga, form_data, declaration_accepted, privacy_accepted, dedupe_hash)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,1,?10)`
        ).bind(reference, c.category, c.applicantName, c.contactPerson, c.email, c.phone, c.address, c.lga, JSON.stringify(c.formData), dedupe),
        env.DB.prepare(
          `INSERT INTO application_status_history (application_id, previous_status, new_status, change_type)
           SELECT id, NULL, 'Pending', 'submission' FROM applications WHERE reference = ?1`
        ).bind(reference),
      ]);
      await recordHit(env, `apply:ok:h:${ip}`, 3600);
      await recordHit(env, `apply:ok:d:${ip}`, 86400);
      return json({ reference, status: "Pending", message: "Your application has been received. Keep your reference number safe: you will need it to check your application status." }, 201);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // reference collision: try again
    }
  }
  throw new ApiError(500, "Could not save your application. Please try again.", "server_error");
});
