# Deployment Guide (Cloudflare Pages + D1)

This guide is for the developer. Nothing in this repository changes Cloudflare for you. Follow the steps in order. Do not deploy to the live site until ASWRA has approved the work.

## 0. What you need

- The GitHub repository (branch `feature/membership-system`) and a Cloudflare account with the existing Pages project.
- Node.js 20+ on your computer and `npm install` run once in the project folder.
- Later, ASWRA's own accounts (see `ASWRA_HANDOVER_GUIDE.md`).

## 1. Review on a branch first

Push `feature/membership-system`. Cloudflare Pages builds a **preview** deployment for non production branches. Keep the production branch (`main`) unchanged until the preview has been tested and approved.

## 2. Pages build settings (verify, usually no change)

In Cloudflare, Workers & Pages, your project, Settings, Builds:

| Setting | Value |
|---|---|
| Build command | *(empty)* |
| Build output directory | `/` (project root) |
| Root directory | *(empty)* |

The `functions/` folder is detected automatically. `wrangler.toml` has no `pages_build_output_dir` on purpose, so Pages ignores it and keeps its own settings.

## 3. Create the D1 database

```bash
npx wrangler login
npx wrangler d1 create aswra-membership
```

Copy the printed `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`). The ID is not secret but is account specific.

## 4. Apply the migration to the REMOTE database

```bash
npm run db:migrate:remote
```

Check: `npx wrangler d1 execute aswra-membership --remote --command "SELECT name FROM sqlite_master WHERE type='table'"` lists eight tables.

## 5. Bind the database to the Pages project

Pages project, Settings, Bindings (or Functions), Add, **D1 database**:

- Variable name: `DB`
- Database: `aswra-membership`

Add it for **both Production and Preview** environments.

## 6. Secrets and variables

Pages project, Settings, Variables and Secrets. Add for **Production and Preview**:

| Name | Type | Value |
|---|---|---|
| `APP_SECRET` | Secret | Long random text (`openssl rand -base64 48`). Used to hash IP addresses and duplicate checks. Keep it stable. |
| `ADMIN_SETUP_TOKEN` | Secret | Different long random text. Needed only once, for step 8. |
| `TURNSTILE_SECRET` | Secret | From the Turnstile widget (step 7). |
| `TURNSTILE_SITE_KEY` | Variable (plain text) | From the Turnstile widget. Public by design. |

**Never** add `ENVIRONMENT=development` in Cloudflare. It exists only for local testing and only works on `localhost` anyway. Without Turnstile keys the application form **refuses submissions** (it fails closed).

## 7. Cloudflare Turnstile (spam protection)

Cloudflare dashboard, Turnstile, Add widget. Add the Pages hostname (for example `aswra-mvp.pages.dev`) and, for previews, the preview hostnames you use. Choose "Managed". Copy the site key and secret into step 6.

## 8. Create the single administrator (one time)

Deploy first (push the branch) so the secrets are active, then on your computer:

```bash
SITE_URL=https://YOUR-SITE.pages.dev ADMIN_SETUP_TOKEN=<the token> npm run setup:admin
```

It asks for the administrator's email (use an ASWRA controlled address) and a password (12+ characters, hidden). The password is sent over HTTPS, hashed on the server (PBKDF2 SHA 256) and never stored in clear text.

**Immediately afterwards delete the `ADMIN_SETUP_TOKEN` secret.** The endpoint also refuses to run if an administrator already exists, and the database allows only one administrator row.

## 9. Deploy and verify

1. Open `/api/health`: expect `{"status":"ok"}`.
2. Open each page: Home, About, What We Do, Leadership, Membership, Contact, `/application-status/`.
3. Open `/docs/DEPLOYMENT.md` and `/wrangler.toml`: expect **404**.
4. Submit a test application (use obviously fake details). Expect a reference.
5. Check it on the status page: expect Pending.
6. Log in at `/admin/`, find the test application, move it to Under Review, add a note.
7. Prepare an email and confirm your email app opens (needs a mail app on your device).
8. Clean up: test applications cannot be deleted (history is protected on purpose). Before real launch, create a **new** D1 database, run the migration, bind it as `DB` and create the administrator again, so the live system starts empty.

## 10. Local development

See README. `npm run dev` uses a local SQLite copy in `.wrangler/` that never touches production.

## 11. Disable the old GitHub Pages site

`https://emezch93.github.io/aswra-mvp/` is a static copy with no backend. After this release the forms there cannot work. Turn it off in GitHub, Settings, Pages.

## 12. Cloudflare plan and limits

Pages Functions requests and D1 usage are covered by free allowances, but limits and prices change. Check Cloudflare's current pricing and limits before launch. Note that `functions/_middleware.js` runs for every request, so each page and asset request counts as a Functions request. If traffic grows large, consider a paid plan.
