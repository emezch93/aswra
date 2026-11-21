// Browser level tests using jsdom (a simulated browser). The real page scripts are bundled and run against
// the real local API and database. Run after `npm run dev` is running:  node tests/ui.mjs
// NOTE: jsdom does not do visual layout, so it cannot test how pages LOOK on different screen sizes.
import { JSDOM } from "jsdom";
import { buildSync } from "esbuild";
import { execSync } from "node:child_process";
import fs from "node:fs";
const devVar = (k) => process.env[k] || (fs.existsSync(".dev.vars") && new RegExp(k + "=(.+)").exec(fs.readFileSync(".dev.vars", "utf8"))?.[1]);
const TEST_PASSWORD = devVar("TEST_ADMIN_PASSWORD");
if (!TEST_PASSWORD) { console.error("Set TEST_ADMIN_PASSWORD (12+ characters) in .dev.vars or the environment. It is used only for the local test administrator."); process.exit(2); }


const BASE = process.env.BASE_URL || "http://localhost:8788";
const ADMIN = { email: "admin@aswra-test.example", password: TEST_PASSWORD };
let pass = 0, fail = 0; const failures = [];
const check = (n, c, x = "") => { if (c) { pass++; console.log("  PASS", n); } else { fail++; failures.push(n); console.log("  FAIL", n, x); } };
const section = (t) => console.log("\n" + t);
const sql = (q) => execSync(`npx wrangler d1 execute aswra-membership --local --json --command "${q}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const bundle = (entry) => buildSync({ entryPoints: [entry], bundle: true, format: "iife", write: false, logLevel: "silent" }).outputFiles[0].text;
const B = { site: bundle("assets/js/site.js"), apply: bundle("assets/js/apply.js"), status: bundle("assets/js/status.js"), admin: bundle("assets/js/admin.js") };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch {} await sleep(40); } return null; }

const TOKEN = devVar("ADMIN_SETUP_TOKEN");
// Make the test self contained: create the administrator if the database is fresh (403 means it already exists).
await fetch(BASE + "/api/admin/setup", { method: "POST", headers: { "content-type": "application/json", "x-setup-token": TOKEN, "cf-connecting-ip": "192.0.2.1" }, body: JSON.stringify(ADMIN) });
let ipN = 100;
async function open(path, scripts, jar = {}) {
  const html = await (await fetch(BASE + path)).text();
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), { url: BASE + path, runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, ip = `192.0.2.${ipN++}`, errors = [];
  w.addEventListener("error", (e) => errors.push(e.message));
  w.fetch = async (u, o = {}) => {
    const url = new URL(u, w.location.href), headers = { ...(o.headers || {}), "cf-connecting-ip": ip };
    if (jar.c) headers.cookie = jar.c;
    if ((o.method || "GET") !== "GET") headers.origin = BASE;
    const res = await fetch(url, { ...o, headers, redirect: "manual" });
    const sc = res.headers.get("set-cookie"); if (sc) jar.c = sc.split(";")[0].includes("=;") || /Max-Age=0/.test(sc) ? "" : sc.split(";")[0];
    return res;
  };
  w.confirm = () => true; w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
  const mails = []; w.__testNavigate = (u) => mails.push(u);
  const copied = []; Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (t) => { copied.push(t); } } });
  for (const s of scripts) w.eval(B[s]);
  return { w, d: w.document, errors, mails, copied, jar };
}
const set = (el, v) => { el.value = v; el.dispatchEvent(new el.ownerDocument.defaultView.Event("input", { bubbles: true })); el.dispatchEvent(new el.ownerDocument.defaultView.Event("change", { bubbles: true })); };
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent("click", { bubbles: true, cancelable: true }));
const submit = (f) => f.dispatchEvent(new f.ownerDocument.defaultView.Event("submit", { bubbles: true, cancelable: true }));
const txt = (d, s) => d.querySelector(s)?.textContent || "";

// ---------------------------------------------------------------------------
section("1. Public pages: availability, structure, links and assets");
const PAGES = ["/", "/about.html", "/activities.html", "/partnerships.html", "/leadership.html", "/membership.html", "/contact.html", "/application-status/", "/privacy.html", "/admin/"];
const seen = new Set();
for (const p of PAGES) {
  const res = await fetch(BASE + p); const html = await res.text();
  check(`${p} loads (200)`, res.status === 200);
  const d = new JSDOM(html).window.document;
  if (p !== "/admin/") {
    check(`${p} has a title, description and exactly one h1`, !!d.title && !!d.querySelector('meta[name="description"]') && d.querySelectorAll("h1").length === 1);
    check(`${p} has lang, skip link, main landmark and navigation`, d.documentElement.lang === "en" && !!d.querySelector(".skip") && !!d.querySelector("main#main") && !!d.querySelector("nav#site-nav"));
    check(`${p} images have alt attributes`, [...d.querySelectorAll("img")].every((i) => i.hasAttribute("alt")));
    check(`${p} has all seven primary nav links (including Partnerships)`, ["index.html", "about.html", "activities.html", "partnerships.html", "leadership.html", "membership.html", "contact.html"].every((h) => [...d.querySelectorAll("#site-nav a")].some((a) => a.getAttribute("href").endsWith(h))));
  }
  check(`${p} has no inline scripts or style attributes (CSP safe)`, !/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html) && !/\sstyle=/.test(html) && !/\son[a-z]+=/i.test(html));
  const refs = [...d.querySelectorAll("a[href],link[href],script[src],img[src]")].map((e) => e.getAttribute("href") || e.getAttribute("src")).filter((u) => u && !/^(https?:|mailto:|tel:|#|data:)/.test(u));
  for (const r of refs) { const u = new URL(r, BASE + p).pathname + (r.includes("?") ? "" : ""); if (seen.has(u)) continue; seen.add(u); const rr = await fetch(BASE + u, { redirect: "follow" }); if (rr.status !== 200) check(`${p} -> ${u} resolves`, false, rr.status); }
}
check("every internal link and asset referenced by the pages resolves (200)", ![...failures].some((f) => /resolves/.test(f)));
const home = await (await fetch(BASE + "/")).text();
for (const v of ["07085379538", "08163193136", "07030236633", "aswrahome@gmail.com", "Staff Development Centre"]) check(`contact detail "${v}" appears on the home page footer`, home.includes(v));
const contact = await (await fetch(BASE + "/contact.html")).text();
check("contact page shows the official address and numbers", /Behind Old Government House/.test(contact) && /07085379538/.test(contact) && /08163193136/.test(contact) && /07030236633/.test(contact));
const about = await (await fetch(BASE + "/about.html")).text();
check("vision and mission text matches the approved wording", about.includes("To become a leading, credible, and inclusive association advancing sustainable waste management, responsible recycling, environmental protection, and economic empowerment in Anambra State.") && about.includes("To organise, empower, and support waste recyclers and recycling enterprises through capacity development, digital innovation, cooperative initiatives, strategic partnerships, market access, and policy advocacy for a cleaner environment and a sustainable circular economy."));
const mem = await (await fetch(BASE + "/membership.html")).text();
for (const c of ["Individual Recycler Members", "Recycling Business Members", "Cooperative Members", "Institutional Members", "Strategic and Corporate Partners"]) check(`membership page lists "${c}"`, mem.includes(c));
check("membership page warns that membership does not guarantee loans or grants", /does not guarantee loans, grants, contracts/.test(mem));
check("membership page has the Apply for Membership button", /href="#apply"[^>]*>Apply for Membership/.test(mem));
const lead = await (await fetch(BASE + "/leadership.html")).text();
check("leadership page names only the State Coordinator and states that other details await confirmation", /Mr Oscar Raymond/.test(lead) && (lead.match(/class="person/g) || []).length <= 1 && /formal confirmation/i.test(lead));

const navSig = async (u) => { const d = new JSDOM(await (await fetch(BASE + u)).text()).window.document; return [...d.querySelectorAll("#site-nav a")].map((a) => a.textContent).join("|"); };
const sigs = await Promise.all(["/", "/about.html", "/activities.html", "/partnerships.html", "/leadership.html", "/membership.html", "/contact.html", "/privacy.html", "/application-status/", "/404.html"].map(navSig));
check("every page has the identical navigation (Home to Contact, Partnerships included)", new Set(sigs).size === 1 && sigs[0].includes("Partnerships"), sigs.find((s, i) => s !== sigs[0]) || "");
let r404 = await fetch(BASE + "/this-page-does-not-exist");
check("unknown address returns a real 404 page (not the home page)", r404.status === 404 && /Page not found/.test(await r404.text()));
for (const f of ["/robots.txt", "/sitemap.xml"]) check(`${f} is served`, (await fetch(BASE + f)).status === 200);
const sm = await (await fetch(BASE + "/sitemap.xml")).text();
check("sitemap lists the public pages on the Cloudflare Pages address", ["/", "/about", "/activities", "/partnerships", "/leadership", "/membership", "/contact"].every((x) => sm.includes(`https://aswra-mvp.pages.dev${x}</loc>`)) && !sm.includes("admin"));
for (const u of ["/", "/about.html", "/activities.html", "/partnerships.html", "/leadership.html", "/membership.html", "/contact.html", "/privacy.html"]) {
  const d = new JSDOM(await (await fetch(BASE + u)).text()).window.document;
  check(`${u} has canonical URL and Open Graph tags`, !!d.querySelector('link[rel="canonical"]')?.href.startsWith("https://aswra-mvp.pages.dev") && !!d.querySelector('meta[property="og:title"]') && !!d.querySelector('meta[property="og:image"]'));
}
for (const u of ["/admin/", "/application-status/", "/404.html"]) check(`${u} is marked noindex`, /name="robots" content="noindex/.test(await (await fetch(BASE + u)).text()));
const allText = (await Promise.all(["/", "/about.html", "/activities.html", "/partnerships.html", "/leadership.html", "/membership.html", "/contact.html"].map(async (u) => new JSDOM(await (await fetch(BASE + u)).text()).window.document.querySelector("main").textContent))).join(" ").replace(/\u2019/g, "'").replace(/\s+/g, " ");
for (const [label, re] of [["presents ASWRA as a collection or recycling operator", /\bwe (collect|recycle|process) (waste|plastic|materials)/i], ["promises employment, income or funding", /(?<!not )guarantee[sd]? (employment|jobs|income|funding|grants|loans)/i], ["claims a government or regulator role", /\bASWRA is (a|the) (government|regulat)/i], ["claims existing partnerships or endorsements", /\b(our|existing) (partners are|partnerships with)|endorsed by|accredited by|certified by/i], ["invents statistics", /\b\d{2,}[,\d]*\+? (members|recyclers|tonnes|tons|enterprises)\b/i]])
  check(`public content never ${label}`, !re.test(allText), (re.exec(allText) || [])[0]);
check("public content states ASWRA is not a regulator", /not a government regulator/i.test(allText));

section("2. Navigation behaviour");
let pg = await open("/", ["site"]);
const nav = pg.d.querySelector("#site-nav"), tg = pg.d.querySelector("#nav-toggle");
check("menu is closed by default", !nav.classList.contains("open") && tg.getAttribute("aria-expanded") === "false");
click(tg); check("menu button opens the menu and updates aria-expanded", nav.classList.contains("open") && tg.getAttribute("aria-expanded") === "true");
click(nav.querySelector("a")); check("choosing a link closes the menu", !nav.classList.contains("open"));
check("current page is marked in navigation", pg.d.querySelector('#site-nav a[aria-current="page"]')?.dataset.page === "home");
const homeTxt = new JSDOM(home).window.document.body.textContent.replace(/\u2019/g, "'").replace(/\s+/g, " ");
check("home page has the approved headline, slogan and description", homeTxt.includes("Organising Anambra's recycling sector for a sustainable future.") && homeTxt.includes("Turning Waste into Wealth.") && homeTxt.includes("ASWRA is a state-level membership association bringing together waste recyclers, recovery workers, recycling enterprises, cooperatives and strategic partners"));
check("home page names the five institutional pillars exactly", ["Organisation", "Capacity Development", "Industry Development", "Advocacy", "Environmental Sustainability"].every((x) => new JSDOM(home).window.document.querySelector(".pillars").textContent.includes(x)));
check("home page has no leftover celebration countdown code", !pg.d.querySelector("#celebrations"));
check("no script errors on the home page", pg.errors.length === 0, pg.errors.join());
pg = await open("/contact.html", ["site"]);
check("contact WhatsApp form is wired up", !!pg.d.querySelector("#wa-form"));

section("3. Membership application form (real API)");
pg = await open("/membership.html", ["site", "apply"]);
let { w, d } = pg;
check("form renders the five category options", d.querySelectorAll('input[name="category"]').length === 5);
check("details are hidden until a category is chosen", d.querySelector("#apply-form > div[hidden]") !== null);
submit(d.querySelector("#apply-form"));
check("submitting without a category shows an accessible error", !!txt(d, "#err-category") || !!txt(d, ".summary"), txt(d, ".summary"));
const radio = (label) => [...d.querySelectorAll('input[name="category"]')].find((r) => r.value === label);
const choose = (label) => { const r = radio(label); r.checked = true; r.dispatchEvent(new w.Event("change", { bubbles: true })); };
choose("Individual Recycler Members");
check("individual: asks for full name and not a contact person", /Full name/.test(txt(d, 'label[for="c-applicantName"]')) && !d.querySelector("#c-contactPerson"));
check("individual: shows age, connection and activity questions", !!d.querySelector("#f-ageConfirmed") && !!d.querySelector("#f-connection") && d.querySelectorAll('input[name="f-activities"]').length === 5);
choose("Recycling Business Members");
check("business: asks for organisation name and contact person", /Organisation name/.test(txt(d, 'label[for="c-applicantName"]')) && !!d.querySelector("#c-contactPerson"));
check("business: shows business type and registration questions", !!d.querySelector("#f-businessType") && !!d.querySelector("#f-registrationStatus") && !!d.querySelector("#f-registrationNumber"));
choose("Cooperative Members"); check("cooperative: shows cooperative type", !!d.querySelector("#f-cooperativeType") && !d.querySelector("#f-businessType"));
choose("Institutional Members"); check("institutional: shows institution type and alignment", !!d.querySelector("#f-institutionType") && !!d.querySelector("#f-alignment"));
choose("Strategic and Corporate Partners"); check("partner: shows partner type and interest", !!d.querySelector("#f-partnerType") && !!d.querySelector("#f-partnershipInterest"));
choose("Individual Recycler Members");
check("form does not ask for NIN, bank, ID upload or guarantor", !/NIN|bank|guarantor|upload|passport/i.test(txt(d, "#apply-form").replace(/Do not enter your NIN, bank details or any payment here\./, "")) && !d.querySelector('input[type="file"]'));
submit(d.querySelector("#apply-form"));
check("empty submission shows an error summary", /fix the following/i.test(txt(d, ".summary")));
check("invalid fields are flagged with aria-invalid", d.querySelectorAll('[aria-invalid="true"]').length >= 5);
check("each field shows its own error message", !!txt(d, "#err-applicantName") && !!txt(d, "#err-email") && !!txt(d, "#err-phone"));
set(d.querySelector("#c-applicantName"), "UI Test Person"); set(d.querySelector("#c-email"), "bad-email"); set(d.querySelector("#c-phone"), "123");
set(d.querySelector("#c-address"), "5 Test Road, Awka"); set(d.querySelector("#c-lga"), "Awka South");
submit(d.querySelector("#apply-form"));
check("bad email and phone are caught in the browser", /valid email/.test(txt(d, "#err-email")) && /phone/i.test(txt(d, "#err-phone")));
set(d.querySelector("#c-email"), "ui.person@example.com"); set(d.querySelector("#c-phone"), "08055550101");
set(d.querySelector("#f-connection"), "I reside in Anambra State"); d.querySelector("#f-ageConfirmed").checked = true;
d.querySelector('input[name="f-activities"]').checked = true; d.querySelector("#d-declaration").checked = true; d.querySelector("#d-privacy").checked = true;
const btn = d.querySelector('#apply-form button[type="submit"]');
submit(d.querySelector("#apply-form"));
check("submit button is disabled while sending (duplicate click protection)", btn.disabled === true && /Submitting/.test(btn.textContent));
submit(d.querySelector("#apply-form"));
const done = await waitFor(() => d.querySelector("#apply-done"));
check("successful submission shows a confirmation", !!done && /Application received/.test(done.textContent));
const ref = txt(d, ".ref");
check("confirmation shows the application reference", /^ASWRA-\d{4}-[0-9A-HJKMNP-TV-Z]{12}$/.test(ref), ref);
check("confirmation tells the applicant to keep the reference and does not say approved", /keep this reference/i.test(done.textContent) && /does not mean it has been approved/i.test(done.textContent) && !/congratulations/i.test(done.textContent));
check("confirmation links to the status page with the reference", d.querySelector("#apply-done a")?.getAttribute("href").includes(ref));
check("only one application was saved despite the double submit", JSON.parse(sql("SELECT COUNT(*) c FROM applications WHERE applicant_name='UI Test Person'"))[0].results[0].c === 1);
check("no script errors on the membership page", pg.errors.length === 0, pg.errors.join());
const uiRef = ref;

section("4. Application status page");
pg = await open("/application-status/", ["status"]); ({ w, d } = pg);
d.querySelector("#reference").value = "garbage"; submit(d.querySelector("#status-form"));
check("malformed reference shows a helpful message", /exactly as shown/.test(txt(d, "#reference-err")) && d.querySelector("#reference").getAttribute("aria-invalid") === "true");
d.querySelector("#reference").value = "ASWRA-2026-ZZZZZZZZZZZZ"; submit(d.querySelector("#status-form"));
check("unknown reference shows a safe not found message", !!(await waitFor(() => /could not find/.test(txt(d, "#status-result")))));
d.querySelector("#reference").value = uiRef.toLowerCase(); submit(d.querySelector("#status-form"));
check("valid reference shows status and plain language explanation", !!(await waitFor(() => /Pending/.test(txt(d, "#status-result")) && /awaiting review/.test(txt(d, "#status-result")))));
check("status page shows no personal details", !/UI Test Person|ui\.person|08055550101|Awka/.test(txt(d, "#status-result")));
pg = await open(`/application-status/?ref=${uiRef}`, ["status"]);
check("reference from the link is looked up automatically", !!(await waitFor(() => /Pending/.test(txt(pg.d, "#status-result")))));

section("5. Administrator dashboard (real API and database)");
sql("DELETE FROM rate_limits");
const evil = await (await fetch(BASE + "/api/applications", { method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.50" }, body: JSON.stringify({ category: "Individual Recycler Members", applicantName: "<img src=x onerror=alert(1)> Evil Name", email: "evil.name@example.com", phone: "08055550102", address: "1 Script Street", lga: "Awka South", formData: { ageConfirmed: true, connection: "I reside in Anambra State", activities: ["Recycling"] }, declaration: true, privacy: true }) })).json();
check("setup: application with markup in its name saved", /^ASWRA-/.test(evil.reference), JSON.stringify(evil));
const jar = {};
pg = await open("/admin/", ["admin"], jar); ({ w, d } = pg);
check("anonymous visitor sees only the login form", !!(await waitFor(() => /membership admin/i.test(txt(d, "h1")))) && !d.querySelector("table"));
set(d.querySelector("#em"), ADMIN.email); set(d.querySelector("#pw"), "wrong-password-99"); submit(d.querySelector("form.login"));
check("wrong password shows an error and stays on login", !!(await waitFor(() => /Incorrect email or password/.test(txt(d, ".login")))) && !d.querySelector("table"));
set(d.querySelector("#pw"), ADMIN.password); submit(d.querySelector("form.login"));
check("correct password opens the dashboard", !!(await waitFor(() => /Applications/.test(txt(d, ".admin-main h1")))));
check("dashboard shows statistics from the database", !!(await waitFor(() => d.querySelectorAll(".stat").length === 6)) && Number(txt(d, ".stat b")) >= 2);
check("applications table shows rows with the required columns", !!(await waitFor(() => d.querySelectorAll("table.tbl tbody tr").length >= 2)) && ["Reference", "Applicant", "Category", "Submitted", "Status", "Action"].every((h) => [...d.querySelectorAll("thead th")].some((th) => th.textContent === h)));
check("markup in an applicant name is displayed as text and never executed", !d.querySelector("img[src='x']") && [...d.querySelectorAll("td")].some((td) => td.textContent.includes("<img src=x")));
const q = d.querySelector('input[type="search"]'); set(q, "Evil Name");
check("search narrows the table", !!(await waitFor(() => d.querySelectorAll("table.tbl tbody tr").length === 1)));
set(q, "no-such-applicant-xyz");
check("empty state is shown when nothing matches", !!(await waitFor(() => /No applications match/.test(txt(d, ".empty")))));
set(q, "UI Test Person");
await waitFor(() => d.querySelectorAll("table.tbl tbody tr").length === 1);
click(d.querySelector("table.tbl tbody a.btn"));
check("View opens the application detail", !!(await waitFor(() => /UI Test Person/.test(txt(d, ".detail-head h1")))));
check("detail shows full submitted information", /ui\.person@example\.com/.test(txt(d, ".dl")) && /08055550101/.test(txt(d, ".admin-main")) && /I reside in Anambra State/.test(txt(d, ".admin-main")) && /Declaration accepted/.test(txt(d, ".admin-main")));
check("detail shows the reference and current status", txt(d, ".detail-head .mono") === uiRef && /Pending/.test(txt(d, ".detail-head .badge")));
check("private and public message fields are clearly labelled", d.querySelectorAll(".tone.private").length >= 2 && d.querySelectorAll(".tone.public").length >= 2 && d.querySelectorAll(".tone.email").length >= 2);
check("no decision controls while the application is only Pending", !/Official decision/.test(txt(d, ".admin-main")));

section("6. Review controls in the dashboard");
const forms = () => [...d.querySelectorAll(".detail-grid form")];
let sf = forms()[0];
set(sf.querySelector('select[name="status"]'), "Under Review"); set(sf.querySelector('textarea[name="internalNote"]'), "Starting review (ui test)"); submit(sf);
check("administrator can move the application to Under Review", !!(await waitFor(() => /Under Review/.test(txt(d, ".detail-head .badge")))));
check("official decision controls appear after review starts", !!(await waitFor(() => /Official decision/.test(txt(d, ".admin-main")))));
let rf = forms()[1]; set(rf.querySelector('textarea[name="notes"]'), "UI private note SECRET-UI"); set(rf.querySelector('select[name="rec"]'), "Approve"); submit(rf);
check("recommendation is recorded and status changes to Recommended for Approval", !!(await waitFor(() => /Recommended for Approval/.test(txt(d, ".detail-head .badge")))));
check("history timeline lists the submission, status change and recommendation", /Application submitted/.test(txt(d, ".timeline")) && /Status changed: Pending/.test(txt(d, ".timeline")) && /Recommendation/.test(txt(d, ".timeline")) && /SECRET-UI/.test(txt(d, ".timeline")));
check("internal note is marked Private in the history", !!d.querySelector(".timeline .tone.private"));

section("7. Email composer and communication records");
const comp = () => [...d.querySelectorAll("section.card")].find((s) => /Email to the applicant/.test(s.textContent));
let cs = comp(); const typeSel = () => comp().querySelector('select[name="type"]'), body = () => comp().querySelector("#body"), subj = () => comp().querySelector("#subject");
set(typeSel(), "approval");
check("approval template has the approved congratulatory subject", subj().value === "Congratulations! Your ASWRA Membership Application Has Been Approved");
check("approval template is populated with the applicant name and reference", body().value.includes("Dear UI Test Person,") && body().value.includes(uiRef) && /Congratulations!/.test(body().value) && !/\[Applicant Name\]|\[Application Reference\]/.test(body().value));
check("approval template does not promise cards, funds or grants", !/loan|grant|card|payment|contract/i.test(body().value));
set(typeSel(), "rejection");
check("rejection template contains a reason placeholder until completed", /\[Administrator's specific explanation\]/.test(body().value) && subj().value === "Update on Your ASWRA Membership Application");
set(typeSel(), "additional_information");
check("additional information template has the approved subject and request text", subj().value === "Additional Information Required \u2013 ASWRA Membership Application" && /The information required is:/.test(body().value) && /\[Specific information requested/.test(body().value));
const detailArea = () => comp().querySelector("textarea:not(#body)");
set(detailArea(), "A copy of your cooperative registration certificate, because we must confirm your registration."); click([...comp().querySelectorAll("button")].find((b) => /Put this into the message/.test(b.textContent)));
check("administrator's specific request is inserted into the message", /cooperative registration certificate/.test(body().value) && !/\[Specific information/.test(body().value));
body().value = body().value + "\nThank you for your patience."; 
click([...comp().querySelectorAll("button")].find((b) => b.textContent === "Preview"));
check("administrator can edit and preview the final email", /To: ui\.person@example\.com/.test(txt(d, ".preview")) && /patience/.test(txt(d, ".preview")) && !comp().querySelector(".preview").hidden);
set(typeSel(), "rejection");
click([...comp().querySelectorAll("button")].find((b) => /Save and open email/.test(b.textContent)));
check("an unfinished template cannot be saved or opened", !!(await waitFor(() => /placeholder/.test(txt(d, ".admin-main .notice.err")))) && pg.mails.length === 0);
await sleep(150);
set(typeSel(), "additional_information");
set(detailArea(), "Proof of your operating address, so we can complete verification."); click([...comp().querySelectorAll("button")].find((b) => /Put this into the message/.test(b.textContent)));
click([...comp().querySelectorAll("button")].find((b) => /Save and open email/.test(b.textContent)));
check("Save and open email opens a mailto link with recipient, subject and message", !!(await waitFor(() => pg.mails.length === 1)) && pg.mails[0].startsWith("mailto:ui.person@example.com?subject=") && pg.mails[0].includes(encodeURIComponent("Additional Information Required")) && pg.mails[0].includes(encodeURIComponent(uiRef)));
check("the record is shown as Prepared and not as sent", !!(await waitFor(() => /Prepared/.test(txt(d, ".comm")))) && !/Marked as Sent/.test(txt(d, ".comm")));
click([...d.querySelectorAll(".comm button")].find((b) => b.textContent === "Copy message"));
check("copy fallback copies the full message", !!(await waitFor(() => pg.copied.length === 1)) && pg.copied[0].includes("Subject: Additional Information Required") && pg.copied[0].includes(uiRef));
click([...d.querySelectorAll(".comm button")].find((b) => b.textContent === "Open email"));
check("Open email on a saved record uses the stored message", pg.mails.length === 2);
check("opening the email app did NOT mark it as sent", !/Marked as Sent/.test(txt(d, ".comm")));
click([...d.querySelectorAll(".comm button")].find((b) => b.textContent === "Mark as sent"));
check("administrator can manually mark it as sent", !!(await waitFor(() => /Marked as Sent/.test(txt(d, ".comm")))) && /recorded as sent/.test(txt(d, ".comm")));
check("page explains that this is a manual record and not proof of delivery", /not proof that the email was delivered/.test(txt(d, ".admin-main")));
check("page explains the email app must be set up and the system never sends email", /never sends email/.test(txt(d, ".admin-main")) && /email app set up/.test(txt(d, ".admin-main")));

section("8. Official decision in the dashboard");
const decForm = () => [...d.querySelectorAll(".detail-grid form")].find((f) => f.querySelector('select[name="decision"]'));
let df = decForm(); set(df.querySelector('select[name="decision"]'), "Rejected");
check("rejection reveals the reason category field", !df.querySelector("div[hidden]"));
set(df.querySelector('select[name="decision"]'), "Approved"); df.querySelector("textarea").value = "Approved after review";
submit(df);
check("official approval changes the status to Approved", !!(await waitFor(() => /Approved/.test(txt(d, ".detail-head .badge")))));
check("decision controls are removed after the final decision", !decForm() && /can no longer be changed/.test(txt(d, ".admin-main")));
click(d.querySelector(".admin-main a[href='#']"));
check("administrator can return to the list", !!(await waitFor(() => /Applications/.test(txt(d, ".admin-main h1")))));
const stRes = await (await fetch(`${BASE}/api/application-status?reference=${uiRef}`, { headers: { "cf-connecting-ip": "192.0.2.77" } })).json();
check("applicant now sees Approved on the public status endpoint", stRes.status === "Approved");

section("9. Logout and session handling in the browser");
check("administrator email is shown and Log out is available", /admin@aswra-test/.test(txt(d, ".admin-user")));
click([...d.querySelectorAll("button")].find((b) => b.textContent === "Log out"));
check("logout returns to the login form", !!(await waitFor(() => /membership admin/i.test(txt(d, "h1")) && !d.querySelector("table"))));
const after = await fetch(`${BASE}/api/admin/dashboard`, { headers: { cookie: jar.c || "", "cf-connecting-ip": "192.0.2.78" } });
check("API rejects the old session after logout", after.status === 401);
const fresh = await open("/admin/", ["admin"], {});
check("fresh browser (no cookie) sees the login form only", !!(await waitFor(() => /membership admin/i.test(txt(fresh.d, "h1")))) && !fresh.d.querySelector("table"));
check("no credentials or secrets appear in the admin page source", !(await (await fetch(BASE + "/admin/")).text() + B.admin).includes(ADMIN.password) && !/password_hash|ADMIN_SETUP_TOKEN|APP_SECRET/.test(await (await fetch(BASE + "/admin/")).text() + B.admin));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
process.exit(0);
