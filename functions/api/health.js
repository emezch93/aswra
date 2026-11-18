import { handle, json } from "../_lib/http.js";

export const onRequestGet = handle(async ({ env }) => {
  try {
    await env.DB.prepare("SELECT 1").first();
    return json({ status: "ok" });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
});
