# Testing Report

Run on the final code. Environment: Node 22, Wrangler 4.164 (`wrangler pages dev`) with a **local** D1 database, headless Chromium (bundled by `@sparticuz/chromium`) for layout. **Nothing was run against a real Cloudflare account, the production database or the live site.** Raw logs: `docs/*-run-log.txt`.

Run everything: `sh tests/run-all.sh` (resets the LOCAL database first). Layout test: `npm i --no-save puppeteer-core @sparticuz/chromium` then `node tests/layout.mjs`.

## Results

| Suite | File | Checks | Passed | Failed |
|---|---|---|---|---|
| API and database | `tests/e2e.mjs` | 181 | 181 | 0 |
| Browser level (simulated browser, real API and database) | `tests/ui.mjs` | 175 | 175 | 0 |
| Turnstile (stand in for Cloudflare Siteverify) | `tests/turnstile.mjs` | 54 | 54 | 0 |
| Migration safety | `tests/migration.mjs` | 20 | 20 | 0 |
| Static HTML audit | `tests/html-audit.mjs` | 118 | 118 | 0 |
| **Real browser layout** (6 screen sizes, 11 pages, form) | `tests/layout.mjs` | 455 | 455 | 0 |
| **Total** | | **1003** | **1003** | **0** |

Baseline before any change (existing repository): API 167/167, browser level 143/145 (two expectations were stale after content edits, not product defects). Layout baseline showed no overflow or script errors.

## What each suite proves

**API and database (181).** Health; every admin endpoint rejects anonymous users; one time administrator setup (token, strength, single use, database level single administrator, hashed password); login, cookie flags, hashed session tokens; applications for all five categories, validation, honeypot, duplicates, injection text stored harmlessly; public status exposes only status, message and date; dashboard counts, search, filters, sorting, paging, injection and wildcard safety; detail; full approval and rejection workflows (recommendations never become decisions, final decisions cannot change, history retained, internal notes never public); email records (Prepared versus Marked as Sent, recipient from the application); CSRF and Origin checks; private files return 404 and security headers; audit log; session expiry, idle expiry, logout; **rate limits**: 40 invalid submissions and 35 duplicates do not use the allowance, 30 successes per hour accepted and the 31st refused with a retry time, daily limit of 100, expired window releases the visitor, **old counters from the previous limit scheme do not block anyone**, flood guard, login and status limits.

**Browser level (175).** All pages return 200 with correct titles, descriptions, single h1, landmarks; identical navigation on every page including Partnerships; branded 404 returns a real 404; robots, sitemap, canonical and Open Graph tags; noindex on admin, status and 404; no inline scripts or styles (strict CSP); every link and asset resolves; official contact details, vision and mission wording; headline, slogan and five pillars; content never claims operator, regulator, guaranteed employment or funding roles, or invents statistics; mobile menu; the application form for each category, validation messages, double submit protection, confirmation shows the reference and never says approved; status page; admin login, dashboard, search, detail, review, recommendations, decisions, email composer (all templates, edit, preview, mailto link, copy, mark as sent), logout.

**Turnstile (54).** A local server imitates Siteverify so the REAL verification code runs. Verified: the call is a server side POST with secret, token, visitor IP and an idempotency key; the secret never reaches the browser; valid, missing, invalid, expired, reused tokens; tokens solved on another hostname or for another form rejected; an outage returns a safe 503 and is retried once with the same key; invalid forms are rejected before verification so the token is not burned; failed verification does not consume the allowance but repeated failures are limited at 60 per hour; a rejected secret gives a clear `captcha_misconfigured` and is not counted against visitors; diagnostics (admin only, no key values, counts by reason, secret check); **production mode ignores the test only Siteverify override and never bypasses**; the form renders the widget once, does not move or re-render it when the category changes, reacts to expiry and errors, resets the token after a rejection and submits the token the widget produced.

**Migration (20).** Migration 0001 is applied and filled with data, then 0002 is applied: every row in applications, history, reviews, communications, audit and admin tables is identical; rate limits cleared; the new type is accepted and invalid types, statuses and foreign keys still rejected; indexes and append only protection intact; re-running 0002 is safe.

**HTML audit (118).** Unique ids, heading order without skipped levels, labels on every form control, alt text, safe external links, no empty links or buttons, no insecure links, language, viewport, title and favicon, skip link and landmarks.

**Real browser layout (455).** At 320, 360, 390, 768, 1024 and 1440 pixel widths on every page: no horizontal scrolling, nothing outside the screen, touch targets at least 36 pixels, readable text, one h1, no console errors or failed assets, the menu collapses on phones and opens on tap with all links reachable, the full menu shows on wide screens; the membership form renders after choosing a category with no overflow and shows an error summary when submitted empty. Screenshots were reviewed by eye (not stored in the repository).

## Problems found by testing and fixed

- My rewrite of the application form script looked up an element before it was attached to the page, so the form would not render. Caught by the Turnstile browser test and fixed (`apply.js`).
- Turnstile failure logging was throttled globally, so a flood of one failure type could hide a configuration error. Now throttled per reason, and the dashboard counts failures by reason over 24 hours.
- Four stale test expectations and a timing race in the tests were corrected.

## NOT tested (needs Cloudflare configuration, a human or a real device)

| Not tested | Why | Evidence needed |
|---|---|---|
| **Real Turnstile with real keys** (widget display, token creation, live Siteverify) | No Cloudflare credentials or internet to Cloudflare. Only the Siteverify stand in was used | Submit a test application on the preview deployment and use the dashboard System check |
| Whether the Content Security Policy fully satisfies the live Turnstile widget | The policy follows the earlier fix (script, frame and connect to `challenges.cloudflare.com`) but could not be confirmed against the live widget | Browser console on the preview shows no CSP violations and the widget appears |
| Deployment, D1 production binding, secrets, remote migration | Not authorised and no access | README section 10 on the preview URL |
| Cloudflare Pages serving `404.html` with status 404 in production | Verified only in the local Pages emulator | Open a nonexistent URL on the deployment, expect the branded page with HTTP 404 |
| Opening a real email app from `mailto:` and long message truncation | A simulated browser cannot launch Gmail or Mail | Press "Save and open email" on a real device |
| Real phones, other browsers (Safari, Firefox), print layout | Only Chromium was available | Open the preview on an Android phone and an iPhone |
| Screen reader and keyboard only walkthrough | Only structure, labels, focus styles and contrast were checked | Manual pass with TalkBack or VoiceOver |
| Facebook share link and WhatsApp number behaviour | The Facebook link could not be opened by the tools used | Click both links |
| Performance and load, penetration testing | Not performed | Lighthouse and a professional test before large scale use |
| Hundreds of applications | Queries are indexed and paged, but only dozens of records were used | Load test if volumes grow |

## Known limitations

- A final decision cannot be changed in the dashboard (by design). Corrections need the maintainer.
- One administrator: a forgotten password needs the documented database reset. Five wrong passwords for the administrator email lock logins for that email for 15 minutes, which an attacker could use to nuisance lock the real administrator. Use a strong password and 2 step protected email.
- Test applications cannot be deleted. Start production with a fresh database.
- Duplicate detection is exact (same category, name, email, phone within 24 hours).
- Rate limits are per IP address in fixed windows. Mobile networks that share one address are covered by the generous 30 per hour and 100 per day limits.
- Each request, including static files, runs through the middleware and counts as a Pages Functions request.
