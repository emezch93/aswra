#!/bin/sh
# Runs every automated suite against freshly reset LOCAL databases. Never touches production.
# Optional real browser layout test (needs: npm i --no-save puppeteer-core @sparticuz/chromium):  node tests/layout.mjs
set -e
sh tests/reset-local.sh
node tests/e2e.mjs | tee docs/e2e-run-log.txt | tail -2
sh tests/reset-local.sh
node tests/ui.mjs | tee docs/ui-run-log.txt | tail -2
node tests/turnstile.mjs | tee docs/turnstile-run-log.txt | tail -2
node tests/migration.mjs | tee docs/migration-run-log.txt | tail -2
node tests/html-audit.mjs | tee docs/html-audit-log.txt | tail -2
