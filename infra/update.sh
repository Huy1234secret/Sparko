#!/usr/bin/env bash
# Updates Sparko on the server to the latest main and restarts it.
# Run as the deploy user:  bash /opt/sparko/app/infra/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
ENV_FILE=${SPARKO_ENV_FILE:-/opt/sparko/shared/.env.production}

# The website's contact and operator details come from the env file, not
# the repository; without them the legal pages would show placeholders.
missing=()
for key in PUBLIC_APP_URL SUPPORT_EMAIL SUPPORT_DISCORD_INVITE OPERATOR_NAME OPERATOR_COUNTRY; do
  grep -Eq "^${key}=.+" "$ENV_FILE" 2>/dev/null || missing+=("$key")
done
if ((${#missing[@]})); then
  printf 'Stopped: %s is missing %s.\n' "$ENV_FILE" "${missing[*]}" >&2
  echo 'Add a line for each, like SUPPORT_EMAIL=you@example.com, then run this again.' >&2
  exit 1
fi

git pull --ff-only
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
pm2 restart ecosystem.config.cjs --update-env
pm2 save
pm2 ls
