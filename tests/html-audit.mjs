// Static HTML audit of every page file (no server needed): ids, headings, labels, links, metadata.
//   node tests/html-audit.mjs
import fs from "node:fs";
import { JSDOM } from "jsdom";
const FILES = ["index.html", "about.html", "activities.html", "partnerships.html", "leadership.html", "membership.html", "contact.html", "privacy.html", "application-status/index.html", "admin/index.html", "404.html"];
let pass = 0, fail = 0;
const check = (n, c, x = "") => { if (c) pass++; else { fail++; console.log("  FAIL", n, x); } };
for (const f of FILES) {
  const html = fs.readFileSync(f, "utf8"), d = new JSDOM(html).window.document;
  const ids = [...d.querySelectorAll("[id]")].map((e) => e.id);
  check(`${f}: unique ids`, new Set(ids).size === ids.length, ids.filter((x, i) => ids.indexOf(x) !== i).join());
  const levels = [...d.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) => +h.tagName[1]);
  check(`${f}: heading order has no skipped levels`, levels.every((l, i) => i === 0 || l <= levels[i - 1] + 1), levels.join(""));
  if (f !== "admin/index.html") check(`${f}: exactly one h1 and it comes first`, levels.filter((l) => l === 1).length === 1 && levels[0] === 1);
  check(`${f}: images have alt text`, [...d.querySelectorAll("img")].every((i) => i.hasAttribute("alt")));
  const controls = [...d.querySelectorAll("input:not([type=hidden]),select,textarea")];
  check(`${f}: every form control has a label`, controls.every((c) => c.getAttribute("aria-label") || (c.id && d.querySelector(`label[for="${c.id}"]`)) || c.closest("label")), controls.filter((c) => !(c.getAttribute("aria-label") || (c.id && d.querySelector(`label[for="${c.id}"]`)) || c.closest("label"))).map((c) => c.id || c.name).join());
  check(`${f}: external links open safely (noopener)`, [...d.querySelectorAll('a[target="_blank"]')].every((a) => /noopener/.test(a.rel)));
  check(`${f}: no empty links or buttons`, [...d.querySelectorAll("a,button")].every((e) => (e.textContent || "").trim() || e.getAttribute("aria-label")));
  check(`${f}: no insecure http:// links`, ![...d.querySelectorAll("[href],[src]")].some((e) => /^http:\/\//.test(e.getAttribute("href") || e.getAttribute("src"))));
  check(`${f}: lang, viewport, title and favicon present`, d.documentElement.lang === "en" && !!d.querySelector('meta[name="viewport"]') && !!d.title.trim() && !!d.querySelector('link[rel="icon"]'));
  check(`${f}: no inline event handlers or style attributes`, !/\s(on[a-z]+|style)="/i.test(html));
  if (f !== "admin/index.html" && f !== "404.html") check(`${f}: skip link and main landmark`, !!d.querySelector('a.skip[href="#main"]') && !!d.querySelector("main#main"));
}
console.log(`HTML audit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
