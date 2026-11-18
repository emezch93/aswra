#!/bin/sh
# Resets the LOCAL development database (never touches production) and restarts the local server.
for p in $(pgrep -f '[w]rangler.*pages dev'); do kill "$p" 2>/dev/null; done
pkill -x workerd 2>/dev/null; sleep 2
rm -rf .wrangler/state
export WRANGLER_SEND_METRICS=false CI=1
npx wrangler d1 migrations apply aswra-membership --local >/dev/null 2>&1
setsid nohup npx wrangler pages dev . --d1=DB=REPLACE_WITH_YOUR_D1_DATABASE_ID --port 8788 > /tmp/wrangler.log 2>&1 < /dev/null &
sleep 14
curl -s -m 5 localhost:8788/api/health; echo
