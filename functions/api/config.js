import { handle, json } from "../_lib/http.js";
import { captchaBypassed, cleanKey, TURNSTILE_ACTION } from "../_lib/guards.js";

// Public browser configuration. Contains the Turnstile SITE key (public by design) and no secrets.
export const onRequestGet = handle(async ({ env, request }) => {
  return json({ turnstileSiteKey: cleanKey(env.TURNSTILE_SITE_KEY) || null, turnstileAction: TURNSTILE_ACTION, captchaBypassed: captchaBypassed(env, request) });
});
