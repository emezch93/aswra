import { handle, json } from "../../_lib/http.js";
import { getSession } from "../../_lib/auth.js";

// Lets the dashboard check whether the browser holds a valid session. Never errors for anonymous visitors.
export const onRequestGet = handle(async ({ request, env }) => {
  const s = await getSession(env, request);
  return s ? json({ authenticated: true, email: s.email, csrfToken: s.csrf_token }) : json({ authenticated: false });
});
