# Deployment Guide

The complete, current procedure is in the root **README.md** (sections 3 to 11). This file adds the reasoning and a few reminders.

## Order of work

1. Push a branch. Cloudflare builds a **preview** deployment. Production (`main`) stays untouched until ASWRA approves.
2. Create the D1 database, bind it as `DB` (Production **and** Preview), apply migrations remotely.
3. Create the Turnstile widget. Set `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET`, `APP_SECRET`, `ADMIN_SETUP_TOKEN` in Production **and** Preview.
4. Redeploy so the new variables apply.
5. Create the administrator with `npm run setup:admin`, then delete `ADMIN_SETUP_TOKEN`.
6. Run the verification steps in README section 10 on the preview URL, including the dashboard **System check**.
7. Merge to `main`.

## Reminders

- Never add `ENVIRONMENT=development` in Cloudflare. It only exists for local testing and only works on `localhost`.
- `wrangler.toml` has no `pages_build_output_dir` on purpose: Cloudflare Pages ignores it and keeps its dashboard settings.
- `functions/_middleware.js` runs for every request, adds security headers and returns 404 for repository files (`docs/`, `migrations/`, `functions/`, `scripts/`, `tests/`, `wrangler.toml`, `package.json`, `README.md`). Each request counts as a Functions request on the free plan. Check Cloudflare's current limits.
- The Content Security Policy allows only this site and `challenges.cloudflare.com` (Turnstile). If you add any other script, font or embed, the policy must be changed deliberately.
- Disable the old GitHub Pages site (`emezch93.github.io/aswra`): it is a static copy with no backend.
- No custom domain is configured. If one is added later: add it to the Turnstile widget hostnames, update the canonical and sitemap addresses in `scripts/sync-layout.js` and `sitemap.xml`, then run `npm run layout`.
