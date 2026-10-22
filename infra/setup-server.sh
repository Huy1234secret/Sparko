#!/usr/bin/env bash
# Sets up a fresh Ubuntu 24.04 server for Sparko, run once as root:
#   bash setup-server.sh
# It adds swap, updates, a firewall (SSH from anywhere, web only through
# Cloudflare), nginx with a Cloudflare origin certificate, Node 24, pnpm and
# pm2, an unprivileged `deploy` user, the code, the env file, and then starts
# the website and bot with pm2 so they come back after reboots.
# Safe to run again: finished steps are skipped.
set -euo pipefail

DOMAIN=${DOMAIN:-}
REPO=${REPO:-git@github.com:Huy1234secret/Sparko.git}
APP_USER=deploy
ROOT=/opt/sparko
APP_DIR=$ROOT/app
ENV_FILE=$ROOT/shared/.env.production
# GitHub's published SSH host key, so the first clone can't be intercepted.
GITHUB_HOST_KEY='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
die() {
  printf '\033[1;31mStopped: %s\033[0m\n' "$*" >&2
  exit 1
}
as_app() { sudo -u "$APP_USER" -H "$@"; }

[[ $(id -u) == 0 ]] || die 'run this as root.'
# shellcheck source=/dev/null
. /etc/os-release
[[ ${ID:-} == ubuntu ]] || die "this script is for Ubuntu (found ${ID:-unknown})."
# The site's address is asked for, not kept in the repository.
[[ -n $DOMAIN ]] || read -rp 'The website address, like panel.example.com: ' DOMAIN </dev/tty
[[ $DOMAIN =~ ^[a-z0-9.-]+\.[a-z]{2,}$ ]] || die "\"$DOMAIN\" isn't a domain like panel.example.com."

say 'Swap, so building the website has enough memory'
if ! swapon --show=NAME --noheadings | grep -qx /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
  # Written to a copy first so /etc/fstab is never left half-written.
  cp /etc/fstab /etc/fstab.new
  echo '/swapfile none swap sw 0 0' >>/etc/fstab.new
  sync
  mv /etc/fstab.new /etc/fstab
fi

say 'Updates, nginx, firewall and git'
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
apt_opts=(-yq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
apt-get update -q
apt-get upgrade "${apt_opts[@]}"
apt-get install "${apt_opts[@]}" ca-certificates curl git nginx ufw unattended-upgrades openssl
dpkg-reconfigure -f noninteractive unattended-upgrades

say 'Node 24, pnpm and pm2'
if ! node -v 2>/dev/null | grep -q '^v24\.'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install "${apt_opts[@]}" nodejs
fi
npm install -g --no-fund --no-audit pnpm@11.25.0 pm2@6.0.13 >/dev/null
echo "node $(node -v), pnpm $(pnpm -v), pm2 $(pm2 -v)"

say "The ${APP_USER} user, who runs Sparko"
id "$APP_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos '' "$APP_USER" >/dev/null
install -d -m 700 -o "$APP_USER" -g "$APP_USER" "/home/$APP_USER/.ssh"
# Lets you log in as deploy with the same key you use for root.
if [[ -s /root/.ssh/authorized_keys && ! -s /home/$APP_USER/.ssh/authorized_keys ]]; then
  install -m 600 -o "$APP_USER" -g "$APP_USER" /root/.ssh/authorized_keys "/home/$APP_USER/.ssh/authorized_keys"
fi
install -d -m 750 -o "$APP_USER" -g "$APP_USER" "$ROOT" "$ROOT/shared"

say 'Firewall: SSH from anywhere, the website only through Cloudflare'
ufw allow OpenSSH >/dev/null
ranges=$(curl -fsS https://www.cloudflare.com/ips-v4 && echo && curl -fsS https://www.cloudflare.com/ips-v6) ||
  die "could not download Cloudflare's address list; check the internet connection and run again."
for range in $ranges; do
  ufw allow proto tcp from "$range" to any port 80,443 comment cloudflare >/dev/null
done
ufw --force enable >/dev/null

say 'Cloudflare origin certificate (HTTPS between Cloudflare and this server)'
install -d -m 750 /etc/ssl/sparko
if [[ ! -s /etc/ssl/sparko/origin.pem || ! -s /etc/ssl/sparko/origin.key ]]; then
  echo "In Cloudflare: SSL/TLS > Origin Server > Create Certificate (RSA, 15 years, hostname ${DOMAIN})."
  echo 'Paste the Origin Certificate here, press Enter, then type END on its own line and press Enter:'
  sed '/^END$/q' </dev/tty | sed '$d' >/etc/ssl/sparko/origin.pem
  echo 'Now paste the Private Key, press Enter, then type END on its own line and press Enter:'
  (umask 077 && sed '/^END$/q' </dev/tty | sed '$d' >/etc/ssl/sparko/origin.key)
fi
chmod 600 /etc/ssl/sparko/origin.key
openssl x509 -noout -in /etc/ssl/sparko/origin.pem 2>/dev/null ||
  { rm -f /etc/ssl/sparko/origin.*; die "that certificate didn't look right. Run the script again and paste it once more."; }
openssl pkey -noout -in /etc/ssl/sparko/origin.key 2>/dev/null ||
  { rm -f /etc/ssl/sparko/origin.*; die "that private key didn't look right. Run the script again and paste both once more."; }

say "nginx: HTTPS for ${DOMAIN}, forwarding to Sparko on 127.0.0.1:8080"
rm -f /etc/nginx/sites-enabled/default
cat >/etc/nginx/conf.d/sparko.conf.new <<NGINX
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
  }
}
NGINX
mv /etc/nginx/conf.d/sparko.conf.new /etc/nginx/conf.d/sparko.conf
nginx -t
systemctl reload nginx

say 'Read-only access to the GitHub repository'
key=/home/$APP_USER/.ssh/sparko-github
[[ -s $key ]] || as_app ssh-keygen -q -t ed25519 -N '' -C "sparko-server" -f "$key"
grep -qxF "$GITHUB_HOST_KEY" "/home/$APP_USER/.ssh/known_hosts" 2>/dev/null ||
  as_app sh -c "echo '$GITHUB_HOST_KEY' >> ~/.ssh/known_hosts"
grep -q 'sparko-github' "/home/$APP_USER/.ssh/config" 2>/dev/null ||
  as_app sh -c 'printf "Host github.com\n  IdentityFile ~/.ssh/sparko-github\n  IdentitiesOnly yes\n" >> ~/.ssh/config'
until as_app git ls-remote "$REPO" HEAD >/dev/null 2>&1; do
  echo
  echo 'On GitHub open the Sparko repository > Settings > Deploy keys > Add deploy key.'
  echo 'Title: server. Key: the line below. Leave "Allow write access" off.'
  echo
  cat "$key.pub"
  echo
  read -rp "Press Enter once it's saved… " </dev/tty
done

say 'The code'
if [[ -d $APP_DIR/.git ]]; then
  as_app git -C "$APP_DIR" pull --ff-only
else
  as_app git clone -q "$REPO" "$APP_DIR"
fi

say 'Settings (the env file)'
if [[ ! -s $ENV_FILE ]]; then
  echo 'From discord.com/developers > your app:'
  read -rp 'OAuth2 > Client ID (it is fine to show): ' client_id </dev/tty
  read -rsp 'OAuth2 > Reset Secret, paste it (stays hidden), Enter: ' client_secret </dev/tty
  echo
  read -rsp 'Bot > Reset Token, paste it (stays hidden), Enter: ' token </dev/tty
  echo
  [[ -n $token && -n $client_id && -n $client_secret ]] || die 'something was left empty. Run the script again.'
  (
    umask 077
    printf 'PUBLIC_APP_URL=https://%s\nDISCORD_CLIENT_ID=%s\nDISCORD_CLIENT_SECRET=%s\nDISCORD_BOT_TOKEN=%s\n' \
      "$DOMAIN" "$client_id" "$client_secret" "$token" >"$ENV_FILE.new"
  )
  unset token client_secret
  chown "$APP_USER:$APP_USER" "$ENV_FILE.new"
  mv "$ENV_FILE.new" "$ENV_FILE"
fi
# The contact and operator details the website shows. They live here, not
# in the repository; update.sh won't build without them.
facts=(
  'SUPPORT_EMAIL|The support email the website shows'
  'SUPPORT_DISCORD_INVITE|The support server invite, like https://discord.gg/abc'
  'OPERATOR_NAME|Who runs Sparko, as the Terms name you'
  'OPERATOR_COUNTRY|The country you run it from'
)
for fact in "${facts[@]}"; do
  key=${fact%%|*}
  grep -Eq "^${key}=.+" "$ENV_FILE" && continue
  read -rp "${fact#*|}: " value </dev/tty
  [[ -n $value ]] || die "${key} was left empty. Run the script again."
  printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
done
echo "In discord.com/developers > OAuth2 > Redirects, add: https://${DOMAIN}/api/v1/auth/discord/callback"

say 'Build and start the website and bot'
as_app bash -c "cd '$APP_DIR' && pnpm install --frozen-lockfile && NODE_OPTIONS=--max-old-space-size=2048 pnpm build"
as_app bash -c "cd '$APP_DIR' && pm2 startOrRestart ecosystem.config.cjs && pm2 save"
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" >/dev/null

say 'Checking'
sleep 3
as_app pm2 ls
if curl -fsS http://127.0.0.1:8080/healthz >/dev/null; then
  echo 'The website answers on this server.'
else
  echo "The website doesn't answer yet. Look at: sudo -u deploy pm2 logs sparko-web"
fi
echo
echo "Done. In Cloudflare, point ${DOMAIN} (DNS, proxied) to this server's IP and set SSL/TLS to Full (strict)."
echo "Then open https://${DOMAIN} and try /ping in Discord."
