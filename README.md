# Sparko

A fresh TypeScript Discord community platform with a React website, Fastify API, Gateway bot, durable workers, and PostgreSQL. The brand is yellow (`#FACC15`); the planned production origin is <https://panel.coin-sprite.com/>.

Implementation proceeds through the milestones in [the specification](SPARKO_ANTIGRAVITY_FROM_SCRATCH_GPT61_ULTRA.md). [Progress](docs/progress.md) and [feature traceability](docs/feature-traceability.md) record the actual completion and verification status. Navigation or an adapter does not establish that a feature has shipped. No old CoinSprite application or data is imported.

## Local setup

Requires Node **24.19.x**, pnpm **11.25.0**, Docker with Compose, and a registered Discord application for live login/bot behavior.

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `POSTGRES_PASSWORD`, use the same password in `DATABASE_URL`, and generate independent `SESSION_SECRET` and `TOKEN_ENCRYPTION_KEY` values. Set the Discord settings through your local secret configuration when testing real OAuth. See [setup](docs/setup.md) for formats and callback registration. Keep optional providers empty until configured.

```sh
docker compose --env-file .env -f infra/compose.dev.yaml up -d --wait
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open <http://localhost:5173/>. Vite proxies API, health, and WebSocket traffic to Fastify on port 3001. `pnpm dev` starts web and API. Start `pnpm dev:bot` and `pnpm dev:worker` in separate terminals only after configuring real Discord credentials. A missing bot remains unavailable; the application does not simulate an installation or deliver messages.

## Checks and disposable services

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
docker compose -f infra/compose.test.yaml up -d --wait
TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_test TEST_REDIS_URL=redis://localhost:56379/15 pnpm test:integration
TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_browser_test TEST_REDIS_URL=redis://localhost:56379/15 pnpm test:e2e
```

Integration and browser tests reset explicitly named local disposable databases. They never fall back to `DATABASE_URL`. Install Chromium with `pnpm exec playwright install --with-deps chromium`, then set `CHROMIUM_PATH` to that installation's executable if `/usr/bin/chromium` is unavailable. Browser tests use a test-only Discord transport and real database/outbox/handlers; they do not prove live Discord delivery.

The production build includes real public React prerendering, canonical metadata, a sitemap, private-route fallback, CSP hashes, and a check of transitive browser imports and emitted assets for server-only code or secrets.

## Operator commands

| Command                                                                             | Action                                                                                                      |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `pnpm dev:web`, `dev:api`, `dev:bot`, `dev:worker`                                  | Start the individual process.                                                                               |
| `pnpm db:migrate`                                                                   | Apply the new product's forward migrations; never resets records.                                           |
| `ALLOW_DEVELOPMENT_SEED=true pnpm db:seed`                                          | Add one explicitly labeled local development guild with `installed=false`; requires `NODE_ENV=development`. |
| `pnpm discord:register`                                                             | Explicitly register commands; review [setup](docs/setup.md) first.                                          |
| `pnpm backup`                                                                       | Create a restricted PostgreSQL custom archive and SHA-256 checksum.                                         |
| `RESTORE_FILE=/absolute/path/backup.dump TEST_DATABASE_URL=... pnpm restore:verify` | Restore only into a disposable local test target and verify core relations/ledger.                          |
| `pnpm smoke`                                                                        | Check health, truthful public status, API routing, and the web app at `SMOKE_ORIGIN` or `PUBLIC_APP_URL`.   |
| `SMOKE_CHECK_PROXY=true pnpm smoke`                                                 | Also check production private-route headers and asset 404 behavior.                                         |

Database archive commands require PostgreSQL client tools matching the server major version. Database archives exclude private media; [operations](docs/operations.md) describes the combined backup and recovery procedure.

See [deployment](docs/deployment.md) for non-root production containers, migration ordering, same-origin proxy/TLS, staging, and rollback. Building or merging source does not change the existing live website. Live hosting, domain cutover, Discord/provider verification, and operator legal text remain separate release gates.

## Layout

- `apps/web`, `apps/api`, `apps/bot`, `apps/worker`: separate process responsibilities.
- `packages/contracts`, `messages`, `ui`, `assets`: browser-safe shared code.
- `packages/domain`, `db`, `policy`, `config`, `observability`, `rendering`: business rules, persistence, authority, and server operations.
- `tools`, `infra`, `docs`: runnable operations, container/proxy configuration, and product/runbook documentation.
