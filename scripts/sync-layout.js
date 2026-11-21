#!/usr/bin/env node
// Keeps the shared header and footer identical on every public page.
// Edit the templates below, then run:  npm run layout
// Each page contains <!--HEADER--><!--/HEADER--> and <!--FOOTER--><!--/FOOTER--> markers.
const fs = require("fs");

const SITE = "https://aswra.pages.dev"; // current Cloudflare Pages address (no custom domain yet)
// file -> public (canonical) path. Pages without an entry are not indexed and get no canonical or Open Graph block.
const CANONICAL = { "index.html": "/", "about.html": "/about", "activities.html": "/activities", "partnerships.html": "/partnerships", "leadership.html": "/leadership", "membership.html": "/membership", "contact.html": "/contact", "privacy.html": "/privacy" };
const PAGES = ["index.html", "about.html", "activities.html", "partnerships.html", "leadership.html", "membership.html", "contact.html", "privacy.html", "application-status/index.html", "404.html"];
const NAV = [["home", "index.html", "Home"], ["about", "about.html", "About Us"], ["activities", "activities.html", "What We Do"], ["partnerships", "partnerships.html", "Partnerships"], ["leadership", "leadership.html", "Leadership"], ["membership", "membership.html", "Membership"], ["contact", "contact.html", "Contact"]];

const header = (p) => `<!--HEADER-->
<a class="skip" href="#main">Skip to content</a>
<header class="site-header"><div class="container nav-bar">
<a class="brand" href="${p}index.html"><img src="${p}a.jpg" alt="" width="40" height="40">ASWRA</a>
<button class="burger" id="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">&#9776;</button>
<nav class="nav" id="site-nav" aria-label="Main">
${NAV.map(([k, f, t]) => `<a data-page="${k}" href="${p}${f}">${t}</a>`).join("\n")}
<a class="btn" href="${p}membership.html#apply">Apply for Membership</a>
</nav></div></header>
<!--/HEADER-->`;

const footer = (p) => `<!--FOOTER-->
<footer class="site-footer"><div class="container"><div class="foot-grid">
<div><h2>ASWRA</h2><p>Anambra State Waste Recyclers Association. Turning waste into wealth.</p></div>
<div><h2>Pages</h2><div class="foot-links">
${NAV.map(([k, f, t]) => `<a href="${p}${f}">${t}</a>`).join("\n")}
<a href="${p}application-status/">Check application status</a>
<a href="${p}privacy.html">Privacy notice</a>
</div></div>
<div><h2>State Secretariat</h2><div class="foot-links">
<span>Staff Development Centre, Behind Old Government House, Awka, Anambra State, Nigeria</span>
<a href="tel:07085379538">07085379538</a><a href="tel:08163193136">08163193136</a><a href="tel:07030236633">07030236633</a>
<a href="mailto:aswrahome@gmail.com">aswrahome@gmail.com</a>
<a href="https://www.facebook.com/share/1J9RiHkSam/" target="_blank" rel="noopener">Facebook</a>
</div></div></div>
<p class="copy">&copy; <span id="year">2026</span> Anambra State Waste Recyclers Association (ASWRA)</p></div></footer>
<a class="wa-float" href="https://wa.me/2347085379538" target="_blank" rel="noopener" aria-label="Chat with ASWRA on WhatsApp">WhatsApp</a>
<!--/FOOTER-->`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
function seo(file, html) {
  const path = CANONICAL[file];
  if (!path) return "<!--SEO-->\n<!--/SEO-->";
  const title = (/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] || "ASWRA";
  const desc = ((/<meta name="description" content="([^"]*)"/.exec(html) || [])[1] || "").trim();
  return `<!--SEO-->
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Anambra State Waste Recyclers Association (ASWRA)">
<meta property="og:title" content="${esc(title.trim())}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}/a.jpg">
<meta name="twitter:card" content="summary">
<!--/SEO-->`;
}

for (const file of PAGES) {
  if (!fs.existsSync(file)) { console.warn("missing", file); continue; }
  const p = file.includes("/") ? "../" : "";
  let html = fs.readFileSync(file, "utf8");
  if (!html.includes("<!--SEO-->")) html = html.replace("</head>", "<!--SEO-->\n<!--/SEO-->\n</head>");
  html = html.replace(/<!--SEO-->[\s\S]*?<!--\/SEO-->/, seo(file, html));
  html = html.replace(/<!--HEADER-->[\s\S]*?<!--\/HEADER-->/, header(p)).replace(/<!--FOOTER-->[\s\S]*?<!--\/FOOTER-->/, footer(p));
  fs.writeFileSync(file, html);
  console.log("synced", file);
}
