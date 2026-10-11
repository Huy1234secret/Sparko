# Setup and configuration

Use the new `Huy1234secret/Sparko` checkout and its committed pnpm lockfile. No legacy database or application is required. All commands below run from the repository root.

## Prerequisites

Use Node 24.19.x and pnpm 11.25.0. Docker Compose supplies PostgreSQL 17.6 and Redis 7.4.6. Native PostgreSQL client tools of major version 17 are needed for host-side archive commands. In managed cloud environments, preserve the configured network proxy and CA trust when installing dependencies or building images.

Copy `.env.example` to `.env`. Set a local PostgreSQL password in both `POSTGRES_PASSWORD` and `DATABASE_URL`; use URL encoding for characters with URI meaning. A hexadecimal password avoids that ambiguity. Generate two independent secrets with a trusted password generator or these commands, then store them in the local environment file or a secret manager:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Use the first as `SESSION_SECRET` (at least 32 characters) and the second as `TOKEN_ENCRYPTION_KEY` (exactly 64 hexadecimal characters). Do not reuse either as a provider webhook key. Keep `.env`, archives, private media, and credential values out of commits, browser variables, screenshots, and shared logs.

## Process settings

| Setting                                                              | Scope and behavior                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`, `APP_VERSION`                                            | All server processes; production requires an HTTPS `PUBLIC_APP_URL`.                                                                                                                                                            |
| `PUBLIC_APP_URL`                                                     | Server origin/links and exact browser Origin checks. Local default: `http://localhost:5173`.                                                                                                                                    |
| `VITE_API_BASE_URL`                                                  | Public frontend setting; `/api/v1` keeps requests on the same origin. No other secret uses the `VITE_` prefix.                                                                                                                  |
| `DATABASE_URL`, `REDIS_URL`                                          | Server-only connections. Host development uses localhost; containers use `postgres` and `redis`.                                                                                                                                |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI` | OAuth/code exchange in the API. Client ID is public; client secret stays server-side.                                                                                                                                           |
| `DISCORD_BOT_TOKEN`                                                  | Bot/worker and authorized API Discord-resource reads. Bot and worker refuse to start without their required credentials.                                                                                                        |
| `DISCORD_GATEWAY_INTENTS`                                            | Bot-only comma-separated allowlist: `guilds,members,messages,content,reactions,voice,moderation,invites`. Defaults omit privileged member/content intents.                                                                      |
| `DISCORD_TEST_GUILD_ID`                                              | Explicit development command registration target. Omit only for deliberate global registration.                                                                                                                                 |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`                             | Independent session-purpose/encryption settings. Sessions are opaque database-backed tokens; rotating `SESSION_SECRET` alone does not revoke them. Changing the encryption key requires credential re-encryption or revocation. |
| `OWNER_USER_IDS`                                                     | Comma-separated bootstrap global owners; guild administration alone does not grant global authority.                                                                                                                            |
| `TRUST_PROXY`                                                        | `false` for direct local Fastify; production Compose enables it behind the private web proxy.                                                                                                                                   |
| `API_RATE_LIMIT_PER_MINUTE`                                          | Per-client API request budget (default 300). Behind the proxy, the client is the forwarded address when `TRUST_PROXY=true`.                                                                                                     |
| `STORAGE_PATH`                                                       | Permission-gated private media; `.data/private` locally, persistent private volume in Compose. Never serve this directory as web assets.                                                                                        |
| Provider settings                                                    | Configure only an adapter you actually intend to use. Empty billing/AI/social settings leave those capabilities unavailable.                                                                                                    |
| `TEST_DATABASE_URL`, `TEST_REDIS_URL`                                | Explicit disposable targets; test tools enforce local names ending in `test` and reserved Redis database 15.                                                                                                                    |

Issued controls are persisted opaque IDs. This implementation does not require a control signing secret or wildcard origin list: the canonical app origin and server-side resource policy apply.

## Start clean development

```sh
pnpm install --frozen-lockfile
docker compose --env-file .env -f infra/compose.dev.yaml up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Development PostgreSQL is bound to loopback port 5432 and Redis to 6379. The web runs at 5173 and API at 3001. A fresh database has no sample activity. Seed is optional and explicit:

```sh
NODE_ENV=development ALLOW_DEVELOPMENT_SEED=true pnpm db:seed
```

This fixture creates an uninstalled, labeled example guild and no rewards, users, live installation, or production events. Setting `ALLOW_DEVELOPMENT_SEED` without development mode cannot seed production.

## Discord application

Register the exact local redirect `http://localhost:5173/api/v1/auth/discord/callback` in the application developer portal. User login requests `identify` and `guilds`; installation requests are separate. Register production only with `https://panel.coin-sprite.com/api/v1/auth/discord/callback`.

Select only intents required by enabled features. Member events and content observation require both developer-portal access and the matching `DISCORD_GATEWAY_INTENTS` setting. Without an intent, event collection is labeled unavailable rather than inferred. Role actions also require Manage Roles and a bot role above the target role. Invite snapshot collection requires `members` join observation and Manage Server to read invites. The optional `invites` intent invalidates snapshots promptly on invite creation/deletion; incomplete, simultaneous, or unsupported evidence remains unknown and cannot justify a reward.

Review the actual command registry, set `DISCORD_TEST_GUILD_ID` for an authorized test server, and run `pnpm discord:register` explicitly. Registration is not a startup side effect. Start `pnpm dev:bot` and `pnpm dev:worker` after credentials and application permissions are configured.

## Disposable tests

`infra/compose.test.yaml` uses separate loopback ports 55432/56379 and ephemeral database storage. It creates `sparko_test`, `sparko_browser_test`, and `sparko_restore_test`. Do not run it while other services own those ports. The integration/browser scripts reset their target schema; only disposable data belongs there.

```sh
docker compose -f infra/compose.test.yaml up -d --wait
TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_test TEST_REDIS_URL=redis://localhost:56379/15 pnpm test:integration
TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_browser_test TEST_REDIS_URL=redis://localhost:56379/15 pnpm test:e2e
docker compose -f infra/compose.test.yaml down
```

Install the Playwright browser if needed. `CHROMIUM_PATH` selects its executable. Test-only endpoints/transports are confined to `apps/api/test/server.ts`; the production API entrypoint never loads that executable.
