#!/usr/bin/env bash
# Daily backup, run by the deploy user's crontab (deploy-release.sh installs
# it). Run it by hand to test: bash /opt/sparko/current/infra/backup.sh
#
# Dumps the database and the private files into /opt/sparko/backups (kept
# LOCAL_DAYS). When R2 is configured in the env file, the same files are
# encrypted on this server with BACKUP_PASSPHRASE and copied to Cloudflare R2
# (kept R2_DAYS). Without the passphrase, the copies in R2 cannot be read.
set -euo pipefail

ROOT=/opt/sparko
ENV_FILE=$ROOT/shared/.env.production
DIR=$ROOT/backups
LOCAL_DAYS=7
R2_DAYS=30
RCLONE_IMAGE=rclone/rclone:1.68.2
umask 077

# Reads one setting from the env file, without running it as shell code.
setting() {
  local line
  line=$(grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null) || return 0
  line=${line#*=}
  line=${line%$'\r'}
  [[ $line =~ ^\"(.*)\"$ || $line =~ ^\'(.*)\'$ ]] && line=${BASH_REMATCH[1]}
  printf '%s' "$line"
}

cd "$ROOT/current"
compose() { docker compose --env-file "$ENV_FILE" -f infra/compose.prod.yaml "$@"; }
stamp=$(date -u +%Y%m%dT%H%M%SZ)
echo "$(date -u +%FT%TZ) backup $stamp"

compose exec -T postgres pg_dump -U sparko -Fc sparko >"$DIR/sparko-$stamp.dump.partial"
mv "$DIR/sparko-$stamp.dump.partial" "$DIR/sparko-$stamp.dump"
docker run --rm -v sparko_private:/data:ro -v "$DIR":/backup busybox:1.37.0 \
  tar czf "/backup/private-$stamp.tgz" -C /data .
(cd "$DIR" && sha256sum "sparko-$stamp.dump" "private-$stamp.tgz" >"sparko-$stamp.sha256")
find "$DIR" -maxdepth 1 -type f \( -name 'sparko-*' -o -name 'private-*' -o -name 'predeploy-*' \) \
  -mtime +"$LOCAL_DAYS" -delete

R2_ACCOUNT_ID=$(setting R2_ACCOUNT_ID)
R2_ACCESS_KEY_ID=$(setting R2_ACCESS_KEY_ID)
R2_SECRET_ACCESS_KEY=$(setting R2_SECRET_ACCESS_KEY)
R2_BUCKET=$(setting R2_BUCKET)
BACKUP_PASSPHRASE=$(setting BACKUP_PASSPHRASE)
if [[ -z $R2_ACCOUNT_ID$R2_ACCESS_KEY_ID$R2_SECRET_ACCESS_KEY$R2_BUCKET ]]; then
  echo 'R2 is not configured; kept the local copy only.'
  exit 0
fi
for name in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET BACKUP_PASSPHRASE; do
  [[ -n ${!name} ]] || { echo "$name is missing from $ENV_FILE; nothing was uploaded." >&2; exit 1; }
done
((${#BACKUP_PASSPHRASE} >= 20)) || { echo 'BACKUP_PASSPHRASE must be at least 20 characters.' >&2; exit 1; }

# Secrets reach rclone as environment variables, never as command arguments.
export R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET BACKUP_PASSPHRASE STAMP=$stamp R2_DAYS
docker run --rm -v "$DIR":/data:ro \
  -e R2_ACCOUNT_ID -e R2_ACCESS_KEY_ID -e R2_SECRET_ACCESS_KEY -e R2_BUCKET \
  -e BACKUP_PASSPHRASE -e STAMP -e R2_DAYS \
  --entrypoint sh "$RCLONE_IMAGE" -euc '
    export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare
    export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
    export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
    export RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
    export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
    export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE="r2:$R2_BUCKET/sparko"
    RCLONE_CONFIG_VAULT_PASSWORD=$(printf "%s" "$BACKUP_PASSPHRASE" | rclone obscure -)
    export RCLONE_CONFIG_VAULT_PASSWORD
    rclone copy /data vault: --include "*-$STAMP.*" --stats-one-line --stats 0
    rclone delete vault: --min-age "${R2_DAYS}d"
    echo "Uploaded $(rclone lsf vault: --include "*-$STAMP.*" | wc -l) files to R2."
  '
