import { handle, json, isLocalhost } from "../_lib/http.js";

// Public browser configuration. Contains no secrets.
export const onRequestGet = handle(async ({ env, request }) => {
  const bypass = !env.TURNSTILE_SECRET && env.ENVIRONMENT === "development" && isLocalhost(request);
  return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null, captchaBypassed: bypass });
});
