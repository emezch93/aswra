# ASWRA Website and Membership Management System

Official website and membership application system for the **Anambra State Waste Recyclers Association (ASWRA)**.
HTML, CSS and vanilla JavaScript on **Cloudflare Pages**, with **Pages Functions** (API) and **Cloudflare D1** (database). No framework and no build step.

Live address (review): https://aswra.pages.dev/ · Repository: https://github.com/emezch93/aswra

What it does: a public website (Home, About, What We Do, Partnerships, Leadership, Membership, Contact, Privacy), a category aware online application form protected by Cloudflare Turnstile, a public application status checker, and a private dashboard (`/admin/`) for **one** administrator to review applications, record recommendations and official decisions, and prepare manual email responses. The system never sends email itself.

## 1. Requirements

- A GitHub account and a Cloudflare account (free plan is enough to start; check Cloudflare's current limits and pricing).
- Node.js 20 or newer and npm, to run locally and to use the Wrangler command line tool.
- A Cloudflare Turnstile widget (free) and a D1 database (free allowance).

## 2. Install and run locally

```bash
git clone https://github.com/emezch93/aswra.git && cd aswra-mvp
npm install
cp .dev.vars.example .dev.vars        # edit: set APP_SECRET and ADMIN_SETUP_TOKEN to long random values
npm run db:migrate:local              # creates the local (SQLite) database from migrations/
npm run dev                           # http://localhost:8788
```

Create the local administrator once: `SITE_URL=http://localhost:8788 npm run setup:admin`, then open `http://localhost:8788/admin/`.
Locally, `ENVIRONMENT=development` lets the form work without Turnstile keys (works on `localhost` only). To test with Turnstile locally, put Cloudflare's published test keys in `.dev.vars`.

Run all automated tests: `sh tests/run-all.sh` (see `docs/TESTING.md`).

## 3. Configure Cloudflare Pages

Workers & Pages, your project, Settings:

| Setting | Value |
|---|---|
| Production branch | `main` (merge to it only after approval) |
| Build command | *(empty)* |
| Build output directory | `/` |
| Root directory | *(empty)* |

Pull request and branch pushes create **preview** deployments. Environment variables and bindings exist **separately for Production and Preview** and must be set for both.

## 4. Configure the D1 database

```bash
npx wrangler login
npx wrangler d1 create aswra-membership
```
1. Copy the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`).
2. In the Pages project: Settings, Bindings, **Add, D1 database**. Variable name **`DB`**, database `aswra-membership`. Do it for Production and Preview.

## 5. Apply migrations

```bash
npm run db:migrate:remote     # applies migrations/0001 and 0002 to the REAL database
```
Wrangler records which migrations ran, so running it again only applies new ones. Migration 0002 is safe on a database that already has data (see `docs/DATABASE_SETUP.md`). Back up first: `npx wrangler d1 export aswra-membership --remote --output backup.sql`.

## 6. Configure Turnstile (spam protection)

1. Cloudflare dashboard, **Turnstile**, **Add widget**. Hostnames: `aswra.pages.dev` (add preview hostnames you test on). Mode: Managed.
2. The widget page shows **two** values: a *Site key* (public) and a *Secret key* (private). **Both must come from the same widget.**
3. Add them to the Pages project (Production **and** Preview):

| Name | Type | Value |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Variable (text) | Site key of the widget |
| `TURNSTILE_SECRET` | **Secret** | Secret key of the **same** widget |

Real server side verification runs for every application (`functions/_lib/guards.js` calls Cloudflare's Siteverify). Without a secret the form refuses submissions (fails closed). Problems: read `docs/TURNSTILE_TROUBLESHOOTING.md`, which also explains the dashboard's **System check**.

## 7. Required environment variables

| Name | Type | Purpose |
|---|---|---|
| `APP_SECRET` | Secret | Random text used to hash IP addresses and duplicate checks. Keep it stable once set. |
| `ADMIN_SETUP_TOKEN` | Secret | One time key to create the administrator. **Delete it after use.** |
| `TURNSTILE_SITE_KEY` | Variable | Public widget key (served to the browser). |
| `TURNSTILE_SECRET` | Secret | Private Turnstile key. Never in code or the browser. |
| `DB` | D1 binding | The database. |
| `ENVIRONMENT` | **Do not set in Cloudflare** | Local development switch only. |

Generate a random secret in PowerShell: `$b=New-Object byte[] 48;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);[Convert]::ToBase64String($b)`. Never commit secrets: `.dev.vars` is git ignored.

## 8. Create the administrator securely (once)

After the site is deployed with the secrets above:
```bash
SITE_URL=https://aswra.pages.dev ADMIN_SETUP_TOKEN=<token> npm run setup:admin
```
Enter an ASWRA controlled email and a password of at least 12 characters (hidden). The password travels over HTTPS and is stored only as a PBKDF2 hash. Then **delete the `ADMIN_SETUP_TOKEN` secret**. The endpoint refuses to run again, and the database allows only one administrator row. Forgotten password procedure: `docs/DATABASE_SETUP.md`.

## 9. Deploy

Push your branch. Cloudflare builds a preview URL (Deployments tab). Test it (step 10). When approved, merge to `main` for production. **Secrets and bindings only apply to new deployments**, so redeploy (push a commit or "Retry deployment") after changing them.

## 10. Verify the deployment

1. `/api/health` returns `{"status":"ok"}`.
2. Every page loads; `/does-not-exist` shows the branded 404 page; `/docs/README.md` and `/wrangler.toml` return 404.
3. Open `/membership#apply`, choose a category, solve the Turnstile check and submit a clearly fake test application. You get a reference like `ASWRA-2026-XXXXXXXXXXXX`.
4. `/application-status/` with that reference shows **Pending**.
5. `/admin/` login, open the application, run **System check** (expand it, press *Ask Cloudflare to check the secret key*).
6. Move the application to Under Review, add a note, prepare an email (needs an email app on the device).
7. For launch, start with an empty database (test applications cannot be deleted): create a new D1 database, run migrations, bind it, create the administrator again.

## 11. Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `captcha_failed` / "Verification failed" | See `docs/TURNSTILE_TROUBLESHOOTING.md`. Most often the site key and secret key are from different widgets, or were set in only one environment. |
| `captcha_unconfigured` | `TURNSTILE_SECRET` is missing in this environment (Production and Preview are separate). Redeploy after setting it. |
| `captcha_misconfigured` | Cloudflare rejected the secret. Copy it again from the widget. |
| "Spam protection ... not set up yet" on the form | `TURNSTILE_SITE_KEY` is missing in this environment. |
| Widget does not appear | Check the hostname is listed on the widget, disable content blockers, check the browser console for Content Security Policy messages. |
| `/api/...` returns 500 or "not configured" | `DB` binding missing, or `APP_SECRET` not set, or migrations not applied. |
| Admin login fails for the right password | Wait 15 minutes if you hit the rate limit. Confirm the setup ran on this database (Production and Preview use separate bindings). |
| Changed a variable but nothing changed | Redeploy; variables apply to new deployments only. |
| Forms on `emezch93.github.io` fail | That static copy has no backend. Turn GitHub Pages off. |

## Project structure

```
index.html about.html activities.html partnerships.html leadership.html membership.html contact.html privacy.html 404.html
application-status/index.html     public status checker
admin/index.html                  administrator dashboard
a.jpg  robots.txt  sitemap.xml
assets/css/styles.css admin.css   assets/js/ site.js apply.js status.js admin.js admin-templates.js dom.js form-schema.js
functions/_middleware.js          security headers; hides non-public files
functions/_lib/                   http, crypto, guards (rate limits + Turnstile), auth, validation, workflow
functions/api/                    applications, application-status, config, health
functions/api/admin/              login, logout, session, setup, dashboard, diagnostics, applications/..., communications/...
migrations/0001_initial_schema.sql  0002_audit_fixes.sql
scripts/                          secure-admin-setup.js, sync-layout.js
tests/                            e2e, ui, turnstile, migration, html-audit, layout, run-all.sh
docs/                             deployment, database, admin guide, testing, audit report, checklist, privacy draft, handover
```
Shared header, footer, canonical and Open Graph tags are generated into every page by `npm run layout` (edit `scripts/sync-layout.js`, then run it). The membership form is defined once in `assets/js/form-schema.js` and used by both the browser and the server.

## Documents

`docs/AUDIT_REPORT.md` · `docs/DEPLOYMENT_CHECKLIST.md` · `docs/TURNSTILE_TROUBLESHOOTING.md` · `docs/DEPLOYMENT.md` · `docs/DATABASE_SETUP.md` · `docs/ADMIN_GUIDE.md` · `docs/TESTING.md` · `docs/PRIVACY_NOTICE_DRAFT.md` · `docs/ASWRA_HANDOVER_GUIDE.md`
