#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu/Debian server for Sparko, run as root:
#
#   bash server-setup.sh "ssh-ed25519 AAAA... sparko-deploy"
#
# It installs Docker and nginx, creates the unprivileged `deploy` user that
# the GitHub "Deploy" workflow signs in as, opens the firewall only for SSH
# and Cloudflare, installs the Cloudflare origin certificate, writes the
# production settings file with fresh random keys, and schedules daily
# database backups. It changes nothing in sshd and stops if another site
# already listens on ports 80 or 443. Re-running keeps existing settings.
set -euo pipefail

DOMAIN=panel.coin-sprite.com
ROOT=/opt/sparko
DEPLOY_USER=deploy
PUBLIC_KEY=${1:-}

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\nStopped: %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die 'run this as root.'
[[ $PUBLIC_KEY == ssh-* ]] || die 'pass the deploy public key (the .pub file contents) as the first argument.'
. /etc/os-release
[[ ${ID} == ubuntu || ${ID} == debian ]] || die "unsupported system ${ID}; use Ubuntu or Debian."

say 'Checking ports 80 and 443'
if ss -ltnpH '( sport = :80 or sport = :443 )' | grep -v '"nginx"' | grep -q .; then
  ss -ltnp '( sport = :80 or sport = :443 )'
  die 'another program already serves ports 80/443 (perhaps the old site). Stop it first, then re-run.'
fi

if [[ -d /etc/nginx ]] && grep -rlq --exclude=sparko.conf "$DOMAIN" /etc/nginx; then
  grep -rl --exclude=sparko.conf "$DOMAIN" /etc/nginx
  die "an existing nginx site already serves ${DOMAIN} (perhaps the old site). Remove it first, then re-run."
fi

say 'Installing Docker, nginx, firewall and updates'
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq ca-certificates curl gnupg nginx ufw unattended-upgrades
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

say "Creating the ${DEPLOY_USER} user"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
# Docker access is root-equivalent; this key should only ever live in GitHub secrets.
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
grep -qxF "$PUBLIC_KEY" "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null ||
  echo "$PUBLIC_KEY" >>"/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ROOT" "$ROOT/releases" "$ROOT/incoming" "$ROOT/shared"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$ROOT/backups"

say 'Firewall: SSH from anywhere, web only from Cloudflare'
ufw allow OpenSSH >/dev/null
for range in $(curl -fsS https://www.cloudflare.com/ips-v4) $(curl -fsS https://www.cloudflare.com/ips-v6); do
  ufw allow proto tcp from "$range" to any port 80,443 comment cloudflare >/dev/null
done
ufw --force enable >/dev/null

say 'Cloudflare origin certificate'
install -d -m 750 /etc/ssl/sparko
if [[ ! -s /etc/ssl/sparko/origin.pem || ! -s /etc/ssl/sparko/origin.key ]]; then
  echo 'In Cloudflare: SSL/TLS > Origin Server > Create Certificate (RSA, 15 years,'
  echo "hostnames ${DOMAIN}). Paste the certificate, then a line with only END:"
  sed '/^END$/q' | sed '$d' >/etc/ssl/sparko/origin.pem
  echo 'Now paste the private key, then a line with only END:'
  sed '/^END$/q' | sed '$d' >/etc/ssl/sparko/origin.key
fi
chmod 600 /etc/ssl/sparko/origin.key
grep -q 'BEGIN CERTIFICATE' /etc/ssl/sparko/origin.pem || die 'the certificate does not look right; delete /etc/ssl/sparko/origin.* and re-run.'
grep -q 'PRIVATE KEY' /etc/ssl/sparko/origin.key || die 'the private key does not look right; delete /etc/ssl/sparko/origin.* and re-run.'

say 'nginx: HTTPS for Cloudflare, forwarding to Sparko on 127.0.0.1:8080'
rm -f /etc/nginx/sites-enabled/default
cat >/etc/nginx/conf.d/sparko.conf <<NGINX
map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
server {
  listen 80;
  listen [::]:80;
  server_name ${DOMAIN};
  return 301 https://\$host\$request_uri;
}
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name ${DOMAIN};
  ssl_certificate /etc/ssl/sparko/origin.pem;
  ssl_certificate_key /etc/ssl/sparko/origin.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    # Only Cloudflare can reach this port, so its header is the real visitor.
    proxy_set_header X-Forwarded-For \$http_cf_connecting_ip;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \$connection_upgrade;
    proxy_read_timeout 3600s;
  }
}
NGINX
nginx -t
systemctl reload nginx

ENV_FILE=$ROOT/shared/.env.production
if [[ ! -s $ENV_FILE ]]; then
  say 'Production settings (the Sparko bot, not Sparko-Test)'
  read -rp 'Discord application (client) ID: ' client_id
  read -rsp 'Discord client secret (hidden): ' client_secret; echo
  read -rsp 'Discord bot token (hidden): ' bot_token; echo
  read -rp 'Your Discord user ID (owner console access): ' owner_id
  pg_password=$(openssl rand -hex 24)
  umask 077
  cat >"$ENV_FILE" <<ENV
NODE_ENV=production
PUBLIC_APP_URL=https://${DOMAIN}
DISCORD_REDIRECT_URI=https://${DOMAIN}/api/v1/auth/discord/callback
DISCORD_CLIENT_ID=${client_id}
DISCORD_CLIENT_SECRET=${client_secret}
DISCORD_BOT_TOKEN=${bot_token}
DISCORD_GATEWAY_INTENTS=guilds,members,messages,content,reactions,voice,invites,moderation
OWNER_USER_IDS=${owner_id}
POSTGRES_PASSWORD=${pg_password}
DATABASE_URL=postgresql://sparko:${pg_password}@postgres:5432/sparko
REDIS_URL=redis://redis:6379
SESSION_SECRET=$(openssl rand -hex 32)
TOKEN_ENCRYPTION_KEY=$(openssl rand -hex 32)
INTEGRATION_ENCRYPTION_KEY=$(openssl rand -hex 32)
ENV
  chown "$DEPLOY_USER:$DEPLOY_USER" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
else
  say "Keeping existing $ENV_FILE"
fi

say 'Daily database and file backups (kept 14 days)'
cat >/etc/cron.daily/sparko-backup <<'BACKUP'
#!/usr/bin/env bash
set -euo pipefail
dir=/opt/sparko/backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
cd /opt/sparko/current 2>/dev/null || exit 0
compose() { docker compose --env-file /opt/sparko/shared/.env.production -f infra/compose.prod.yaml "$@"; }
compose exec -T postgres pg_dump -U sparko -Fc sparko >"$dir/sparko-$stamp.dump"
docker run --rm -v sparko_private:/data:ro -v "$dir":/backup busybox tar czf "/backup/private-$stamp.tgz" -C /data .
(cd "$dir" && sha256sum "sparko-$stamp.dump" "private-$stamp.tgz" >"sparko-$stamp.sha256")
chown deploy:deploy "$dir"/*-"$stamp".*
find "$dir" -type f -mtime +14 -delete
BACKUP
chmod 755 /etc/cron.daily/sparko-backup

say 'Done'
echo 'Add these GitHub repository secrets (Settings > Secrets and variables > Actions):'
echo "  DEPLOY_HOST          $(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "  DEPLOY_USER          ${DEPLOY_USER}"
echo '  DEPLOY_SSH_KEY       the private key matching the public key you passed in'
echo '  DEPLOY_KNOWN_HOSTS   the lines below:'
ssh-keyscan -t ed25519 localhost 2>/dev/null | sed "s/^localhost/$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')/"
