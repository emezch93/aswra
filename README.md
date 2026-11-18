# ASWRA Website and Membership Management System

Website and membership application system for the **Anambra State Waste Recyclers Association (ASWRA)**.

Built with HTML, CSS and vanilla JavaScript, Cloudflare Pages, Cloudflare Pages Functions (backend API) and Cloudflare D1 (database). No frameworks and no build step.

## What it does

1. **Public website** with six pages: Home, About, What We Do, Leadership, Membership, Contact (plus a privacy notice page).
2. **Membership application form** that adapts to the membership category, validates on the server and saves to D1 with an unpredictable reference such as `ASWRA-2026-7K3M9Q2XB4TD`.
3. **Application status page** where applicants check progress with their reference.
4. **Private admin dashboard** (`/admin/`) for one administrator: search, filters, review notes, recommendations, official decisions, message templates and manual email records.

The system never sends email by itself. It prepares messages and opens the administrator's own email app (`mailto:`). "Marked as sent" is a manual record, not proof of delivery.

## Project structure

```
index.html about.html activities.html leadership.html membership.html contact.html privacy.html
application-status/index.html     public status checker
admin/index.html                  administrator dashboard
a.jpg                             ASWRA logo (existing asset)
assets/css/                       styles.css (site), admin.css (dashboard)
assets/js/                        site.js, apply.js, status.js, admin.js, admin-templates.js, dom.js
assets/js/form-schema.js          membership form definition shared by browser AND server
functions/_middleware.js          security headers; hides non-public files
functions/_lib/                   http, crypto, guards (rate limit, Turnstile), auth, validation, workflow
functions/api/                    public API (applications, application-status, config, health)
functions/api/admin/              login, logout, session, setup, dashboard, applications/..., communications/...
migrations/0001_initial_schema.sql
scripts/                          secure-admin-setup.js, sync-layout.js
tests/                            e2e.mjs (API), ui.mjs (browser level), reset-local.sh, run-all.sh
docs/                             deployment, database, admin guide, testing, privacy draft, handover
wrangler.toml  .dev.vars.example  package.json
```

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars        # then edit the placeholder values
npm run db:migrate:local              # creates the LOCAL database
npm run dev                           # http://localhost:8788
```

Create the local administrator (once):

```bash
SITE_URL=http://localhost:8788 npm run setup:admin
```

Open `http://localhost:8788/admin/`. Run the automated tests with `sh tests/run-all.sh`.

## How the backend works

- Every request passes through `functions/_middleware.js`, which adds security headers (strict Content Security Policy) and returns 404 for repository files that must not be public (`docs/`, `migrations/`, `functions/`, `wrangler.toml` and so on).
- Public endpoints: `POST /api/applications`, `GET /api/application-status`, `GET /api/config`, `GET /api/health`.
- Administrator endpoints live under `/api/admin/` and all require a valid session cookie. State changing requests also need a CSRF token and a same origin `Origin` header.
- Status changes, history rows and audit rows are written together in one atomic database batch.
- Recommendations never create a final status. Only `POST /api/admin/applications/:id/decision` can produce `Approved` or `Rejected`, and a final decision cannot be changed.

## Database

Eight tables: `applications`, `application_reviews`, `application_status_history`, `admin_users`, `admin_sessions`, `communication_logs`, `audit_logs`, `rate_limits`. See `docs/DATABASE_SETUP.md`.

## Changing the navigation or footer

Edit the templates in `scripts/sync-layout.js`, then run `npm run layout`.

## Documents

`docs/DEPLOYMENT.md` · `docs/DATABASE_SETUP.md` · `docs/ADMIN_GUIDE.md` · `docs/TESTING.md` · `docs/PRIVACY_NOTICE_DRAFT.md` · `docs/ASWRA_HANDOVER_GUIDE.md`
