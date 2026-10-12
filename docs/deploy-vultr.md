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
- **Backups:** schedules daily database and file backups in `/opt/sparko/backups`, kept 14 days.
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

**Premium via PayPal:** Sparko's built-in checkout supports Stripe only. Until a PayPal integration exists, take payment in PayPal yourself, then give the server Plus from the owner console (Servers › staff Plus grant) with an end date.

## Rollback and recovery

- **Undo a release:** run Deploy with the previous good commit as `ref`. The database is never rolled back. Migrations only move forward, and a backup is taken before every release (`/opt/sparko/backups/predeploy-*.dump`).
- **Restore data:** only restore into a separate database first; see [operations](operations.md).
- **Logs:** `ssh deploy@64.177.44.183`, then:
  `cd /opt/sparko/current && docker compose --env-file /opt/sparko/shared/.env.production -f infra/compose.prod.yaml --profile discord logs --tail 100 api`
