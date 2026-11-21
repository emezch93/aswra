// Turnstile tests. A small local server stands in for Cloudflare's Siteverify endpoint so that the REAL server side
// verification code runs end to end (request format, error handling, token reuse, diagnostics).
// It cannot prove that real Cloudflare keys work: see docs/TESTING.md ("not tested").
//   node tests/turnstile.mjs        (needs: npm install; starts its own temporary servers and database)
import http from "node:http";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";

const devVar = (k) => process.env[k] || (fs.existsSync(".dev.vars") && new RegExp(k + "=(.+)").exec(fs.readFileSync(".dev.vars", "utf8"))?.[1]);
const SETUP = devVar("ADMIN_SETUP_TOKEN"), PW = devVar("TEST_ADMIN_PASSWORD");
const ADMIN = { email: "admin@aswra-test.example", password: PW };
const MOCK_PORT = 8791, DEV_PORT = 8792, PROD_PORT = 8793, STATE = ".wrangler/ts-state";
let pass = 0, fail = 0; const failures = [];
const check = (n, c, x = "") => { if (c) { pass++; console.log("  PASS", n); } else { fail++; failures.push(n); console.log("  FAIL", n, x); } };
const section = (t) => console.log("\n" + t);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- the stand in for https://challenges.cloudflare.com/turnstile/v0/siteverify ---- */
const calls = []; const used = new Set(); let rejectSecret = false;
const mock = http.createServer((req, res) => {
  let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
    const p = new URLSearchParams(raw); const rec = { method: req.method, url: req.url, type: req.headers["content-type"], secret: p.get("secret"), response: p.get("response"), remoteip: p.get("remoteip"), idem: p.get("idempotency_key") };
    calls.push(rec); const out = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    const tok = rec.response;
    if (!rec.secret) return out({ success: false, "error-codes": ["missing-input-secret"] });
    if (rec.secret !== "mock-secret" || rejectSecret) return out({ success: false, "error-codes": ["invalid-input-secret"] });
    if (!tok) return out({ success: false, "error-codes": ["missing-input-response"] });
    if (tok === "boom") return out({ success: false }, 500);
    if (tok === "expired-token" || used.has(tok)) return out({ success: false, "error-codes": ["timeout-or-duplicate"] });
    if (tok === "wrong-host") { used.add(tok); return out({ success: true, hostname: "evil.example", action: "membership_application" }); }
    if (tok === "wrong-action") { used.add(tok); return out({ success: true, hostname: "localhost", action: "other_form" }); }
    if (tok.startsWith("good")) { used.add(tok); return out({ success: true, hostname: "localhost", action: "membership_application", challenge_ts: new Date().toISOString() }); }
    return out({ success: false, "error-codes": ["invalid-input-response"] });
  });
});
await new Promise((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));

/* ---- start temporary wrangler servers with an isolated database ---- */
const kids = [];
const wrangler = (port, bindings) => { const k = spawn("npx", ["wrangler", "pages", "dev", ".", "--d1=DB=REPLACE_WITH_YOUR_D1_DATABASE_ID", "--port", String(port), "--persist-to", STATE, ...bindings.flatMap((b) => ["--binding", b])], { env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "1" }, stdio: "ignore" }); kids.push(k); return k; };
async function up(port) { for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://localhost:${port}/api/health`)).ok) return true; } catch {} await sleep(500); } return false; }
const stopAll = () => { for (const k of kids) try { k.kill("SIGTERM"); } catch {} try { execSync("pkill -x workerd", { stdio: "ignore" }); } catch {} };
process.on("exit", stopAll);
fs.rmSync(STATE, { recursive: true, force: true });
execSync(`npx wrangler d1 migrations apply aswra-membership --local --persist-to ${STATE}`, { stdio: "ignore", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" } });
const KEYS = ["TURNSTILE_SECRET=mock-secret", "TURNSTILE_SITE_KEY=0x4TestSiteKeyOnly", `TURNSTILE_VERIFY_URL=http://127.0.0.1:${MOCK_PORT}/siteverify`];
wrangler(DEV_PORT, KEYS);
check("test server (Turnstile configured) started", await up(DEV_PORT));
const BASE = `http://localhost:${DEV_PORT}`;

let ipN = 1;
const valid = (over = {}) => ({ category: "Individual Recycler Members", applicantName: "Turnstile Tester " + ipN, email: `ts${Date.now()}${ipN}@example.com`, phone: "08031234567", address: "12 Example Street, Awka", lga: "Awka South", formData: { ageConfirmed: true, connection: "I reside in Anambra State", activities: ["Waste collection"] }, declaration: true, privacy: true, ...over });
async function apply(token, over = {}, ip = `198.51.100.${ipN++}`, base = BASE) {
  const body = valid(over); if (token !== undefined) body.turnstileToken = token;
  const res = await fetch(base + "/api/applications", { method: "POST", headers: { "content-type": "application/json", origin: base, "cf-connecting-ip": ip }, body: JSON.stringify(body) });
  const text = await res.text(); let data = {}; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text };
}

section("1. Public configuration");
let cfg = await (await fetch(BASE + "/api/config")).json();
check("config exposes the site key and the action name", cfg.turnstileSiteKey === "0x4TestSiteKeyOnly" && cfg.turnstileAction === "membership_application");
check("config does not expose the secret key", !JSON.stringify(cfg).includes("mock-secret") && cfg.captchaBypassed === false);

section("2. Server side verification is really performed");
calls.length = 0; let r = await apply("good-1", {}, "198.51.100.10");
check("a valid token is accepted and the application saved (201)", r.status === 201 && /^ASWRA-/.test(r.data.reference), r.text);
check("Siteverify was called exactly once, server side", calls.length === 1);
const c0 = calls[0] || {};
check("the call is a POST to the Siteverify endpoint using the form encoded format", c0.method === "POST" && /x-www-form-urlencoded/.test(c0.type || ""));
check("the call carries the secret key, the visitor's token and the visitor IP", c0.secret === "mock-secret" && c0.response === "good-1" && c0.remoteip === "198.51.100.10");
check("the call carries an idempotency key (random UUID)", /^[0-9a-f-]{36}$/.test(c0.idem || ""));
check("the secret key never appears in any response to the browser", !r.text.includes("mock-secret"));

section("3. Failure handling");
calls.length = 0; r = await apply(undefined, {}, "198.51.100.11");
check("a missing token is rejected (400) without calling Siteverify", r.status === 400 && r.data.code === "captcha_missing" && calls.length === 0);
r = await apply("not-a-real-token", {}, "198.51.100.12");
check("an invalid token is rejected (400, reason invalid)", r.status === 400 && r.data.code === "captcha_failed" && r.data.reason === "invalid");
r = await apply("expired-token", {}, "198.51.100.13");
check("an expired token is rejected with a helpful message (reason expired)", r.status === 400 && r.data.reason === "expired" && /expired or was already used/.test(r.data.error));
r = await apply("good-reuse", {}, "198.51.100.14"); check("token used once is accepted", r.status === 201);
r = await apply("good-reuse", {}, "198.51.100.14"); check("the same token reused is rejected (reason expired)", r.status === 400 && r.data.reason === "expired");
r = await apply("wrong-host", {}, "198.51.100.15"); check("a token solved on another website is rejected (hostname check)", r.status === 400 && r.data.reason === "mismatch");
r = await apply("wrong-action", {}, "198.51.100.16"); check("a token for a different form is rejected (action check)", r.status === 400 && r.data.reason === "mismatch");
calls.length = 0; r = await apply("boom", {}, "198.51.100.17");
check("a Siteverify outage returns a safe 503 (captcha_unavailable)", r.status === 503 && r.data.code === "captcha_unavailable");
check("the outage is retried once with the SAME idempotency key", calls.length === 2 && calls[0].idem === calls[1].idem, JSON.stringify(calls.map((c) => c.idem)));
check("error responses never contain secrets or internal details", !/mock-secret|stack|siteverify/i.test(r.text));

section("4. Order of checks protects the applicant's token");
calls.length = 0; r = await apply("good-order", { phone: "bad" }, "198.51.100.20");
check("an invalid form is rejected (422) BEFORE Siteverify, so the token is not burned", r.status === 422 && calls.length === 0);
r = await apply("good-order", {}, "198.51.100.20"); check("the same token still works once the form is corrected", r.status === 201);
const dup = valid({ applicantName: "Duplicate Maker", email: "dupmaker@example.com" });
const send = (tok) => fetch(BASE + "/api/applications", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": "198.51.100.21" }, body: JSON.stringify({ ...dup, turnstileToken: tok }) }).then((x) => x.json().then((d) => ({ status: x.status, d })));
check("first copy saved", (await send("good-d1")).status === 201);
const d2 = await send("good-d2"); check("a duplicate (verified) is refused with 409, not reported as a captcha problem", d2.status === 409 && d2.d.code === "duplicate");
r = await fetch(BASE + "/api/applications", { method: "POST", headers: { "content-type": "application/json", origin: "https://evil.example" }, body: JSON.stringify({ ...valid(), turnstileToken: "good-x" }) });
check("a cross site Origin is refused before anything else (403)", r.status === 403);

section("5. Failed verification does not use up the legitimate allowance");
const ipX = "198.51.100.30"; let blocked = false;
for (let i = 0; i < 5; i++) await apply("bad-token-" + i, {}, ipX);
r = await apply("good-after-fail", {}, ipX); check("after 5 failed verifications the next valid application is still accepted", r.status === 201);
let n429 = 0, last;
for (let i = 0; i < 62; i++) { last = await apply("bad-flood-" + i, {}, "198.51.100.31"); if (last.status === 429) { n429++; break; } }
check("repeated failed verifications from one IP are eventually limited (429, 60 per hour)", n429 === 1);

section("6. Misconfigured secret is reported clearly and not blamed on the visitor");
rejectSecret = true; const ipM = "198.51.100.40";
r = await apply("good-m1", {}, ipM);
check("a rejected secret key gives 503 captcha_misconfigured with a safe message", r.status === 503 && r.data.code === "captcha_misconfigured" && !/mock-secret|invalid-input-secret/.test(r.text), r.text);
for (let i = 0; i < 70; i++) await apply("good-m" + i, {}, ipM);
rejectSecret = false; r = await apply("good-after-misconfig", {}, ipM);
check("server misconfiguration is not counted against the visitor (no lockout after 70 attempts)", r.status === 201, r.text);

section("7. Administrator diagnostics");
let a = await fetch(BASE + "/api/admin/diagnostics"); check("diagnostics require a signed in administrator (401)", a.status === 401);
await fetch(BASE + "/api/admin/setup", { method: "POST", headers: { "content-type": "application/json", "x-setup-token": SETUP, "cf-connecting-ip": "203.0.113.200" }, body: JSON.stringify(ADMIN) });
const lg = await fetch(BASE + "/api/admin/login", { method: "POST", headers: { "content-type": "application/json", origin: BASE, "cf-connecting-ip": "203.0.113.201" }, body: JSON.stringify(ADMIN) });
const cookie = (lg.headers.get("set-cookie") || "").split(";")[0], csrf = (await lg.json()).csrfToken;
a = await fetch(BASE + "/api/admin/diagnostics", { headers: { cookie } }); const dg = await a.json();
check("diagnostics report configuration without revealing key values", a.status === 200 && dg.turnstile.siteKeyConfigured && dg.turnstile.secretConfigured && !JSON.stringify(dg).includes("mock-secret") && !JSON.stringify(dg).includes("0x4TestSiteKeyOnly"));
check("diagnostics count failures by reason over 24 hours (expired, invalid, misconfigured, mismatch, unavailable)", ["expired", "invalid", "misconfigured", "mismatch", "unavailable"].every((k) => dg.failuresLast24Hours[k] > 0), JSON.stringify(dg.failuresLast24Hours));
check("diagnostics list recent failures with their Cloudflare error codes", dg.recentFailures.length > 0 && dg.recentFailures.every((f) => f.reason && Array.isArray(f.codes)));
check("a flood of one failure kind cannot hide others (per reason log limit of 20 per hour)", dg.failuresLast24Hours.invalid <= 20 && dg.failuresLast24Hours.misconfigured >= 1);
check("diagnostics warn when the site key and secret may belong to different widgets", dg.warnings.some((w) => /DIFFERENT Turnstile widgets|invalid-input-response/.test(w)) || dg.warnings.some((w) => /Cloudflare rejected the secret/.test(w)));
check("no token or visitor IP is stored in the failure log", !JSON.stringify(dg.recentFailures).match(/good-|bad-|198\.51/));
calls.length = 0; a = await fetch(BASE + "/api/admin/diagnostics", { method: "POST", headers: { cookie, "x-csrf-token": csrf, origin: BASE } });
check("the secret check asks Siteverify with a fake token and reports the secret accepted", (await a.json()).result === "secret_accepted" && calls.length === 1 && calls[0].response === "aswra-diagnostic-probe");
rejectSecret = true; a = await fetch(BASE + "/api/admin/diagnostics", { method: "POST", headers: { cookie, "x-csrf-token": csrf, origin: BASE } });
check("the secret check reports a rejected secret", (await a.json()).result === "secret_rejected"); rejectSecret = false;
a = await fetch(BASE + "/api/admin/diagnostics", { method: "POST", headers: { cookie, origin: BASE } }); check("the secret check requires the CSRF token (403)", a.status === 403);

section("8. Production safety");
wrangler(PROD_PORT, ["ENVIRONMENT=production", ...KEYS]);
check("second test server (production mode) started", await up(PROD_PORT));
calls.length = 0; r = await apply("good-prod", {}, "198.51.100.50", `http://localhost:${PROD_PORT}`);
check("production mode IGNORES the test only Siteverify override (mock never called)", calls.length === 0);
check("production mode talks to the real Cloudflare address (unreachable here, so a safe 503)", r.status === 503 && r.data.code === "captcha_unavailable", r.text);
cfg = await (await fetch(`http://localhost:${PROD_PORT}/api/config`)).json(); check("production mode never reports the local bypass", cfg.captchaBypassed === false);

section("9. Browser behaviour of the form with a Turnstile widget (stand in widget)");
const code = buildSync({ entryPoints: ["assets/js/apply.js"], bundle: true, format: "iife", write: false, logLevel: "silent" }).outputFiles[0].text;
const html = await (await fetch(BASE + "/membership.html")).text();
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), { url: BASE + "/membership.html", runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window, d = w.document; let netCalls = 0;
w.fetch = (u, o) => { if (String(u).includes("/api/applications")) netCalls++; return fetch(new URL(u, BASE), { ...o, headers: { ...(o?.headers || {}), origin: BASE, "cf-connecting-ip": "198.51.100.60" } }); };
w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
const renders = [], resets = []; let widgetCallbacks;
w.turnstile = { render: (el, opts) => { renders.push({ el, opts }); widgetCallbacks = opts; el.dataset.rendered = "1"; return "wid-1"; }, reset: (id) => resets.push(id) };
w.eval(code); await sleep(400);
const pick = (i) => { const r = d.querySelectorAll('input[name="category"]')[i]; r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
const script = () => d.head.querySelector('script[src*="challenges.cloudflare.com"]');
check("the Turnstile script is not loaded before a category is chosen", !script() && renders.length === 0);
pick(0); await sleep(100);
check("after choosing a category the widget is rendered once", renders.length === 1);
const first = renders[0];
check("widget uses the site key from the server and the form's action name", first.opts.sitekey === "0x4TestSiteKeyOnly" && first.opts.action === "membership_application");
const hostBefore = first.el.parentNode;
pick(2); pick(4); pick(1); await sleep(100);
check("changing category repeatedly does NOT re-render or move the widget", renders.length === 1 && first.el.parentNode === hostBefore && first.el.isConnected);
const fillForm = () => { const set = (id, v) => { d.getElementById(id).value = v; }; set("c-applicantName", "Browser Tester Ltd"); const cp = d.getElementById("c-contactPerson"); if (cp) cp.value = "Contact Person"; set("c-email", `browser${Date.now()}@example.com`); set("c-phone", "08031230000"); set("c-address", "5 Test Road, Awka"); set("c-lga", "Awka South");
  const sel = (id, i = 1) => { const e = d.getElementById(id); if (e) e.selectedIndex = i; }; sel("f-businessType"); sel("f-registrationStatus"); d.getElementById("d-declaration").checked = true; d.getElementById("d-privacy").checked = true; };
fillForm();
const submitForm = () => d.getElementById("apply-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
netCalls = 0; submitForm(); await sleep(150);
check("submitting before the security check is solved asks the visitor to complete it (no request sent)", netCalls === 0 && /complete the security check/i.test(d.querySelector(".summary").textContent));
widgetCallbacks["error-callback"]("110200"); check("a widget error shows its code and a helpful message", /code 110200/.test(d.getElementById("err-turnstile").textContent));
widgetCallbacks.callback("good-ui-1"); check("solving the check clears the message", d.getElementById("err-turnstile").textContent === "");
widgetCallbacks["expired-callback"](); check("an expired check asks the visitor to repeat it", /expired/i.test(d.getElementById("err-turnstile").textContent));
d.getElementById("c-phone").value = "123"; widgetCallbacks.callback("good-ui-2"); netCalls = 0; submitForm(); await sleep(150);
check("a browser side validation error does not reset or burn the token", netCalls === 0 && resets.length === 0);
d.getElementById("c-phone").value = "08031230000"; calls.length = 0; widgetCallbacks.callback("not-valid-token"); submitForm(); await sleep(1200);
check("a rejected token shows the server's message and resets the widget for a fresh token", /could not be confirmed|verification/i.test(d.querySelector(".summary").textContent) && resets.length === 1);
widgetCallbacks.callback("good-ui-3"); submitForm();
const done = await (async () => { for (let i = 0; i < 40; i++) { if (d.getElementById("apply-done")) return true; await sleep(100); } return false; })();
check("with a valid token the application is submitted and the reference shown", done && /ASWRA-\d{4}-/.test(d.querySelector(".ref")?.textContent || ""));
check("the token sent to the server was the one the widget produced", calls.some((c) => c.response === "good-ui-3"));
mock.close(); stopAll();

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
process.exit(0);
