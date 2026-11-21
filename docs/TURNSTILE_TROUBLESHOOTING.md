# Turnstile Troubleshooting

## The reported problem

The form returned `{"error":"Verification failed. Please try again.","code":"captcha_failed"}` and Turnstile showed "Siteverify isn't being called for ASWRA Membership Protection".

## What the investigation found

1. **The server side call itself was correct.** The code posts the secret, the visitor's token and IP to `https://challenges.cloudflare.com/turnstile/v0/siteverify` as a form, as Cloudflare documents. (Verified with a local stand in for Siteverify: request format, token reuse, expiry, errors.)
2. **The old code threw away Cloudflare's answer.** Any `success: false` became the same generic `captcha_failed`, so the real reason (an `error-codes` list) was never visible. That made this problem impossible to diagnose. Fixed: the reason is now classified, logged (without tokens or secrets) and shown in the dashboard.
3. **Your two symptoms point to a key mismatch.** "Siteverify isn't being called for *this* widget" while verification fails means the secret key in use belongs to a **different** widget than the site key shown on the page (Cloudflare accepts the call, but under the other widget, and answers `invalid-input-response`). A secret and site key from two widgets can never validate each other's tokens. Other common causes are in the table below.
4. **Real code defects that could also break verification (fixed):**
   - The widget element was moved inside the page whenever the visitor changed category, which reloads the Turnstile iframe and leaves a stale or duplicate token.
   - Verification ran before form validation, so every invalid form used up the visitor's single use token.
   - The form discarded widget errors, expiry and script load failures silently.
   - Keys pasted with stray spaces, line breaks or quote marks were used as is (now cleaned).
   - No check that the token was solved on this site and for this form (now checks hostname and action).

**I cannot see your Cloudflare dashboard or production variables, so the exact production cause could not be confirmed from here.** Follow the steps below to confirm it.

## Fix it in 5 minutes

1. Cloudflare dashboard, **Turnstile**, open the widget named **ASWRA Membership Protection**. Note its **Site key** and click to reveal its **Secret key**.
2. Pages project, **Settings, Variables and Secrets**. Check **Production and Preview separately**:
   - `TURNSTILE_SITE_KEY` equals that widget's site key.
   - `TURNSTILE_SECRET` equals that widget's secret key (re-enter it; delete and add again if unsure).
   - There must be no other widget's keys, no spaces, no quotes.
3. Widget **Hostname Management** lists `aswra.pages.dev` (and any preview hostname you test on).
4. **Redeploy** (Deployments, Retry deployment). Variables only apply to new deployments.
5. Open `/admin/`, expand **System check: spam protection**, press **Ask Cloudflare to check the secret key**. "Accepted" means the secret is valid. It cannot prove the site key matches, so also confirm step 2 by eye.
6. Submit a test application. Then look at **Verification failures in the last 24 hours** in the System check.

## What each failure reason means

| Reason shown | Cloudflare code | Meaning | Action |
|---|---|---|---|
| `invalid` | `invalid-input-response` | Token malformed, or issued by another widget than the secret's | Check both keys are from the SAME widget; check the token reaches the server |
| `expired` | `timeout-or-duplicate` | Token older than 5 minutes or already used | Visitor repeats the check (the form now resets the widget automatically) |
| `misconfigured` | `invalid-input-secret` / `missing-input-secret` | Secret wrong or empty | Re-copy the secret key |
| `mismatch` | (our check) | Token solved on another hostname, or for another form | Add the hostname to the widget; check nobody is replaying tokens |
| `unavailable` | none / 5xx | Cloudflare unreachable | Temporary. The call is retried once automatically |

Browser side widget errors show a code (for example `110200` means the domain is not allowed on the widget, `110100` means the site key is invalid).

## If the widget does not appear at all

Open the browser developer tools Console. Content Security Policy messages mention `challenges.cloudflare.com`. The site's policy already allows that host in `script-src`, `frame-src` and `connect-src` (`functions/_middleware.js`). Do not widen it further without a specific blocked URL. Content blockers and some school or office networks can also block the widget.

## Never

Do not disable verification to "make it work". Without `TURNSTILE_SECRET` the form deliberately refuses submissions in production.
