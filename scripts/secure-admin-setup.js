#!/usr/bin/env node
// Creates the single ASWRA administrator account (one time only).
//
//   ADMIN_SETUP_TOKEN=<token> SITE_URL=https://your-site.pages.dev node scripts/secure-admin-setup.js
//
// The password is typed here (hidden) and sent over HTTPS to /api/admin/setup. It is never written to a file,
// never stored in Git and never shown on screen. The server hashes it before saving.
const readline = require("node:readline");

const SITE = (process.env.SITE_URL || "http://localhost:8788").replace(/\/$/, "");

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => { if (s.includes(question)) rl.output.write(s); else rl.output.write(""); };
    }
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}

(async () => {
  const token = process.env.ADMIN_SETUP_TOKEN || (await ask("Setup token (hidden): ", true));
  const email = (await ask("Administrator email (use an ASWRA controlled address): ")).trim();
  const password = await ask("Choose a password (min 12 characters, hidden): ", true);
  const again = await ask("Type the password again: ", true);
  if (password !== again) { console.error("Passwords do not match. Nothing was created."); process.exit(1); }

  const res = await fetch(`${SITE}/api/admin/setup`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-setup-token": token },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log("\nAdministrator created for", email);
    console.log("NEXT STEP: delete the ADMIN_SETUP_TOKEN secret in Cloudflare so setup can never be run again.");
  } else {
    console.error(`\nSetup failed (${res.status}): ${data.error || "unknown error"}`);
    process.exit(1);
  }
})();
