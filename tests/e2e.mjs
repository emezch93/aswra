// End to end API tests. Run against a local `wrangler pages dev` server:
//   npm run db:migrate:local && npm run dev   (terminal 1)
//   npm test                                   (terminal 2)
// Needs ADMIN_SETUP_TOKEN (same value as in .dev.vars) and a fresh local database.
import { execSync } from "node:child_process";
import fs from "node:fs";
const devVar = (k) => process.env[k] || (fs.existsSync(".dev.vars") && new RegExp(k + "=(.+)").exec(fs.readFileSync(".dev.vars", "utf8"))?.[1]);
const TEST_PASSWORD = devVar("TEST_ADMIN_PASSWORD");
if (!TEST_PASSWORD) { console.error("Set TEST_ADMIN_PASSWORD (12+ characters) in .dev.vars or the environment. It is used only for the local test administrator."); process.exit(2); }


const BASE = process.env.BASE_URL || "http://localhost:8788";
const TOKEN = devVar("ADMIN_SETUP_TOKEN");
const ADMIN = { email: "admin@aswra-test.example", password: TEST_PASSWORD };
let pass = 0, fail = 0; const failures = [];
const sql = (q) => execSync(`npx wrangler d1 execute aswra-membership --local --json --command "${q.replace(/"/g, '\\"')}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const resetLimits = () => sql("DELETE FROM rate_limits");
let ipSeq = 10;
const nextIp = () => `203.0.113.${ipSeq++}`;

async function call(method, path, { body, cookie, csrf, origin = BASE, ip = "198.51.100.1", raw, headers = {} } = {}) {
  const h = { "cf-connecting-ip": ip, ...headers };
  if (body !== undefined && !raw) h["content-type"] = "application/json";
  if (raw && !headers["content-type"]) h["content-type"] = "text/plain";
  if (cookie) h.cookie = cookie;
  if (csrf) h["x-csrf-token"] = csrf;
  if (origin && method !== "GET") h.origin = origin;
  const res = await fetch(BASE + path, { method, headers: h, body: method === "GET" ? undefined : raw ? raw : body !== undefined ? JSON.stringify(body) : undefined, redirect: "manual" });
  const text = await res.text(); let data = null; try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, text, headers: res.headers };
}
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS", name); } else { fail++; failures.push(name); console.log("  FAIL", name, extra); }
}
const section = (t) => console.log("\n" + t);

const valid = (over = {}) => ({
  category: "Individual Recycler Members", applicantName: "Test Applicant", email: "test.applicant@example.com", phone: "08031234567",
  address: "12 Example Street, Awka", lga: "Awka South",
  formData: { ageConfirmed: true, connection: "I reside in Anambra State", activities: ["Waste collection"], materials: "Plastic" },
  declaration: true, privacy: true, ...over,
});
const REF = /^ASWRA-\d{4}-[0-9A-HJKMNP-TV-Z]{12}$/;

async function submit(over, ip = nextIp()) { return call("POST", "/api/applications", { body: valid(over), ip }); }

// ---------------------------------------------------------------------------
section("1. Health and unauthenticated access");
let r = await call("GET", "/api/health");
check("health endpoint returns ok", r.status === 200 && r.data.status === "ok");
check("health reports only non-secret dependency flags", Object.keys(r.data).sort().join() === "checks,status" && Object.keys(r.data.checks).sort().join() === "appSecretConfigured,databaseConnected,turnstileSecretConfigured,turnstileSiteKeyConfigured" && !JSON.stringify(r.data).match(/secret-value|password|token/i));
for (const [m, p] of [["GET", "/api/admin/dashboard"], ["GET", "/api/admin/applications"], ["GET", "/api/admin/applications/1"], ["GET", "/api/admin/applications/1/history"], ["PATCH", "/api/admin/applications/1/status"], ["POST", "/api/admin/applications/1/reviews"], ["POST", "/api/admin/applications/1/decision"], ["POST", "/api/admin/applications/1/communications"], ["PATCH", "/api/admin/communications/1"], ["POST", "/api/admin/logout"], ["GET", "/api/admin/diagnostics"], ["POST", "/api/admin/diagnostics"]]) {
  r = await call(m, p, { body: {} });
  check(`${m} ${p} rejects anonymous users (401)`, r.status === 401, r.status);
}
r = await call("GET", "/api/admin/session");
check("session endpoint reports unauthenticated", r.status === 200 && r.data.authenticated === false);

section("2. One time administrator setup");
r = await call("POST", "/api/admin/setup", { body: ADMIN });
check("setup without token is refused", r.status === 403);
r = await call("POST", "/api/admin/setup", { body: ADMIN, headers: { "x-setup-token": "wrong" } });
check("setup with wrong token is refused", r.status === 403);
r = await call("POST", "/api/admin/setup", { body: { email: ADMIN.email, password: "short1" }, headers: { "x-setup-token": TOKEN } });
check("setup rejects a weak password", r.status === 422 && r.data.code === "weak_password");
r = await call("POST", "/api/admin/setup", { body: ADMIN, headers: { "x-setup-token": TOKEN } });
check("setup with correct token creates the administrator", r.status === 201);
r = await call("POST", "/api/admin/setup", { body: { email: "second@aswra-test.example", password: "Another-Strong-Pass-77" }, headers: { "x-setup-token": TOKEN } });
check("setup cannot be reused", r.status === 403 && r.data.code === "setup_done");
try { sql("INSERT INTO admin_users (email,password_hash) VALUES ('x@y.zz','h')"); check("database refuses a second administrator row", false); }
catch { check("database refuses a second administrator row", true); }
const hashRow = JSON.parse(sql("SELECT password_hash FROM admin_users"))[0].results[0].password_hash;
check("password is stored hashed (PBKDF2), not plaintext", hashRow.startsWith("pbkdf2-sha256$100000$") && !hashRow.includes(ADMIN.password));

section("3. Login, session and cookies");
resetLimits();
r = await call("POST", "/api/admin/login", { body: { email: ADMIN.email, password: "wrong-password-1" }, ip: nextIp() });
const badMsg = r.data?.error;
check("wrong password is rejected", r.status === 401);
r = await call("POST", "/api/admin/login", { body: { email: "nobody@example.com", password: "wrong-password-1" }, ip: nextIp() });
check("unknown email gives the same generic message", r.status === 401 && r.data.error === badMsg);
r = await call("POST", "/api/admin/login", { body: ADMIN, ip: nextIp() });
check("correct credentials log in", r.status === 200 && r.data.authenticated === true);
const setCookie = r.headers.get("set-cookie") || "";
check("cookie is HttpOnly", /HttpOnly/i.test(setCookie));
check("cookie is SameSite=Strict", /SameSite=Strict/i.test(setCookie));
check("cookie has a lifetime (Max-Age)", /Max-Age=\d+/.test(setCookie));
check("password is never returned", !r.text.includes(ADMIN.password) && !/hash/i.test(r.text));
const cookie = setCookie.split(";")[0];
const csrf = r.data.csrfToken;
const A = { cookie, csrf };
r = await call("GET", "/api/admin/session", { cookie });
check("session endpoint reports authenticated", r.data.authenticated === true && r.data.email === ADMIN.email);
const tokenInDb = JSON.parse(sql("SELECT token_hash FROM admin_sessions"))[0].results[0].token_hash;
check("raw session token is not stored (hash only)", !cookie.includes(tokenInDb) && tokenInDb.length === 64);

section("4. Application submission and server side validation");
resetLimits();
r = await submit();
check("valid individual application is saved (201)", r.status === 201 && REF.test(r.data.reference), JSON.stringify(r.data));
check("response status is Pending and not Approved", r.data.status === "Pending");
const ref1 = r.data.reference;
r = await submit({ email: "dup2@example.com" });
const ref2 = r.data.reference;
check("references are unique", ref1 !== ref2 && !!ref2);
check("references are not sequential or guessable (no digits only suffix pattern)", !/^ASWRA-\d{4}-0+\d$/.test(ref1));
r = await submit();
check("exact duplicate submission is refused (409)", r.status === 409 && r.data.code === "duplicate");
const cats = [
  ["Recycling Business Members", { applicantName: "GreenLoop Recyclers Ltd", contactPerson: "Jane Doe", email: "biz@example.com", formData: { businessType: "Recycling processor or aggregator", registrationStatus: "Registered business", registrationNumber: "RC123", materials: "PET", description: "We bale plastics." } }],
  ["Cooperative Members", { applicantName: "Awka Thrift Cooperative", contactPerson: "John Doe", email: "coop@example.com", formData: { cooperativeType: "Waste sector thrift cooperative society", registrationStatus: "Registered cooperative" } }],
  ["Institutional Members", { applicantName: "Clean Anambra NGO", contactPerson: "Mary Doe", email: "ngo@example.com", formData: { institutionType: "Non-governmental organisation", alignment: "We run clean up campaigns." } }],
  ["Strategic and Corporate Partners", { applicantName: "Example Producer Plc", contactPerson: "Sam Doe", email: "partner@example.com", formData: { partnerType: "Development partner", partnershipInterest: "Support training programmes." } }],
];
const refs = {};
for (const [category, over] of cats) { r = await submit({ category, ...over }); check(`valid ${category} application saved`, r.status === 201, JSON.stringify(r.data)); refs[category] = r.data.reference; }
r = await submit({ category: "Recycling Business Members", applicantName: "No Contact Ltd", email: "nc@example.com", formData: { businessType: "Recycling processor or aggregator", registrationStatus: "Registered business" } });
check("organisation without contact person is rejected", r.status === 422 && r.data.fields.contactPerson);
r = await submit({ email: "not-an-email" }); check("invalid email rejected", r.status === 422 && r.data.fields.email);
r = await submit({ phone: "12345" }); check("invalid phone rejected", r.status === 422 && r.data.fields.phone);
r = await submit({ phone: "+2348031234500", email: "intl@example.com", applicantName: "Intl Phone" }); check("+234 phone accepted", r.status === 201);
r = await submit({ lga: "Lagos Island" }); check("LGA outside Anambra list rejected", r.status === 422 && r.data.fields.lga);
r = await submit({ category: "Made Up Members" }); check("unknown category rejected", r.status === 422 && r.data.fields.category);
r = await submit({ declaration: false }); check("declaration is mandatory", r.status === 422 && r.data.fields.declaration);
r = await submit({ privacy: false }); check("privacy consent is mandatory", r.status === 422 && r.data.fields.privacy);
r = await submit({ formData: { ageConfirmed: false, connection: "I reside in Anambra State", activities: ["Waste collection"] } }); check("age confirmation is mandatory for individuals", r.status === 422 && r.data.fields.ageConfirmed);
r = await submit({ formData: { ageConfirmed: true, connection: "Hacked", activities: ["Waste collection"] } }); check("select value outside options rejected", r.status === 422 && r.data.fields.connection);
r = await submit({ formData: { ageConfirmed: true, connection: "I reside in Anambra State", activities: ["Bogus"] } }); check("checkbox value outside options rejected", r.status === 422 && r.data.fields.activities);
r = await submit({ applicantName: "A" }); check("too short name rejected", r.status === 422 && r.data.fields.applicantName);
r = await submit({ website: "http://spam.example" }); check("honeypot field rejects bots", r.status === 400);
r = await call("POST", "/api/applications", { raw: "not json", ip: nextIp() }); check("non JSON content type rejected (415)", r.status === 415);
r = await call("POST", "/api/applications", { raw: "x", headers: { "content-type": "application/json" }, ip: nextIp() }); check("malformed JSON rejected (400)", r.status === 400);
r = await submit({ address: "x".repeat(25000) }); check("oversized body rejected (413)", r.status === 413);
const xss = "<script>alert(1)</script> O'Brien";
r = await submit({ applicantName: xss, email: "xss@example.com" });
check("markup in text is accepted as plain text (escaped on output)", r.status === 201);
const xssRef = r.data.reference;
r = await submit({ applicantName: "Robert'); DROP TABLE applications;--", email: "sqli@example.com" });
check("SQL injection text is stored harmlessly", r.status === 201);
r = await call("GET", "/api/admin/dashboard", A);
check("applications table still exists after injection attempt", r.status === 200 && r.data.total >= 9, JSON.stringify(r.data));

section("5. Public status checking");
resetLimits();
const pip = nextIp();
r = await call("GET", `/api/application-status?reference=${ref1}`, { ip: pip });
check("valid reference returns Pending", r.status === 200 && r.data.status === "Pending");
check("public response contains only status, message and update time", Object.keys(r.data).sort().join() === "message,status,updatedAt", Object.keys(r.data).join());
check("no personal data in public response", !/test\.applicant|0803|Awka South|Test Applicant/i.test(r.text));
r = await call("GET", `/api/application-status?reference=${ref1.toLowerCase()}`, { ip: pip }); check("lower case reference accepted", r.status === 200);
const nf = await call("GET", "/api/application-status?reference=ASWRA-2026-ZZZZZZZZZZZZ", { ip: pip });
check("unknown reference returns a safe 404", nf.status === 404 && /could not find/i.test(nf.data.error));
r = await call("GET", "/api/application-status?reference=garbage", { ip: pip }); check("malformed reference gives the same safe message", r.status === 404 && r.data.error === nf.data.error);
r = await call("GET", "/api/application-status?reference=" + encodeURIComponent("' OR '1'='1"), { ip: pip }); check("SQL injection in reference is harmless", r.status === 404);
r = await call("GET", "/api/application-status", { ip: pip }); check("missing reference handled", r.status === 404);

section("6. Dashboard, search, filters, sorting, pagination");
r = await call("GET", "/api/admin/dashboard", A);
check("dashboard counts come from the database", r.data.total >= 9 && r.data.byStatus.Pending === r.data.total, JSON.stringify(r.data));
r = await call("GET", "/api/admin/applications", A);
check("list returns applications with required columns", r.status === 200 && r.data.items[0].reference && r.data.items[0].name && r.data.items[0].category && r.data.items[0].submittedAt && r.data.items[0].status);
check("list does not expose email or phone", !("email" in r.data.items[0]) && !("phone" in r.data.items[0]));
r = await call("GET", "/api/admin/applications?q=GreenLoop", A); check("search by name", r.data.total === 1 && r.data.items[0].name.includes("GreenLoop"));
r = await call("GET", `/api/admin/applications?q=${ref2}`, A); check("search by reference", r.data.total === 1);
r = await call("GET", "/api/admin/applications?q=" + encodeURIComponent("coop@example.com"), A); check("search by email", r.data.total === 1);
r = await call("GET", "/api/admin/applications?category=" + encodeURIComponent("Cooperative Members"), A); check("filter by category", r.data.total === 1);
r = await call("GET", "/api/admin/applications?status=Pending", A); check("filter by status", r.data.total >= 9);
r = await call("GET", "/api/admin/applications?status=Approved", A); check("empty result set handled", r.data.total === 0 && r.data.items.length === 0);
r = await call("GET", "/api/admin/applications?sort=name&dir=asc", A); const names = r.data.items.map((i) => i.name.toLowerCase()); check("sort by name ascending", names.join() === [...names].sort().join());
r = await call("GET", "/api/admin/applications?pageSize=5&page=2", A); check("pagination", r.data.items.length === r.data.total - 5 && r.data.page === 2 && r.data.pages === 2 && r.data.pageSize === 5);
r = await call("GET", "/api/admin/applications?q=" + encodeURIComponent("' OR 1=1 --"), A); check("SQL injection in search is harmless", r.status === 200 && r.data.total === 0);
r = await call("GET", "/api/admin/applications?q=%25", A); check("LIKE wildcard in search is escaped", r.status === 200 && r.data.total === 0);
r = await call("GET", "/api/admin/applications?sort=" + encodeURIComponent("id; DROP TABLE applications") + "&dir=sideways", A); check("injected sort column is ignored", r.status === 200 && r.data.total >= 9);
r = await call("GET", "/api/admin/applications/abc", A); check("non numeric id rejected", r.status === 404);
r = await call("GET", "/api/admin/applications/999999", A); check("unknown id returns 404", r.status === 404);

section("7. Application detail");
const list = (await call("GET", `/api/admin/applications?q=${ref1}`, A)).data.items[0];
const id1 = list.id;
r = await call("GET", `/api/admin/applications/${id1}`, A);
check("detail returns full submitted information", r.status === 200 && r.data.application.email === "test.applicant@example.com" && r.data.application.formData.materials === "Plastic" && r.data.application.declarationAccepted);
check("history starts with the submission entry", r.data.history.length === 1 && r.data.history[0].change_type === "submission" && r.data.history[0].new_status === "Pending");

section("8. Review workflow: approval path");
const S = (id, body) => call("PATCH", `/api/admin/applications/${id}/status`, { ...A, body });
const D = (id, body) => call("POST", `/api/admin/applications/${id}/decision`, { ...A, body });
const V = (id, body) => call("POST", `/api/admin/applications/${id}/reviews`, { ...A, body });
r = await D(id1, { decision: "Approved", confirmed: true }); check("cannot approve a Pending application", r.status === 409);
r = await S(id1, { status: "Approved" }); check("status endpoint cannot set Approved", r.status === 422 && r.data.code === "use_decision");
r = await S(id1, { status: "Rejected" }); check("status endpoint cannot set Rejected", r.status === 422);
r = await S(id1, { status: "Recommended for Approval" }); check("cannot skip Under Review", r.status === 409);
r = await S(id1, { status: "Nonsense" }); check("unknown status rejected", r.status === 422);
r = await S(id1, { status: "Under Review", internalNote: "Starting review" }); check("Pending to Under Review", r.status === 200);
r = await V(id1, { notes: "SECRET-INTERNAL-NOTE-123 identity looks fine", recommendation: "None" }); check("private review note saved", r.status === 201);
r = await S(id1, { status: "Requires Information" }); check("Requires Information needs an applicant facing message", r.status === 422);
r = await S(id1, { status: "Requires Information", internalNote: "ask for proof of address", publicMessage: "Please send a proof of your operating address by email." });
check("request additional information", r.status === 200);
r = await call("GET", `/api/application-status?reference=${ref1}`, { ip: pip });
check("applicant sees the applicant facing message", r.data.status === "Requires Information" && /proof of your operating address/.test(r.data.message));
r = await V(id1, { notes: "Trying to recommend too early", recommendation: "Approve" }); check("cannot recommend from Requires Information", r.status === 409);
r = await S(id1, { status: "Under Review" }); check("back to Under Review", r.status === 200);
r = await call("GET", `/api/application-status?reference=${ref1}`, { ip: pip }); check("old applicant message is cleared after status change", r.data.message === null);
r = await V(id1, { notes: "SECRET-RECOMMENDATION-NOTE satisfied with documents", recommendation: "Approve" }); check("record recommendation to approve", r.status === 201);
r = await call("GET", `/api/application-status?reference=${ref1}`, { ip: pip });
check("recommendation is NOT presented as approval", r.data.status === "Recommended for Approval");
r = await D(id1, { decision: "Approved" }); check("decision requires explicit confirmation", r.status === 422);
r = await D(id1, { decision: "Approved", confirmed: true, internalNote: "SECRET-DECISION-NOTE", publicMessage: "Welcome to ASWRA." }); check("official approval recorded", r.status === 200 && r.data.status === "Approved");
r = await call("GET", `/api/application-status?reference=${ref1}`, { ip: pip });
check("applicant sees Approved with message", r.data.status === "Approved" && r.data.message === "Welcome to ASWRA.");
check("internal notes never appear publicly", !/SECRET/.test(r.text));
r = await S(id1, { status: "Under Review" }); check("final decision cannot be reversed by status change", r.status === 409 && r.data.code === "final");
r = await D(id1, { decision: "Rejected", confirmed: true, reasonCategory: "Eligibility requirements not met", internalNote: "changing my mind" }); check("final decision cannot be changed", r.status === 409);
r = await call("GET", `/api/admin/applications/${id1}`, A);
check("full history retained (submission, review, info request, recommendation, decision)", r.data.history.length >= 6, String(r.data.history.length));
check("history keeps previous status and notes", r.data.history.some((h) => h.previous_status === "Under Review" && h.new_status === "Requires Information" && /proof/.test(h.internal_note)));
check("review notes retained", r.data.reviews.length === 2);
check("decided_at is recorded", !!r.data.application.decidedAt);
try { sql("UPDATE application_status_history SET new_status='Pending' WHERE id=1"); check("history cannot be edited in the database", false); } catch { check("history cannot be edited in the database", true); }
try { sql("DELETE FROM audit_logs"); check("audit log cannot be deleted", false); } catch { check("audit log cannot be deleted", true); }

section("9. Review workflow: rejection path");
const id2 = (await call("GET", `/api/admin/applications?q=${ref2}`, A)).data.items[0].id;
await S(id2, { status: "Under Review" });
r = await D(id2, { decision: "Rejected", confirmed: true }); check("rejection needs a reason and explanation", r.status === 422);
r = await D(id2, { decision: "Rejected", confirmed: true, reasonCategory: "Made up", internalNote: "long enough explanation" }); check("rejection reason must be a listed category", r.status === 422);
r = await V(id2, { notes: "Information could not be verified", recommendation: "Reject" }); check("record recommendation to reject", r.status === 201);
r = await call("GET", `/api/application-status?reference=${ref2}`, { ip: pip }); check("rejection recommendation is not shown as Rejected", r.data.status === "Recommended for Rejection");
r = await D(id2, { decision: "Rejected", confirmed: true, reasonCategory: "Submitted information could not be verified", internalNote: "Phone number was unreachable", publicMessage: "We could not verify your contact details." }); check("official rejection recorded", r.status === 200 && r.data.status === "Rejected");
r = await call("GET", `/api/application-status?reference=${ref2}`, { ip: pip }); check("applicant sees Rejected and the published reason", r.data.status === "Rejected" && /could not verify/.test(r.data.message));
r = await call("GET", `/api/admin/applications/${id2}`, A); check("rejection reason stored in history", r.data.history[0].internal_note.startsWith("Reason: Submitted information could not be verified"));
r = await call("GET", "/api/admin/dashboard", A); check("dashboard reflects Approved and Rejected", r.data.byStatus.Approved === 1 && r.data.byStatus.Rejected === 1);

section("10. Manual email workflow records");
const C = (id, body) => call("POST", `/api/admin/applications/${id}/communications`, { ...A, body });
const goodBody = "Dear Test Applicant,\n\nCongratulations! Your application " + ref1 + " has been approved.\n\nKind regards,\nMembership Administrator";
r = await C(id1, { type: "approval", subject: "Congratulations! Your ASWRA Membership Application Has Been Approved", body: "Dear [Applicant Name], hello there from the association." }); check("unfilled template placeholder is rejected", r.status === 422);
r = await C(id1, { type: "approval", subject: "", body: goodBody }); check("empty subject rejected", r.status === 422);
r = await C(id1, { type: "approval", subject: "Hi", body: "short" }); check("message too short rejected", r.status === 422);
r = await C(id1, { type: "wizardry", subject: "Subject here", body: goodBody }); check("unknown message type rejected", r.status === 422);
r = await C(id1, { type: "approval", subject: "Congratulations! Your ASWRA Membership Application Has Been Approved", body: goodBody, recipient: "attacker@evil.example" });
check("communication saved as Prepared, not Sent", r.status === 201 && r.data.communication.status === "Prepared" && r.data.communication.sent_recorded_at === null);
check("recipient comes from the application, not the client", r.data.communication.recipient === "test.applicant@example.com");
check("message body keeps the application reference", r.data.communication.body.includes(ref1));
const commId = r.data.communication.id;
r = await call("PATCH", `/api/admin/communications/${commId}`, { ...A, body: { status: "Delivered" } }); check("cannot record a status other than Marked as Sent", r.status === 422);
r = await call("PATCH", `/api/admin/communications/${commId}`, { ...A, body: { status: "Marked as Sent" } }); check("administrator can mark a message as sent", r.status === 200);
r = await call("PATCH", `/api/admin/communications/${commId}`, { ...A, body: { status: "Marked as Sent" } }); check("marking twice is refused", r.status === 409);
r = await call("GET", `/api/admin/applications/${id1}`, A);
check("communication record shows Marked as Sent with a timestamp", r.data.communications[0].status === "Marked as Sent" && !!r.data.communications[0].sent_recorded_at);
r = await C(id2, { type: "rejection", subject: "Update on Your ASWRA Membership Application", body: "Dear Applicant,\n\nReason: Phone number was unreachable.\n\nKind regards,\nMembership Administrator" });
check("rejection email record saved", r.status === 201);
r = await C(id2, { type: "additional_information", subject: "Additional Information Required", body: "Dear Applicant,\n\nPlease send your proof of address by email.\n\nKind regards" }); check("additional information record saved", r.status === 201);

section("11. CSRF and origin protection");
r = await call("PATCH", `/api/admin/applications/${id2}/status`, { cookie, body: { status: "Under Review" } }); check("state change without CSRF token rejected", r.status === 403);
r = await call("PATCH", `/api/admin/applications/${id2}/status`, { cookie, csrf: "wrong", body: { status: "Under Review" } }); check("state change with wrong CSRF token rejected", r.status === 403);
r = await call("POST", `/api/admin/applications/${id2}/reviews`, { cookie, csrf, origin: "https://evil.example", body: { notes: "evil note", recommendation: "None" } }); check("cross site origin rejected even with a valid token", r.status === 403);
r = await call("POST", `/api/admin/applications/${id2}/reviews`, { cookie, csrf, origin: null, body: { notes: "no origin note", recommendation: "None" } }); check("missing Origin header rejected", r.status === 403);

section("12. Static files, headers and secrets");
for (const p of ["/docs/DEPLOYMENT.md", "/migrations/0001_initial_schema.sql", "/wrangler.toml", "/package.json", "/functions/_lib/auth.js", "/scripts/secure-admin-setup.js", "/.dev.vars", "/.dev.vars.example", "/tests/e2e.mjs", "/README.md"]) {
  r = await call("GET", p); check(`private file ${p} is not served`, r.status === 404, r.status);
}
r = await call("GET", "/api/health");
check("security headers on API responses", /default-src 'self'/.test(r.headers.get("content-security-policy") || "") && r.headers.get("x-content-type-options") === "nosniff" && r.headers.get("x-frame-options") === "DENY");
check("API responses are not cacheable", /no-store/.test(r.headers.get("cache-control") || ""));
r = await call("GET", "/api/config"); check("public config exposes no secrets", !/secret|APP_SECRET|SETUP/i.test(r.text));

section("13. Audit log");
const audits = JSON.parse(sql("SELECT action, COUNT(*) AS c FROM audit_logs GROUP BY action"))[0].results;
const have = new Set(audits.map((a) => a.action));
for (const a of ["admin.setup", "admin.login", "admin.login_failed", "application.status", "application.recommendation", "application.decision", "application.review_note", "communication.prepared", "communication.marked_sent"]) check(`audit log records ${a}`, have.has(a));

section("14. Session expiry and logout");
sql("UPDATE admin_sessions SET expires_at = datetime('now','-1 minute')");
r = await call("GET", "/api/admin/dashboard", A); check("expired session is rejected", r.status === 401);
resetLimits();
r = await call("POST", "/api/admin/login", { body: ADMIN, ip: nextIp() });
const c2 = r.headers.get("set-cookie").split(";")[0], t2 = r.data.csrfToken;
sql("UPDATE admin_sessions SET last_seen_at = datetime('now','-3 hours')");
r = await call("GET", "/api/admin/dashboard", { cookie: c2 }); check("idle session (3 hours) is rejected", r.status === 401);
r = await call("POST", "/api/admin/login", { body: ADMIN, ip: nextIp() });
const c3 = r.headers.get("set-cookie").split(";")[0], t3 = r.data.csrfToken;
r = await call("GET", "/api/admin/dashboard", { cookie: c3 }); check("fresh session works", r.status === 200);
r = await call("POST", "/api/admin/logout", { cookie: c3, csrf: t3 }); check("logout succeeds", r.status === 200 && /Max-Age=0/.test(r.headers.get("set-cookie") || ""));
r = await call("GET", "/api/admin/dashboard", { cookie: c3 }); check("session is invalid after logout (server side)", r.status === 401);

section("15. Rate limiting");
resetLimits();
const lip = nextIp(); let last;
for (let i = 0; i < 6; i++) last = await call("POST", "/api/admin/login", { body: { email: ADMIN.email, password: "bad-password-" + i }, ip: lip });
check("login is rate limited after repeated failures (429)", last.status === 429 && !!last.headers.get("retry-after"));
r = await call("POST", "/api/admin/login", { body: ADMIN, ip: lip }); check("correct password also blocked while rate limited", r.status === 429);
resetLimits();
import crypto from "node:crypto";
const APP_SECRET = devVar("APP_SECRET");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const keyFor = (ip, name) => sha(`${APP_SECRET}|rl:${name}:${sha(`${APP_SECRET}|ip:${ip}`)}`);   // mirrors functions/_lib (keyed hash)
const setCounter = (key, count, ageSeconds = 0) => sql(`INSERT OR REPLACE INTO rate_limits (key, window_start, count) VALUES ('${key}', ${Math.floor(Date.now() / 1000) - ageSeconds}, ${count})`);
let n = 0; const fresh = (extra = {}) => valid({ email: `rl${Date.now()}${n++}@example.com`, applicantName: `Allowance Test ${n}`, ...extra });
const post = (ip, body) => call("POST", "/api/applications", { body, ip });

const ipA = nextIp(); let allInvalid = true;
for (let i = 0; i < 40; i++) { const r = await post(ipA, { ...fresh(), phone: "bad" }); if (r.status !== 422) allInvalid = false; }
check("40 invalid submissions are rejected (422) without being rate limited", allInvalid);
r = await post(ipA, fresh()); check("invalid submissions did not use up the successful application allowance", r.status === 201, r.status);
const dupBody = fresh(); r = await post(ipA, dupBody); check("first copy of a submission is saved", r.status === 201);
let dupOk = true; for (let i = 0; i < 35; i++) { const d2 = await post(ipA, dupBody); if (d2.status !== 409) dupOk = false; }
check("35 duplicate submissions are refused (409) without being rate limited", dupOk);
r = await post(ipA, fresh()); check("duplicates did not use up the allowance", r.status === 201, r.status);

resetLimits();
const ipB = nextIp(); let okCount = 0, lastB;
for (let i = 0; i < 30; i++) { lastB = await post(ipB, fresh()); if (lastB.status === 201) okCount++; }
check("30 successful applications per hour from one IP are all accepted", okCount === 30, `accepted ${okCount}`);
lastB = await post(ipB, fresh());
check("the 31st successful application in an hour is refused (429)", lastB.status === 429);
const ra = Number(lastB.headers.get("retry-after"));
check("retry time is reported and is within one hour", ra > 0 && ra <= 3600, String(ra));
r = await post(nextIp(), fresh()); check("a different IP address is not affected", r.status === 201);
r = await post(ipB, { ...fresh(), phone: "bad" }); check("a blocked IP still gets a 429 and not a validation answer", r.status === 429);

resetLimits();
const ipC = nextIp();
setCounter(keyFor(ipC, "apply:ok:d"), 100, 100);
r = await post(ipC, fresh()); check("the daily limit (100 successful applications) is enforced", r.status === 429 && Number(r.headers.get("retry-after")) > 80000, `${r.status} ${r.headers.get("retry-after")}`);
const ipD = nextIp();
setCounter(keyFor(ipD, "apply:ok:h"), 30, 4000);
r = await post(ipD, fresh()); check("an expired hourly window no longer blocks the applicant", r.status === 201, String(r.status));
const ipE = nextIp();
setCounter(keyFor(ipE, "apply:h"), 999, 10); setCounter(keyFor(ipE, "apply:d"), 999, 10);
r = await post(ipE, fresh()); check("leftover counters from the old limit scheme (old key names) do not block anyone", r.status === 201, String(r.status));
const ipF = nextIp();
setCounter(keyFor(ipF, "apply:try"), 120, 10);
r = await post(ipF, fresh()); check("the overall request flood guard (120 per hour) still works", r.status === 429);
resetLimits();
const sip = nextIp(); let lastS;
for (let i = 0; i < 62; i++) lastS = await call("GET", "/api/application-status?reference=ASWRA-2026-AAAAAAAAAAAA", { ip: sip });
check("status lookups are rate limited (429)", lastS.status === 429);

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
