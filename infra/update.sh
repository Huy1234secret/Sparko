#!/usr/bin/env bash
# Updates Sparko on the server to the latest main and restarts it.
# Run as the deploy user:  bash /opt/sparko/app/infra/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git pull --ff-only
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
pm2 restart ecosystem.config.cjs --update-env
pm2 save
pm2 ls
