import { handle, json } from "../_lib/http.js";
import { cleanKey, turnstileSecret } from "../_lib/guards.js";

// Public, non-secret operational diagnostics. Never return secret values.
export const onRequestGet = handle(async ({ env }) => {
  let databaseConnected = false;
  try {
    await env.DB.prepare("SELECT 1").first();
    databaseConnected = true;
  } catch { /* report the dependency state without leaking provider details */ }

  const checks = {
    databaseConnected,
    appSecretConfigured: !!env.APP_SECRET,
    turnstileSiteKeyConfigured: !!cleanKey(env.TURNSTILE_SITE_KEY),
    turnstileSecretConfigured: !!turnstileSecret(env),
  };

  // Preserve the endpoint's historical HTTP 200 semantics for a live database.
  // Configuration readiness is reported separately so operators can diagnose
  // login and application failures without exposing any credential.
  return json({ status: databaseConnected ? "ok" : "unavailable", checks }, databaseConnected ? 200 : 503);
});
