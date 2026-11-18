import { ApiError, clientIp, handle, json, readJson } from "../_lib/http.js";
import { keyed, newReference } from "../_lib/crypto.js";
import { ipHash, rateLimit, requireSecret, verifyTurnstile } from "../_lib/guards.js";
import { validateApplication } from "../_lib/validate.js";

// POST /api/applications : public membership application
export const onRequestPost = handle(async ({ request, env }) => {
  requireSecret(env);
  const ip = await ipHash(env, request);
  await rateLimit(env, `apply:h:${ip}`, 5, 3600);
  await rateLimit(env, `apply:d:${ip}`, 15, 86400);

  const body = await readJson(request, 20000);
  if (body.website) throw new ApiError(400, "The submission could not be processed.", "rejected"); // honeypot
  await verifyTurnstile(env, request, body.turnstileToken);

  const v = validateApplication(body);
  if (!v.ok) throw new ApiError(422, "Please correct the highlighted fields.", "validation", { fields: v.errors });
  const c = v.clean;

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
      return json({ reference, status: "Pending", message: "Your application has been received. Keep your reference number safe: you will need it to check your application status." }, 201);
    } catch (e) {
      if (!/UNIQUE/i.test(String(e && e.message))) throw e; // reference collision: try again
    }
  }
  throw new ApiError(500, "Could not save your application. Please try again.", "server_error");
});
