# Hosting with pm2

The server runs two pm2 processes from `ecosystem.config.cjs`:

| Process      | What it does                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `sparko-web` | Serves the built website on `127.0.0.1:8080`. nginx in front handles HTTPS, and only Cloudflare can reach it. |
| `sparko-bot` | Logs the bot in to Discord so it shows online, and answers `/ping`. Other commands say they're being rebuilt. |

Both read settings from `/opt/sparko/shared/.env.production` (set `SPARKO_ENV_FILE` to use another file):

- `DISCORD_BOT_TOKEN`: the bot's token (required for `sparko-bot`; the website also uses it to see which servers have Sparko).
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`: the Discord app's OAuth2 ID and secret, for signing in to the dashboard. Without them the sign-in page says sign-in isn't switched on.
- `PUBLIC_APP_URL`: the dashboard address, shown in `/ping` replies.
- `WEB_PORT` / `WEB_HOST`: where the website listens (default `8080` on `127.0.0.1`).
- `DATABASE_PATH`: the database file (default `.data/sparko.db` in the app folder). See `docs/backend.md`.
- `MEDIA_DIR`: where pictures uploaded in Message Studio are kept (default: a `media` folder next to the database). Back it up with the database.
- `DASHBOARD_USERS`: until launch, only these Discord user IDs can see the website and use the dashboard, comma-separated (default `902736357766594611,1416183744515276943`). Everyone else sees a black coming-soon screen with a countdown and a sign-in button; the Privacy Policy and Terms stay public. Set it to `*` to open everything now.
- `DASHBOARD_OPENS_AT`: when Sparko opens to everyone, as a UTC date and time (default `2026-10-31T15:00:00Z`, which is 31 October 2026, 10:00 pm in UTC+7).

If the website hasn't been built or the token is missing, that process stops with a message in `pm2 logs` instead of restarting over and over.

On start the bot replaces its registered slash commands with the ones it answers (just `/ping` for now).

## Setting up a new server

`infra/setup-server.sh` does everything on a fresh Ubuntu 24.04 server: swap, updates, firewall, nginx with HTTPS, Node 24, pnpm, pm2, the `deploy` user, the code, the settings, and starts Sparko so it comes back after reboots. It asks you for a few things while it runs; secrets are pasted into the server only, never into chat.

**1. Create the server on Vultr**

- **Deploy New Server → Cloud Compute (Shared CPU)**, any location, **Ubuntu 24.04 LTS x64**, a plan with **2 GB RAM**.
- Under **SSH Keys** choose **Add New**. On your laptop, in PowerShell, run `Get-Content $HOME\.ssh\sparko-deploy.pub` and paste what it prints. Select that key.
- Deploy, and copy the new server's IP address.

**2. Copy the script to the server.** On GitHub open `infra/setup-server.sh`, press **Download raw file**, then in PowerShell (put the new IP instead of `NEW_IP`):

```powershell
scp -i $HOME\.ssh\sparko-deploy $HOME\Downloads\setup-server.sh root@NEW_IP:
ssh -i $HOME\.ssh\sparko-deploy root@NEW_IP
```

The first time, it asks `Are you sure you want to continue connecting`; type `yes`.

**3. Run it**

```sh
bash setup-server.sh
```

It first asks for the website address (like `panel.example.com`), then stops to ask for:

1. **A Cloudflare origin certificate.** In Cloudflare open your domain → **SSL/TLS → Origin Server → Create Certificate** (RSA, 15 years, hostname: your website address). Paste the certificate, then type `END` on its own line. Do the same for the private key.
2. **A deploy key on GitHub.** It prints a line starting with `ssh-ed25519`. On GitHub open the Sparko repository → **Settings → Deploy keys → Add deploy key**, paste it, leave **Allow write access** off, save, and press Enter.
3. **The bot token.** On discord.com/developers open your app → **Bot → Reset Token**, copy it and paste it. It stays hidden while you paste.
4. **The website's contact details:** the support email, the support server invite, and the name and country the Terms of Service give for whoever runs Sparko. They're saved in the server's env file, not in this repository.

At the end it shows both processes `online`.

**4. Point the domain at the new server.** In Cloudflare:

- **DNS:** edit the `panel` record so it points to the new IP, with the orange cloud (Proxied) on.
- **SSL/TLS → Overview:** set the mode to **Full (strict)**.

Then open your website address and try `/ping` in Discord.

From now on, log in as `deploy` instead of `root`:

```powershell
ssh -i $HOME\.ssh\sparko-deploy deploy@NEW_IP
```

## The website's contact details

The support email, support server invite, and the operator name and country on the Terms and Privacy pages aren't kept in this repository. They're read from the server's env file when the site is built, and `update.sh` stops if any is missing. On a server set up before this, as `deploy`, run `nano /opt/sparko/shared/.env.production` and add (with your own values):

```
SUPPORT_EMAIL=you@example.com
SUPPORT_DISCORD_INVITE=https://discord.gg/your-invite
OPERATOR_NAME=Your name
OPERATOR_COUNTRY=Your country
```

Save with Ctrl+O, Enter, then Ctrl+X, then run `bash /opt/sparko/app/infra/update.sh`. `PUBLIC_APP_URL` is already there from setup.

## Turning on Discord sign-in

The dashboard signs people in with Discord. On a server set up before sign-in existed, add it once:

1. On discord.com/developers open your app → **OAuth2**.
   - Copy the **Client ID**.
   - Press **Reset Secret** and copy the secret.
   - Under **Redirects** add `https://<your website address>/api/v1/auth/discord/callback` and press **Save Changes**.
2. On the server, as `deploy`, run `nano /opt/sparko/shared/.env.production` and add two lines with your values:

   ```
   DISCORD_CLIENT_ID=your client id
   DISCORD_CLIENT_SECRET=your secret
   ```

   Save with Ctrl+O, Enter, then Ctrl+X.

3. Run `bash /opt/sparko/app/infra/update.sh`.

Signing in shows your real Discord name, avatar and the servers you can manage, and which of them have Sparko. Module settings are still sample data. Sign-ins are stored, so restarting doesn't sign anyone out.

## Turning on Welcome and Tickets

Welcome needs to know when people join, and Tickets needs to read messages typed in ticket threads. On discord.com/developers open your app → **Bot**, turn on **Server Members Intent** and **Message Content Intent** under Privileged Gateway Intents, save, then run `pm2 restart sparko-bot`. Without them the bot still runs, and those features say what's missing.

## Everyday commands

Run these as `deploy`:

```sh
pm2 ls                    # what's running
pm2 restart all           # restart website and bot
pm2 restart sparko-bot    # just the bot
pm2 logs                  # live logs (Ctrl+C to leave)
pm2 stop all              # stop everything
```

**Update to the latest version**

```sh
bash /opt/sparko/app/infra/update.sh
```

**Change a setting or the token:** edit `/opt/sparko/shared/.env.production` with `nano`, then `pm2 restart all`.

## If something goes wrong

- **`WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED`** after making a new server on an old IP: run `ssh-keygen -R NEW_IP` on your laptop, then connect again.
- **The site shows a Cloudflare error 521 or 525:** check `pm2 ls` shows `sparko-web` online, and that SSL/TLS is set to Full (strict).
- **The bot stays offline:** run `pm2 logs sparko-bot --lines 30`. A token error means it was copied wrong; fix it in the env file and `pm2 restart sparko-bot`.
