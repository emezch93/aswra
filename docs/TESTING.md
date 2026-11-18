# Testing Report

Date of last full run: 17 November 2026. Environment: Node 22, `wrangler pages dev` 4.164 with a **local** D1 (SQLite) database. Nothing was run against a real Cloudflare account, production database or the live site.

Run everything yourself with `sh tests/run-all.sh` (resets the LOCAL database first). Raw output: `docs/e2e-run-log.txt` and `docs/ui-run-log.txt`.

## Summary

| Suite | Checks | Passed | Failed |
|---|---|---|---|
| API and database (`tests/e2e.mjs`) | 166 | 166 | 0 |
| Browser level (`tests/ui.mjs`, simulated browser, real API) | 145 | 145 | 0 |
| Manual and one off checks (below) | 5 | 5 | 0 |

## API and database tests (166)

| Area | Checks | What was verified |
|---|---|---|
| Health and anonymous access | 13 | Health reveals only `status`. Every admin endpoint returns 401 without a session. |
| One time administrator setup | 7 | Missing and wrong token refused. Weak password refused. Setup works once, then is refused. The database itself rejects a second administrator. Password stored as PBKDF2 hash. |
| Login, session, cookies | 9 | Wrong password and unknown email give the same message. Cookie is `HttpOnly`, `SameSite=Strict`, with Max-Age. Password never returned. Raw session token is not stored (hash only). |
| Application submission and validation | 28 | Valid applications saved for all five categories. Unique references. Duplicate refused (409). Missing contact person, bad email, bad phone, unknown LGA, unknown category, missing declaration or privacy consent, wrong select or checkbox values, bot honeypot, wrong content type, malformed JSON, oversized body all rejected. Markup and SQL injection text stored harmlessly. Tables intact afterwards. |
| Public status | 8 | Valid reference works (also lower case). Only `status`, `message`, `updatedAt` returned. No personal data. Unknown, malformed and injection references return the same safe 404. |
| Dashboard, search, filters, sort, pages | 16 | Counts from real data. Search by name, reference, email. Category and status filters. Empty results. Sorting. Pagination. Injection in search, LIKE wildcards and sort column are harmless. Bad and unknown ids handled. |
| Application detail | 2 | Full data returned. History starts with the submission entry. |
| Approval workflow | 27 | Cannot approve a Pending application. Status endpoint cannot set Approved or Rejected. Cannot skip Under Review. Private notes, information request with applicant message, recommendation, official approval with explicit confirmation. A recommendation is shown publicly as a recommendation, not as approval. Old applicant message cleared on change. Final decision cannot be reversed or changed. History, notes and decision date retained. Database blocks editing history and deleting the audit log. Internal notes never appear in public responses. |
| Rejection workflow | 8 | Reason category and explanation required. Listed categories only. Recommendation to reject is not shown as Rejected. Official rejection and applicant message. Reason stored in history. Dashboard counts update. |
| Email records | 13 | Placeholders, empty subject, short body, unknown type rejected. Recipient always comes from the application (client supplied recipient ignored). Saved as **Prepared**, never Sent. Can be marked Marked as Sent once, only with that exact status. |
| CSRF and origin | 4 | Missing token, wrong token, foreign Origin and missing Origin all rejected (403). |
| Static files and headers | 13 | `docs/`, `migrations/`, `wrangler.toml`, `package.json`, `functions/`, `scripts/`, `.dev.vars*`, `tests/`, `README.md` return 404. CSP, `nosniff`, frame blocking headers present. API not cacheable. Public config exposes no secrets. |
| Audit log | 9 | Setup, login, failed login, status change, recommendation, decision, review note, communication prepared and marked sent are all recorded. |
| Session expiry and logout | 5 | Expired session rejected. Idle session (3 hours) rejected. Logout invalidates the session on the server. |
| Rate limiting | 4 | Login locks after repeated failures (even correct password blocked, `Retry-After` set). Application submissions and status lookups limited (429). |

## Browser level tests (145)

Real page scripts were bundled and run in jsdom against the real local API and database.

| Area | Checks | What was verified |
|---|---|---|
| Public pages | 66 | All pages return 200. Title, description, one `h1`, `lang`, skip link, landmarks, nav links. Images have `alt`. No inline scripts or `style` attributes (so the strict CSP works). Every internal link and asset resolves. Phone numbers, email and address match the official details. Vision and mission match the approved wording. The five exact membership categories. No benefits guarantee. Leadership uses placeholders. |
| Navigation | 7 | Menu opens and closes, `aria-expanded` updates, current page marked, countdowns render, no script errors. |
| Application form | 22 | Category specific fields for all five categories. Nothing hidden until a category is chosen. No NIN, bank, upload or guarantor fields. Error summary, per field errors, `aria-invalid`. Browser side email and phone checks. Submit button disabled while sending. Double submit saves only one application. Confirmation shows the reference, tells the applicant to keep it and does not say approved. |
| Status page | 5 | Malformed, unknown and valid references. No personal details displayed. Link prefill. |
| Dashboard | 14 | Login error and success. Statistics. Table columns. Markup in a name is shown as text and not executed. Search, empty state, opening a record, full detail, labelled private, public and email fields. |
| Review controls | 5 | Status change, decision controls only appear after review starts, recommendation, history timeline with private notes marked Private. |
| Email composer | 16 | Approval template (exact approved subject, name and reference filled in, no promises). Rejection and additional information templates. Specific text inserted. Edit and preview. Unfinished template cannot be saved. Mailto link built with recipient, subject, message and reference. Prepared is not shown as sent. Copy fallback. Mark as sent. Explanations that the system never sends email and that Marked as Sent is not proof of delivery. |
| Decision | 5 | Rejection reason field appears. Official approval. Controls removed afterwards. Applicant sees Approved. |
| Logout | 5 | Returns to login. Old session rejected by the API. Fresh browser sees login only. No credentials or secrets in admin page source. |

## Manual and one off checks (5)

1. **Fails closed in production mode.** A second server was started with `ENVIRONMENT=production` and no Turnstile secret. `POST /api/applications` returned 503 `captcha_unconfigured` and nothing was saved.
2. **Administrator reset procedure.** Deleting the administrator row works even though history refers to it (links become empty, history kept), and setup can then be run again.
3. **Applications with history cannot be deleted** (database refuses).
4. **Colour contrast** of the main text, button, link and header colour pairs was calculated: all at least 4.5:1 (WCAG AA for normal text). Lowest: 4.56:1 (green eyebrow text on the dark header green).
5. **Schema applies cleanly** on a fresh database (24 statements, including the single administrator index and append only triggers).

## Problems found and fixed during testing

- The application form did not render the category fields (lists were passed to a DOM method that turns them into text). Found by the browser tests, fixed in `apply.js`, `admin.js` and `dom.js`.
- Rejection reasons defaulted to the first category, which could cause a wrong reason to be pre filled. They now start blank so the template keeps its placeholder until the administrator chooses or writes a reason.
- Test mistakes (a GET request with a body, wrong page size expectation, a timing race) were fixed in the tests, not the product.

## NOT tested (needs external configuration or a real device)

| Not tested | Why |
|---|---|
| Deployment to Cloudflare Pages, production D1, bindings and secrets | No Cloudflare credentials were used. Nothing was deployed. |
| **Real Cloudflare Turnstile** verification (widget and server check) | Needs real site and secret keys and internet access. Only the "no keys" paths were tested (local bypass, production fails closed). |
| Opening a real email app from `mailto:` | A simulated browser cannot launch Gmail or Mail. The generated link was checked, not the app. Very long messages may be truncated by some email apps, so the page offers Copy. |
| Clipboard copy in real browsers | Tested with a stand in clipboard. |
| **Visual layout** on phones, tablets and desktops, and different browsers (Chrome, Safari, Firefox, Edge) | jsdom has no layout engine. Responsive CSS was written for mobile first but has not been viewed on real screens. **Please check on a phone and a laptop before showing the client.** |
| Screen reader testing, keyboard only walkthrough | Only structural accessibility (labels, landmarks, `aria` attributes, contrast) was checked. |
| Facebook link and WhatsApp number behaviour | The Facebook share link `https://www.facebook.com/share/1J9RiHkSam/` could not be opened by the tools used, so it is **unverified**. Confirm it works. The WhatsApp link uses the first official number (07085379538). |
| Performance, load and penetration testing | Not performed. Rate limiting and injection basics were tested only. |
| Behaviour with hundreds of applications | The queries are indexed and paged, but only about a dozen records were used. |

## Known limitations

- A final decision (Approved or Rejected) cannot be changed in the dashboard. A correction needs the maintainer.
- There is one administrator. A forgotten password needs the maintainer (see `DATABASE_SETUP.md`).
- Test applications cannot be deleted. Start the live system with a fresh database.
- Duplicate detection is exact match (same category, name, email and phone within 24 hours).
- Rate limiting uses fixed time windows keyed to the visitor's IP address.
- Because `functions/_middleware.js` runs on every request, every page view counts as a Functions request on Cloudflare.
- No dark mode (the earlier prototype had one).
- Facebook link, State Coordinator message and executive details are placeholders or unverified (see the handover notes).
