#!/bin/sh
# Runs both automated test suites against a freshly reset LOCAL database.
set -e
sh tests/reset-local.sh
node tests/e2e.mjs | tee docs/e2e-run-log.txt | tail -3
sh tests/reset-local.sh
node tests/ui.mjs | tee docs/ui-run-log.txt | tail -3
