# Technical Audit Report

Project: ASWRA website and membership management system · Repository state audited: `main` (24 commits, latest "Add partnerships page to site navigation") · Work branch: `audit/fixes`

## 1. Method

1. Cloned the repository and compared it with the delivered membership system commit to see every change made since.
2. Ran the existing test suites for a baseline (API 167/167, browser level 143/145).
3. Read every page, script, API endpoint, migration and configuration file; ran a real headless browser audit at six screen sizes; ran a static HTML audit.
4. Investigated Turnstile against Cloudflare's server side validation documentation and with a Siteverify stand in.
5. Fixed genuine defects, added tests, re-ran everything. Scope limits respected: no new features outside the brief, no deployment, no production access.

**Design:** the restored `styles.css` is identical to the original. The only stylesheet changes are 6 appended lines (see section 6).

## 2. Turnstile: root cause analysis

Symptom: `{"error":"Verification failed...","code":"captcha_failed"}` and the Turnstile warning "Siteverify isn't being called for ASWRA Membership Protection".

| Question | Finding |
|---|---|
| Server calls the correct Siteverify endpoint with correct parameters? | Yes. POST form with `secret` and `response` (plus `remoteip`). Now also `idempotency_key`, an 8 second timeout and one safe retry. |
| Is Cloudflare's answer handled? | **No (defect).** Any failure became one generic error and the `error-codes` were discarded, so the cause was invisible. Now classified, logged and shown in the dashboard. |
| Right site key to the browser and matching secret on the server? | Cannot be verified from outside Cloudflare. **The two symptoms together indicate the secret key in use belongs to a different widget than the site key on the page** (or one key is missing in the Production or Preview environment). `docs/TURNSTILE_TROUBLESHOOTING.md` gives the 5 minute check, and the new System check can test the secret. |
| Token obtained and sent correctly? | **Defect found.** The widget element was moved inside the page whenever the visitor changed category, which reloads the iframe and leaves a stale token. Fixed: widget is built once and never moved; reset only when a token was consumed. |
| Token wasted? | **Defect found.** Verification ran before form validation, so every invalid form used up the single use token. Fixed: validate first, verify second, then check duplicates. |
| Expired or reused tokens handled? | Not distinguished before. Now `expired` (timeout-or-duplicate) gives a precise message and the widget resets. |
| Hostname configuration | Added server side check that the token was solved on this hostname and for this form's action. The widget's Hostname Management must list the deployment hostname. |
| Content Security Policy interference | The earlier fix added `connect-src https://challenges.cloudflare.com`. Kept. Could not be confirmed against the live widget (listed as a production test). |
| Key hygiene | Keys pasted with spaces, line breaks or quotes are now cleaned. Identical site and secret keys are flagged. |
| Insecure bypass? | None. A missing secret fails closed. The local bypass needs `ENVIRONMENT=development` **and** `localhost`, and was tested to be inactive in production mode. The test only Siteverify URL override is likewise ignored outside local development. |

Result: real server side verification is performed for every application, failures are diagnosable, and the likely production cause (key mismatch) is detectable by the administrator. **Whether production works can only be proven after you set the keys on Cloudflare and test.**

## 3. Findings and fixes

| ID | Severity | Problem | Fix | Main files |
|---|---|---|---|---|
| F1 | High | Turnstile failure reason discarded (undiagnosable) | Classified reasons, throttled per reason audit log, admin diagnostics and secret check | `functions/_lib/guards.js`, `functions/api/admin/diagnostics.js`, `assets/js/admin.js` |
| F2 | High | Widget moved on category change; no handling of expiry, errors, load failure, reset | Rewritten widget lifecycle, messages with error codes | `assets/js/apply.js` |
| F3 | High | Token consumed before validation | Order: honeypot, validation, verification, duplicate check, save | `functions/api/applications.js` |
| F4 | High | Failed captcha, invalid forms and duplicates consumed the allowance (and old counters could keep people blocked) | New counters: successful saves only (30 per hour, 100 per day), separate failed verification (60 per hour) and flood guard (120 per hour); new key names; migration clears old counters | `guards.js`, `applications.js`, `migrations/0002_audit_fixes.sql` |
| F5 | Medium | No hostname or action validation, timeout, retry | Added | `guards.js` |
| F6 | Medium | Navigation drift: the Partnerships page had no layout markers, the status page had no Partnerships link, and the layout script would have deleted Partnerships from every page | Script and pages brought into line; all pages identical | `scripts/sync-layout.js`, `partnerships.html` |
| F7 | Medium | Unknown URLs would return the home page with status 200 (no 404 page) | Added branded `404.html` | `404.html` |
| F8 | Medium | Required template "acknowledging an application" missing | Added; database constraint extended by safe table rebuild | `admin-templates.js`, `0002_audit_fixes.sql`, `workflow.js` |
| F9 | Medium | Cross site POST not rejected before processing; large bodies read before size check | Origin check on public POST; Content-Length precheck | `http.js`, `applications.js` |
| F10 | Low | Status lookups limited to 30 per 10 minutes per IP (tight for shared networks) | 60 per 10 minutes | `application-status.js` |
| F11 | Low | No canonical, Open Graph, robots, sitemap, noindex | Added (current Pages address only) | `sync-layout.js`, `robots.txt`, `sitemap.xml` |
| F12 | Low | Heading levels skipped (h1 to h3) on 7 pages | Visually hidden h2 and footer headings as h2, no visual change | page files, `styles.css` |
| F13 | Low | WhatsApp button covered hero buttons on phones | Smaller on small screens, footer spacing | `styles.css` |
| F14 | Low | Content: pillar "Sustainability" not the approved name; wording implied existing relationships and representation ("works with", "represents", "works constructively with"); five pillars missing from About | Corrected to approved names and hedged to what the documentation supports; pillars added to About | `index.html`, `about.html` |
| F15 | Low | Dead code (leftover countdown), unused imports | Removed | `site.js`, 3 function files |
| F16 | Info | Two stale test expectations; no tests for new behaviour | Updated and extended (1003 checks) | `tests/` |

## 4. Security improvements

Server side verification hardened (F1 to F5), per visitor limits redesigned (F4), Origin and body size checks (F9), key cleaning, diagnostics that never reveal keys or tokens, append only logging of verification failures without tokens or IP addresses, and tests proving production mode cannot bypass Turnstile. Everything already in place was re-verified: PBKDF2 password hashing, hashed session tokens, `HttpOnly` `SameSite=Strict` `__Host-` cookies, CSRF token plus Origin check, strict Content Security Policy and security headers, parameterised SQL, output escaping (text only DOM building), append only history and audit tables, single administrator enforced in the database, private files hidden.

## 5. Database changes

New migration `0002_audit_fixes.sql` (no history edits): clears `rate_limits`; rebuilds `communication_logs` to add `acknowledgement` with every row copied; adds `idx_audit_action`. Proven on a seeded database: no row lost, constraints and foreign keys intact, safe to repeat. Table list matches the expected eight.

## 6. Design and content

Design preserved: header, hero, typography, colours, buttons, cards, forms and spacing untouched. Stylesheet additions (appended only): footer bottom padding, smaller WhatsApp button below 520 pixels, `.sr-only`, `.site-footer h2`. Content changes are listed in F14. The leadership page names only Mr Oscar Raymond. Statements about partnerships, programmes and benefits remain hedged ("subject to eligibility", "may", "where organised"). No statistics, partners, achievements or events were added.

## 7. Tests

See `docs/TESTING.md`: 1003 checks, 1003 passed, with what was not tested.

## 8. Remaining issues and risks

1. **Production Turnstile unproven** until the keys are corrected and tested on Cloudflare (checklist section D).
2. **Privacy notice not approved** (`privacy.html` states so and has items in brackets). Launch blocker.
3. Partnerships page and the home page wording were written outside this audit. They were checked against the no invention rules but need ASWRA's approval.
4. Real devices, other browsers, screen readers and the email app were not tested.
5. Locking the administrator's email after 5 wrong passwords can be used for nuisance lockouts (15 minutes).
6. Final decisions are irreversible in the interface by design.
7. Every request passes through the middleware (counts toward Pages Functions limits).
8. A future custom domain requires updating the Turnstile hostnames, sitemap and canonical addresses.

## 9. Deployment requirements

README sections 3 to 10 and `docs/DEPLOYMENT_CHECKLIST.md`.
