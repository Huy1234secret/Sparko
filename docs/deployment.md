# Deployment and release

The intended origin is `https://panel.coin-sprite.com`. This configuration prepares a new independent deployment. It does not change the existing live website, reuse its database, or establish DNS/hosting credentials.

## Build and stage

Run the root checks from the README and record the commit, migration version, and test environment. Build the pinned multistage images from the repository root:

```sh
docker build -f infra/Dockerfile --target runtime -t sparko-runtime:release .
docker build -f infra/Dockerfile --target web -t sparko-web:release .
```

In a managed cloud environment, supply the session CA as a BuildKit secret to both builds:

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f infra/Dockerfile --target runtime -t sparko-runtime:release .
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -f infra/Dockerfile --target web -t sparko-web:release .
```

The CA is mounted only in networked build steps; TLS verification stays enabled. Preserve Docker's configured proxy/registry credentials. A managed proxy used at runtime also requires a read-only CA mount plus `NODE_EXTRA_CA_CERTS` for Node processes. Compose's ordinary production file does not embed a session-specific CA or proxy. Add a local ignored override when the staging host requires those settings.

Runtime images execute TypeScript with the pinned tsx loader and workspace source dependencies. API, bot, worker, and nginx run as non-root users. API/bot/worker have distinct process ownership; only bot connects to Gateway. Do not add bot replicas without an explicit shard/ingestion ownership plan.

Copy `.env.example` to an ignored `.env.production` or use an operator secret manager. Set at least:

- `NODE_ENV=production`, `PUBLIC_APP_URL=https://panel.coin-sprite.com`.
- `DISCORD_REDIRECT_URI=https://panel.coin-sprite.com/api/v1/auth/discord/callback`.
- `POSTGRES_PASSWORD` and `DATABASE_URL=postgresql://sparko:URL_ENCODED_PASSWORD@postgres:5432/sparko`.
- `REDIS_URL=redis://redis:6379`, independent session/encryption keys, and configured Discord credentials.
- Real provider configuration only where the operator has approved and obtained access.

Validate the Compose model without printing its expanded secrets:

```sh
docker compose --env-file .env.production -f infra/compose.prod.yaml config --quiet
```

For managed builds with Compose, use `infra/compose.cloud-build.yaml` to provide the same CA secret:

```sh
docker compose --env-file .env.production -f infra/compose.prod.yaml -f infra/compose.cloud-build.yaml build
```

Default Compose startup launches PostgreSQL, Redis, an explicit migration job, API, and web. Successful migration precedes API startup. Bot/worker use the `discord` profile; enable it after actual application credentials and test-server authorization are ready:

```sh
docker compose --env-file .env.production -f infra/compose.prod.yaml --profile discord up -d --build --wait
```

There is no production seed. PostgreSQL, Redis, and API have no public host port. Web is loopback-only on 8080. Persistent volumes hold the new database, Redis reconstruction cache, and private files. Web is read-only with temporary nginx state under `/tmp`. Generated CSP hashes permit the exact theme bootstrap script while every route retains security headers.

## HTTPS and origin

Establish the hosting provider and stage on an operator-owned test origin first. Public HTML currently uses the supplied canonical production origin; staging should have indexing disabled by the outer proxy. An external TLS reverse proxy terminates HTTPS and forwards to `127.0.0.1:8080`. A minimal Caddy host example is:

```caddyfile
panel.coin-sprite.com {
  reverse_proxy 127.0.0.1:8080
}
```

Verify DNS ownership, A/AAAA records, certificate issuance/renewal, ports 80/443, and the exact registered OAuth callback. Configure the outer proxy to preserve Host and overwrite forwarding headers. The internal nginx proxy forwards the intended HTTPS scheme; it is never a public HTTP authentication endpoint.

Nginx routes `/api/v1` to Fastify without SPA fallback, upgrades `/ws/events`, retains real missing-asset 404s, serves hashed assets immutably, and marks account/server/owner routes no-store/noindex. Private transcripts/support files remain behind API authorization. Database and cache ports must stay private.

## Release gate and cutover

Before a production switch, verify clean migrations, HTTPS and secure cookies, valid OAuth callback/login/logout, current bot permissions/intents/hierarchy, a harmless test post in both message modes, the ticket creation/claim/close/transcript journey, queue restart/recovery, browser/mobile accessibility, and any configured provider's sandbox callbacks. Missing credentials are exact pending gates, never a simulated live success. Review operator identity/contact/retention/legal text before public release.

At the configured staging origin:

```sh
SMOKE_ORIGIN=https://STAGING_ORIGIN SMOKE_CHECK_PROXY=true pnpm smoke
```

Smoke checks route/health/header behavior. It does not authenticate to Discord or verify payment/Gateway delivery. Complete those operator steps separately and record evidence.

After deployment authorization, back up the new system, record the current/previous image and schema identities, switch the domain upstream, run smoke and the authenticated journey, then monitor heartbeats and outbox errors. Preserve the old deployment independently until its operator decides its fate.

## Rollback

Switch to the previously recorded compatible image/configuration and restart only the affected new services. Never run destructive test/schema reset tools against production, remove volumes, or downgrade database history to roll back code. Forward schema changes need an explicit compatibility or forward-repair plan. Restore a backup only into a separate recovery target first, verify it, and use an operator-reviewed recovery procedure if production data restoration becomes necessary. See [operations](operations.md).
