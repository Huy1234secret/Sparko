#!/usr/bin/env bash
# Runs on the server as the deploy user, called by the GitHub "Deploy"
# workflow after it uploads a release archive:
#
#   bash deploy-release.sh <commit-sha>
#
# Order: back up the database, build the release, migrate and start it, then
# check health. If the new release is unhealthy, the previous release is
# started again (the database schema only moves forward). Old releases beyond
# the last five are removed.
set -euo pipefail

SHA=${1:?commit sha required}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full commit sha.' >&2; exit 1; }
ROOT=/opt/sparko
ENV_FILE=$ROOT/shared/.env.production
RELEASE=$ROOT/releases/$SHA
ARCHIVE=$ROOT/incoming/$SHA.tar.gz
[[ -s $ENV_FILE ]] || { echo "Missing $ENV_FILE; run server-setup.sh first." >&2; exit 1; }

compose() {
  docker compose --env-file "$ENV_FILE" -f "$1/infra/compose.prod.yaml" --profile discord "${@:2}"
}
healthy() {
  for _ in $(seq 1 30); do
    curl -fsS http://127.0.0.1:8080/health/ready >/dev/null 2>&1 && return 0
    sleep 5
  done
  return 1
}

memory_kb=$(awk '/MemTotal|SwapTotal/ {s += $2} END {print s}' /proc/meminfo)
if ((memory_kb < 2500000)); then
  echo "Memory plus swap is $((memory_kb / 1024)) MB; building needs about 2.5 GB." >&2
  echo 'Add swap as root (see "Server memory" in docs/deploy-vultr.md), then deploy again.' >&2
  exit 1
fi

echo "==> Unpacking $SHA"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
rm -f "$ARCHIVE"

PREVIOUS=$(readlink -f "$ROOT/current" 2>/dev/null || true)
if [[ -n $PREVIOUS && -d $PREVIOUS ]]; then
  echo '==> Backing up the database before changing anything'
  stamp=$(date -u +%Y%m%dT%H%M%SZ)
  compose "$PREVIOUS" exec -T postgres pg_dump -U sparko -Fc sparko \
    >"$ROOT/backups/predeploy-$stamp.dump"
fi

echo '==> Building images'
APP_VERSION=${SHA:0:12} compose "$RELEASE" build --pull

echo '==> Migrating and starting'
APP_VERSION=${SHA:0:12} compose "$RELEASE" up -d --wait --remove-orphans

if healthy; then
  ln -sfn "$RELEASE" "$ROOT/current"
  echo "==> Live: $SHA"
else
  echo '==> New release is not healthy' >&2
  compose "$RELEASE" ps >&2 || true
  compose "$RELEASE" logs --tail 80 api web >&2 || true
  if [[ -n $PREVIOUS && -d $PREVIOUS ]]; then
    echo "==> Starting the previous release again: $(basename "$PREVIOUS")" >&2
    APP_VERSION=$(basename "$PREVIOUS" | cut -c1-12) \
      compose "$PREVIOUS" up -d --wait --remove-orphans || true
  fi
  exit 1
fi

echo '==> Scheduling the daily backup'
backup_job="17 3 * * * bash $ROOT/current/infra/backup.sh >>$ROOT/backups/backup.log 2>&1"
{ crontab -l 2>/dev/null | grep -vF 'infra/backup.sh' || true; echo "$backup_job"; } | crontab -

echo '==> Removing old releases (keeping 5)'
for old in $(ls -1dt "$ROOT"/releases/*/ | tail -n +6); do
  tag=$(basename "$old" | cut -c1-12)
  for service in migrate api bot worker web; do
    docker image rm "sparko-$service:$tag" >/dev/null 2>&1 || true
  done
  rm -rf "$old"
done
docker image prune -f >/dev/null
