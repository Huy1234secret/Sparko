# Hosting with pm2

The server runs two pm2 processes from `ecosystem.config.cjs`:

| Process      | What it does                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `sparko-web` | Serves the built website on `127.0.0.1:8080`. nginx on the server keeps handling HTTPS in front of it.        |
| `sparko-bot` | Logs the bot in to Discord so it shows online, and answers `/ping`. Other commands say they're being rebuilt. |

Both read settings from `/opt/sparko/shared/.env.production`, the same file the old Docker setup used. Set `SPARKO_ENV_FILE` to use a different file. The values they use:

- `DISCORD_BOT_TOKEN`: the bot's token (required for `sparko-bot`).
- `PUBLIC_APP_URL`: the dashboard address, shown in `/ping` replies.
- `WEB_PORT` / `WEB_HOST`: where the website listens (default `8080` on `127.0.0.1`).

If the website hasn't been built or the token is missing, that process stops with a message in `pm2 logs` instead of restarting over and over.

On start the bot replaces its registered slash commands with the ones it answers (just `/ping` for now), so the old bot's commands disappear from Discord until they're rebuilt.

## Switching the server from Docker to pm2 (once)

Run these on the server: `ssh -i $HOME\.ssh\sparko-deploy deploy@64.177.44.183`.

Steps 1, 3 and the line `pm2 startup` prints need `sudo`. If the `deploy` user isn't allowed to use it, run those lines while logged in as `root`, and the rest as `deploy`.

**1. Install Node 24 and pm2**

```sh
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo corepack enable
sudo npm install -g pm2
node -v    # should print v24.something
```

**2. Let the server read the repository.** The repository is private, so give the server its own read-only key:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/sparko-github -N ""
printf 'Host github.com\n  IdentityFile ~/.ssh/sparko-github\n' >> ~/.ssh/config
cat ~/.ssh/sparko-github.pub
```

Copy the line it prints. On GitHub open the Sparko repository → **Settings → Deploy keys → Add deploy key**, paste it, leave **Allow write access** off and save.

**3. Get the code and build it**

```sh
sudo mkdir -p /opt/sparko/app && sudo chown "$USER": /opt/sparko/app
git clone git@github.com:Huy1234secret/Sparko.git /opt/sparko/app
cd /opt/sparko/app
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
```

**4. Stop the old Docker version.** This only stops the containers. The database and every other volume stay as they are, so you can go back.

```sh
sparko stop
```

**5. Start with pm2, and keep it running after reboots**

```sh
cd /opt/sparko/app
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` prints one `sudo …` line. Copy and run it.

**6. Check it**

```sh
pm2 ls                              # both "online"
curl -s http://127.0.0.1:8080/healthz   # prints ok
pm2 logs sparko-bot --lines 20      # "Signed in as …"
```

Then open https://panel.coin-sprite.com and try `/ping` in Discord.

## Everyday commands

```sh
pm2 ls                    # what's running
pm2 restart all           # restart website and bot
pm2 restart sparko-bot    # just the bot
pm2 logs                  # live logs (Ctrl+C to leave)
pm2 stop all              # stop everything
```

**Update to the latest version**

```sh
cd /opt/sparko/app
git pull
pnpm install --frozen-lockfile
NODE_OPTIONS=--max-old-space-size=2048 pnpm build
pm2 restart all
```

**Go back to the old Docker version**

```sh
pm2 stop all
sparko start
```
