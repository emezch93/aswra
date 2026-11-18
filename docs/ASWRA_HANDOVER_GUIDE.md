# Handover Guide: moving the project to ASWRA

Written in plain language for ASWRA representatives. During development the website runs on the developer's own accounts. After ASWRA approves it, everything must move to accounts that **ASWRA owns**, so the Association keeps control even if the developer is not available.

**Rule: never share passwords with anyone, including the developer, by chat or email.** Each person signs in to their own account. Access is shared using invitations.

## What ASWRA needs to own

| Item | Why |
|---|---|
| A Google account for ASWRA | The root email for all other accounts. Use an address like the existing official one, or a new dedicated one. |
| A GitHub account (and a free "organisation") | Holds the website's source code. |
| A Cloudflare account | Runs the website, database and spam protection. |
| (Later) A domain name | Not part of this release. The site keeps using the `pages.dev` address. |

## Step 1: Secure the Google account
1. Sign in to Chrome with the ASWRA Google account.
2. Turn on **2 step verification** (Google Account, Security).
3. Add a recovery phone and recovery email. Two named officers should know where the recovery details are kept.

## Step 2: Create the GitHub account
1. Go to github.com and choose **Sign up**. Use the ASWRA Google email. Choose a username such as `aswra`.
2. Verify the email code, then turn on two factor authentication (Settings, Password and authentication). Save the recovery codes safely.
3. Create a free **organisation** named after ASWRA and invite the developer as a member only while work continues.

## Step 3: Move the code
The developer opens the repository, Settings, Danger Zone, **Transfer ownership**, and transfers it to the ASWRA organisation. ASWRA accepts the transfer. The full history is kept.

## Step 4: Create the Cloudflare account
1. Go to cloudflare.com and **Sign up** with the ASWRA email. Turn on two factor authentication.
2. Add a payment method **only if ASWRA chooses a paid plan**. The free plan is enough to start. Check Cloudflare's current pricing and limits before launch.
3. Invite the developer as a member (Manage Account, Members) with access limited to what is needed.

## Step 5: Rebuild the project in ASWRA's Cloudflare
A Pages project cannot be moved between accounts, so the developer recreates it in ASWRA's account following `DEPLOYMENT.md`: connect the ASWRA GitHub repository, create a new database, set the secrets, create the Turnstile widget, and create the administrator with an ASWRA email and a password chosen by the administrator.

The developer never needs to know the administrator's password.

## Step 6: Check and switch over
1. Test on the new address: submit a test application, track it, review it in the dashboard.
2. Start with an empty database for the real launch (test records are not carried over).
3. Tell the public the new web address.

## Step 7: Remove the developer's access
When ASWRA is happy: remove the developer's old Pages project and database from the developer's own accounts, and reduce or remove the developer's access to ASWRA's accounts if no ongoing support is agreed.

## Keep safe
- The administrator email and password: only the administrator.
- Recovery codes for Google, GitHub and Cloudflare: two named officers.
- Database backups (see `DATABASE_SETUP.md`): they contain personal data, so keep them private.
- Review the privacy notice (`PRIVACY_NOTICE_DRAFT.md`) before launch.

## Who to call
The system maintainer: [name and contact, to be filled in]. Anything that needs the database or code changed (for example a forgotten administrator password or a mistaken decision) goes through the maintainer.
