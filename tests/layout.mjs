// Real browser layout audit (headless Chromium via puppeteer-core).
// Optional dependencies, not installed by default (large download):
//   npm i --no-save puppeteer-core @sparticuz/chromium
// Run with the local dev server running:  node tests/layout.mjs
// Screenshots are written to ./layout-shots (git ignored).
import fs from "node:fs";
let puppeteer, chromium;
try { puppeteer = (await import("puppeteer-core")).default; chromium = (await import("@sparticuz/chromium")).default; }
catch { console.error("Install the optional browser first:  npm i --no-save puppeteer-core @sparticuz/chromium"); process.exit(2); }

const BASE = process.env.BASE_URL || "http://localhost:8788";
const VIEWPORTS = [["phone-320", 320, 640, true], ["phone-360", 360, 740, true], ["phone-390", 390, 844, true], ["tablet-768", 768, 1024, true], ["laptop-1024", 1024, 768, false], ["desktop-1440", 1440, 900, false]];
const PAGES = ["/", "/about.html", "/activities.html", "/partnerships.html", "/leadership.html", "/membership.html", "/contact.html", "/privacy.html", "/application-status/", "/admin/", "/this-page-does-not-exist"];
let pass = 0, fail = 0; const failures = [];
const check = (n, c, x = "") => { if (c) pass++; else { fail++; failures.push(`${n} ${x}`); console.log("  FAIL", n, x); } };
fs.mkdirSync("layout-shots", { recursive: true });

const browser = await puppeteer.launch({ args: [...chromium.args, "--no-sandbox"], executablePath: await chromium.executablePath(), headless: "shell" });
const problems = [];
for (const [vname, w, h, mobile] of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  const errs = [];
  page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("this-page-does-not-exist") && !r.url().includes("/api/admin/session")) errs.push(`HTTP ${r.status()} ${r.url()}`); });
  for (const p of PAGES) {
    errs.length = 0;
    await page.goto(BASE + p, { waitUntil: "networkidle0", timeout: 30000 });
    const tag = `${vname} ${p}`;
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const wide = [...document.querySelectorAll("body *")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1) && getComputedStyle(e).position !== "fixed" && !e.closest("svg, .hero svg, .hp, .skip") && !e.classList.contains("skip"); }).slice(0, 3).map((e) => e.tagName + "." + e.className);
      const small = [...document.querySelectorAll("main a.btn, main button, .nav a, input:not([type=checkbox]):not([type=radio]):not(.hp input), select, textarea")].filter((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && s.visibility !== "hidden" && r.height < 36; }).slice(0, 3).map((e) => e.tagName + ":" + (e.textContent || e.id).trim().slice(0, 20));
      const h1 = document.querySelectorAll("h1").length;
      const fontMin = Math.min(...[...document.querySelectorAll("main p:not(.eyebrow), main li, main label")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => parseFloat(getComputedStyle(e).fontSize)));
      return { scrollW: document.documentElement.scrollWidth, vw, wide, small, h1, fontMin };
    });
    check(`${tag}: no horizontal scrolling`, m.scrollW <= m.vw + 1, `scrollWidth=${m.scrollW} viewport=${m.vw} offenders=${m.wide.join(",")}`);
    check(`${tag}: no element sticks outside the screen`, m.wide.length === 0, m.wide.join(","));
    check(`${tag}: touch targets at least 36px tall`, m.small.length === 0, m.small.join(","));
    check(`${tag}: readable text (>= 14px)`, !(m.fontMin < 14), `min=${m.fontMin}`);
    if (!p.includes("does-not-exist")) check(`${tag}: exactly one h1`, m.h1 === 1, `h1=${m.h1}`);
    check(`${tag}: no console errors, failed assets or script errors`, p.includes("does-not-exist") ? errs.every((e) => /404/.test(e)) : errs.length === 0, errs.join(" | "));
    if (["phone-390", "tablet-768", "desktop-1440"].includes(vname)) await page.screenshot({ path: `layout-shots/${vname}${p.replace(/[\/.]/g, "_")}.png`, fullPage: true });
    if (!p.includes("admin") && !p.includes("does-not-exist") && p !== "/application-status/") {
      const nav = await page.evaluate(() => { const n = document.querySelector("#site-nav"), b = document.querySelector("#nav-toggle"); const vis = (e) => e && getComputedStyle(e).display !== "none"; return { navVisible: vis(n), burgerVisible: vis(b) }; });
      if (w < 900) { check(`${tag}: menu button shown and menu collapsed on small screens`, nav.burgerVisible && !nav.navVisible); if (p === "/") { await page.click("#nav-toggle"); const open = await page.evaluate(() => getComputedStyle(document.querySelector("#site-nav")).display !== "none" && document.querySelector("#nav-toggle").getAttribute("aria-expanded") === "true"); check(`${tag}: menu opens on tap`, open); const links = await page.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll("#site-nav a")].every((a) => { const r = a.getBoundingClientRect(); return r.right <= vw && r.height >= 40; }); }); check(`${tag}: every menu link is fully on screen and tappable`, links); } }
      else check(`${tag}: full menu shown, no menu button on wide screens`, nav.navVisible && !nav.burgerVisible);
    }
  }
  await page.close();
}
// Form interactions at the smallest and a typical size
for (const [vname, w, h] of [["phone-320", 320, 640], ["phone-390", 390, 844], ["desktop-1440", 1440, 900]]) {
  const page = await browser.newPage(); await page.setViewport({ width: w, height: h, isMobile: w < 900, hasTouch: w < 900 });
  await page.goto(BASE + "/membership.html", { waitUntil: "networkidle0" });
  await page.evaluate(() => document.querySelectorAll('input[name="category"]')[1].click());
  await new Promise((r) => setTimeout(r, 300));
  const f = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth, inputs: document.querySelectorAll("#apply-form input, #apply-form select, #apply-form textarea").length, submit: !!document.querySelector('#apply-form button[type="submit"]') }));
  check(`${vname} membership form after choosing a category: renders fields`, f.inputs > 10 && f.submit, JSON.stringify(f));
  check(`${vname} membership form: no horizontal scrolling`, f.sw <= f.vw + 1, JSON.stringify(f));
  await page.evaluate(() => document.querySelector('#apply-form button[type="submit"]').click());
  await new Promise((r) => setTimeout(r, 300));
  const e = await page.evaluate(() => ({ summary: document.querySelector(".summary")?.textContent || "", invalid: document.querySelectorAll('[aria-invalid="true"]').length, focus: document.activeElement?.className || "" }));
  check(`${vname} membership form: empty submit shows an error summary and marks fields`, /fix the following/i.test(e.summary) && e.invalid >= 4, JSON.stringify(e));
  await page.screenshot({ path: `layout-shots/${vname}_membership-form.png`, fullPage: true });
  await page.close();
}
await browser.close();
console.log(`\nResult: ${pass} passed, ${fail} failed`);
if (fail) { console.log("Failures:\n - " + failures.join("\n - ")); process.exit(1); }
