# Deploying to the Vultr server

This is the runbook for Sparko's production server (Vultr, `64.177.44.183`) behind Cloudflare at `https://panel.coin-sprite.com`. The order and go/no-go rules are in the [deployment plan](deployment-plan.md).

Each deploy is started by hand from GitHub (Actions › Deploy › Run workflow). The workflow only deploys a commit on `main` whose Checks passed. It uploads that exact source and runs `infra/deploy-release.sh` on the server. No password or key is ever pasted into a chat or committed.

## 1. Discord (production bot "Sparko", not Sparko-Test)

In the Discord Developer Portal, for the **Sparko** application:

1. Under **OAuth2 › Redirects**, add `https://panel.coin-sprite.com/api/v1/auth/discord/callback`.
2. Under **Bot › Privileged Gateway Intents**, turn on **Server Members Intent** and **Message Content Intent**.
3. Keep the client ID, the client secret and the bot token at hand for step 3. The setup script asks for them on the server.

## 2. A deploy key (on your own computer)

```sh
ssh-keygen -t ed25519 -f sparko-deploy -N "" -C sparko-deploy
```

This makes `sparko-deploy` (private) and `sparko-deploy.pub` (public). The private key only goes into GitHub secrets (step 4).

## 3. One-time server setup (as root)

Copy the script to the server and run it with the **public** key:

```sh
scp infra/server-setup.sh root@64.177.44.183:
ssh root@64.177.44.183
bash server-setup.sh "$(cat sparko-deploy.pub)"   # or paste the .pub contents in quotes
```

The script:

- **Stops** if another site already uses ports 80/443 or serves `panel.coin-sprite.com` here, so it never overwrites the old site by accident.
- **Installs:** Docker, nginx and automatic security updates.
- **Creates** the `deploy` user, which can run Docker.
- **Firewall:** SSH is open; ports 80/443 are reachable only from Cloudflare.
- **Cloudflare Origin Certificate:** asks you to paste it. Create it in Cloudflare › SSL/TLS › Origin Server › Create Certificate.
- **Settings:** writes `/opt/sparko/shared/.env.production`, readable only by `deploy`.
  - Generates fresh database, session and encryption keys.
  - Asks for the production bot's details and your Discord user ID (for the owner console).
- **Prints** the four values for step 4.

It does not change SSH settings. When you are ready, consider disabling root password login (`PasswordAuthentication no` in `/etc/ssh/sshd_config`), but only after confirming you can still sign in with a key.

## 4. GitHub secrets

Go to GitHub › Settings › Secrets and variables › Actions › New repository secret, and add:

| Secret               | Value                                           |
| -------------------- | ----------------------------------------------- |
| `DEPLOY_HOST`        | `64.177.44.183`                                 |
| `DEPLOY_USER`        | `deploy`                                        |
| `DEPLOY_SSH_KEY`     | the whole private key file `sparko-deploy`      |
| `DEPLOY_KNOWN_HOSTS` | the `ssh-ed25519` line the setup script printed |

Optional: under Settings › Environments › production, add yourself as a required reviewer. Every deploy then waits for your approval.

## 5. First deploy (before switching DNS)

Go to Actions › Deploy › Run workflow, with `ref` = `main` and **untick** "Check the public site".

The server then:

1. Builds the images.
2. Migrates the new database.
3. Starts PostgreSQL, Redis, the API, the website, the bot and the worker.
4. Checks health on the server itself.

A failed health check stops the release and restarts the previous one, if there is one.

The bot comes online in Discord now, since it doesn't depend on DNS.

## 6. Switch the domain

In Cloudflare › DNS for `coin-sprite.com`:

1. Set `panel` to an **A** record for `64.177.44.183`, **Proxied** (orange cloud).
2. Set SSL/TLS mode to **Full (strict)**.

Run Deploy again with "Check the public site" ticked, or open `https://panel.coin-sprite.com/health/ready`. Then:

1. Sign in with Discord.
2. Open the owner console.
3. Check that a harmless test post works in your test server.

Premium uses PayPal once it is configured; see the next section.

## PayPal for Premium

Sparko sells Plus as a PayPal subscription. Premium turns on only when PayPal itself confirms the subscription to Sparko's webhook, never because someone returned from the PayPal page. Test in the sandbox first, then repeat with live details.

1. **App credentials.** Sign in to developer.paypal.com with your PayPal Business account. Go to Apps & Credentials, choose Sandbox (later Live), create an app, and note its Client ID and Secret.
2. **Plans.** In PayPal, create a product and a monthly subscription plan at your price (Pay & Get Paid › Subscriptions, or the sandbox equivalent). You can also add 6-month and yearly plans for the same product. Note each Plan ID; they start with `P-`. Members choose among the periods you configure. If you change a price in PayPal, also update the labels in `apps/web/src/content/pricing.ts`.
3. **Webhook.** In the same app, add the webhook `https://panel.coin-sprite.com/api/v1/webhooks/paypal` and subscribe it to these events, then note the Webhook ID:
   - `BILLING.SUBSCRIPTION.ACTIVATED`, `.UPDATED`, `.RE-ACTIVATED`, `.CANCELLED`, `.SUSPENDED`, `.EXPIRED` and `.PAYMENT.FAILED`
   - Payment sale completed, and whichever refund and reversal events your account lists: Payment refund completed, Payment capture refunded, Payment capture reversed, or the older Payment sale refunded and Payment sale reversed. Ticking **All Events** also works; Sparko ignores the rest.
   - `CUSTOMER.DISPUTE.CREATED` and `CUSTOMER.DISPUTE.RESOLVED`
4. **Server settings.** On the server, run `nano /opt/sparko/shared/.env.production` and add these lines (`sandbox` for testing, `live` for real payments):

   ```
   PAYPAL_ENV=sandbox
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_PLAN_ID=P-...              # monthly (required)
   PAYPAL_PLAN_ID_SEMIANNUAL=P-...   # every 6 months (optional)
   PAYPAL_PLAN_ID_ANNUAL=P-...       # yearly (optional)
   PAYPAL_WEBHOOK_ID=...
   ```

5. **Apply.** Run Deploy again. Then, in a server's Plan & billing page, choose Prepare checkout, pay with a sandbox buyer account, and confirm the server shows Plus.
6. **Go live.** Replace all the values with the Live ones (`PAYPAL_ENV=live`), and Deploy again.

Refunds and chargebacks in PayPal remove Premium automatically. Cancelling in PayPal keeps it until the paid period ends.

## Off-site backups in Cloudflare R2

Every deploy schedules `infra/backup.sh` to run daily at 03:17 UTC. The script works in this order:

1. **Saves locally.** It writes the database and the uploaded files to `/opt/sparko/backups`, kept 7 days.
2. **Encrypts.** When R2 is set up, it encrypts those files on the server with your backup passphrase.
3. **Uploads.** It copies them to R2, kept 30 days.

The privacy policy states the 30 days. Cloudflare cannot read the copies, and nor can anyone else without the passphrase.

1. **Bucket.** In Cloudflare › R2, create a bucket named `sparko-backups`. Keep it private, and add no public access or custom domain.
2. **Token.** In R2 › Manage API tokens › Create API token:
   - Permission: **Object Read & Write**.
   - Scope: only the `sparko-backups` bucket.
   - Note the **Access Key ID**, the **Secret Access Key**, and your **Account ID** (shown on the R2 overview page).
3. **Passphrase.** On the server, run `openssl rand -base64 32`. Save the output in your password manager. Without it, the backups cannot be restored, and it is lost if the server is.
4. **Settings.** Run `nano /opt/sparko/shared/.env.production` and add:

   ```
   R2_ACCOUNT_ID=...
   R2_ACCESS_KEY_ID=...
   R2_SECRET_ACCESS_KEY=...
   R2_BUCKET=sparko-backups
   BACKUP_PASSPHRASE=...
   ```

5. **Test.** As the deploy user (`su - deploy`), run `bash /opt/sparko/current/infra/backup.sh`. It should end with `Uploaded 3 files to R2.` In the bucket, the files have scrambled names, which is expected. Each night's result is logged in `/opt/sparko/backups/backup.log`.

To restore, download and decrypt into a new folder. Then follow [operations](operations.md) to restore into a separate database first:

```sh
mkdir -p /opt/sparko/restore && cd /opt/sparko/restore
read -rp 'Account ID: ' R2_ACCOUNT_ID; read -rp 'Access Key ID: ' R2_ACCESS_KEY_ID
read -rsp 'Secret Access Key: ' R2_SECRET_ACCESS_KEY; echo; read -rsp 'Passphrase: ' BACKUP_PASSPHRASE; echo
read -rp 'Backup stamp (blank to list them): ' STAMP
export R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY BACKUP_PASSPHRASE STAMP
docker run --rm -v "$PWD":/out -e R2_ACCOUNT_ID -e R2_ACCESS_KEY_ID -e R2_SECRET_ACCESS_KEY \
  -e BACKUP_PASSPHRASE -e STAMP --entrypoint sh rclone/rclone:1.68.2 -euc '
  export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true
  export RCLONE_CONFIG_R2_ENDPOINT="https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com"
  export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_VAULT_TYPE=crypt RCLONE_CONFIG_VAULT_REMOTE=r2:sparko-backups/sparko
  export RCLONE_CONFIG_VAULT_PASSWORD="$(printf %s "$BACKUP_PASSPHRASE" | rclone obscure -)"
  if [ -z "$STAMP" ]; then rclone lsf vault:; else rclone copy vault: /out --include "*-$STAMP.*"; fi'
sha256sum -c sparko-*.sha256
```

## Server memory

Building the images needs about 2.5 GB of memory plus swap. The setup script adds a 3 GB swap file on smaller servers. On a server set up before that, add it once as root:

```sh
fallocate -l 3G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h   # the Swap line should show 3.0Gi
```

## Rollback and recovery

- **Undo a release:** run Deploy with the previous good commit as `ref`. The database is never rolled back. Migrations only move forward, and a backup is taken before every release (`/opt/sparko/backups/predeploy-*.dump`).
- **Restore data:** only restore into a separate database first; see [operations](operations.md).
- **Logs:** `ssh deploy@64.177.44.183`, then:
  `cd /opt/sparko/current && docker compose --env-file /opt/sparko/shared/.env.production -f infra/compose.prod.yaml --profile discord logs --tail 100 api`
