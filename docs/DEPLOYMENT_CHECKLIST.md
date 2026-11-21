# Deployment Checklist

Legend: [x] done and verified here · [ ] still to do

## A. Completed and verified (local testing)

- [x] Original ASWRA design preserved (`styles.css` changed only by 6 appended lines: footer spacing, smaller WhatsApp button on phones, hidden heading helper)
- [x] All pages audited, navigation identical everywhere, no broken links or assets, no console errors (455 real browser checks)
- [x] Layout verified in headless Chromium at 320, 360, 390, 768, 1024, 1440 pixels
- [x] Heading hierarchy, labels, alt text, contrast (HTML audit and calculated ratios)
- [x] SEO basics: titles, descriptions, canonical, Open Graph, robots.txt, sitemap.xml, noindex on private pages, branded 404 page
- [x] Institutional content corrected (positioning, five pillars, no invented facts or relationships)
- [x] Membership application: all five categories, server validation, injection safe, duplicates, unique references
- [x] Public status checker returns minimal data only
- [x] Turnstile server side verification code exercised against a Siteverify stand in (valid, missing, invalid, expired, reused, wrong host, wrong form, outage, misconfiguration)
- [x] Failed verification and invalid forms do not consume the legitimate allowance; 30 per hour and 100 per day enforced; old counters cannot block anyone
- [x] Administrator: login, session, expiry, logout, CSRF, access control, review, notes, recommendations, final decisions, history, communication records
- [x] Templates: acknowledgement, additional information, rejection with reason, approval, under review, information received, general update, clarification
- [x] Migrations 0001 and 0002 apply cleanly, keep all data, and 0002 is repeatable
- [x] No secrets in the repository or ZIP (`.dev.vars` ignored; examples contain placeholders)

## B. Requires Cloudflare configuration (you)

- [ ] Create D1 database `aswra-membership`; put its ID in `wrangler.toml`
- [ ] Bind it as `DB` (Production and Preview)
- [ ] `npm run db:migrate:remote` (after a backup if the database already has data)
- [ ] Turnstile widget with `aswra.pages.dev` (and preview hostnames) in Hostname Management
- [ ] `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET` from the **same** widget, in Production **and** Preview
- [ ] `APP_SECRET` and `ADMIN_SETUP_TOKEN` set; **do not** set `ENVIRONMENT`
- [ ] Redeploy after setting variables
- [ ] Create the administrator (`npm run setup:admin`), then delete `ADMIN_SETUP_TOKEN`
- [ ] Turn off the old GitHub Pages site

## C. Requires human confirmation (ASWRA)

- [ ] Approve and complete the privacy notice (`privacy.html`: the page itself says it is not yet approved and has items in square brackets). **Launch blocker.**
- [ ] State Coordinator's welcome message and photo; other executive names and positions (placeholders or absent)
- [ ] Confirm the Partnerships page wording is accurate and approved
- [ ] Confirm the Facebook link works and the WhatsApp number is right
- [ ] Decide whether NIN, identity documents or guarantor details will ever be collected (not collected now; the privacy notice and handling process must be approved first)
- [ ] Choose the administrator and an ASWRA email protected with 2 step verification

## D. Requires production testing (after deployment, on the preview URL)

- [ ] Real Turnstile: widget appears (no Content Security Policy errors) and a test application succeeds
- [ ] Dashboard System check shows no warnings and the secret check says "accepted"
- [ ] Submit, track, review, decide and prepare email on a real phone and a laptop
- [ ] "Save and open email" opens a real email app; Copy works
- [ ] Unknown address shows the branded 404 with status 404
- [ ] Appearance on real Android and iPhone browsers; keyboard and screen reader pass
- [ ] Start live with an empty database (new D1 database, migrations, binding, administrator)

## E. Not implemented because out of scope

Multiple administrators or reviewers, member or public accounts, payments, membership cards, automated email or Gmail integration, member directory, LGA module, CMS, analytics, mobile app, custom domain, unapproved third party integrations.
