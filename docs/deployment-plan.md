# Deployment plan

This is the plan for the first production release of Sparko at `https://panel.coin-sprite.com`. **It has not been executed.** Production deployment and the domain cutover each need explicit authorization from the owner. Nobody runs a step below until that authorization is recorded in the release record. [Deployment](deployment.md) and [operations](operations.md) hold the commands; this page fixes the order, the evidence and the go/no-go decisions.

## Authorizations and inputs

Each item is a blocker until the owner provides it. Missing items are reported as pending, never worked around.

1. **Written go-ahead** for staging, for production and for the domain cutover. These are three separate decisions.
2. **Hosting:** a host with Docker Compose. Record:
   - its operator and region
   - SSH or console access for the release operator
   - backup storage that is encrypted at rest and outside the web root
3. **DNS** control for `coin-sprite.com`, plus a staging hostname (for example `staging.panel.coin-sprite.com`) with indexing disabled.
4. **Discord application:**
   - client ID, secret and bot token in the operator's secret manager
   - redirect URIs for staging and production
   - privileged intents approved for the features in use
   - a test guild for acceptance
5. **Production secrets** generated on the host and never committed:
   - `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `INTEGRATION_ENCRYPTION_KEY` and `POSTGRES_PASSWORD`
6. **Optional providers:** Stripe, YouTube, Twitch, GitHub and OpenAI, only where the owner approves. Each stays "needs operator setup" until configured.
7. **Policy:** the operator's identity and contact, retention periods, and reviewed privacy and terms text.

## Stage 1: staging

1. Tag the release commit from `main` after CI passes. Record:
   - the commit
   - the migration version (`packages/db/prisma/migrations`, latest folder)
   - both image digests
2. Build the runtime and web images (see [deployment](deployment.md#build-and-stage)).
3. Validate Compose with `config --quiet`.
4. Start PostgreSQL, Redis, the migration job, the API and web on the staging host. Keep the `discord` profile (bot and worker) off.
5. Put TLS in front of `127.0.0.1:8080`, then run:
   `SMOKE_ORIGIN=https://STAGING SMOKE_CHECK_PROXY=true pnpm smoke`
6. Enable the `discord` profile with the staging application and the test guild.
7. Run the live acceptance list. For each step, record a screenshot or a request ID:
   - **OAuth:** sign in and sign out; secure cookies.
   - **Bot:** install, permissions and role hierarchy.
   - **Messages:** a harmless post in Components V2 and in embed mode.
   - **Tickets:** create, claim, close and transcript.
   - **Recovery:** a worker restart, then recovery of pending outbox jobs.
   - **Configuration tools:**
     - one backup and restore
     - a multi-server preview between two test guilds
   - **Approved providers:** sandbox callbacks for every provider the owner approved.
8. Measure capacity on the staging host:
   - Run `LOAD_ORIGIN=https://STAGING LOAD_ALLOW_REMOTE=true pnpm load` at the production rate limit.
   - Compare the results with the local baseline in [quality](quality.md#load-baseline).
   - Investigate any p95 above 500 ms or any 5xx before production.
9. Run a restore rehearsal on a separate recovery database: `pnpm backup`, then `pnpm restore:verify`.

**Go/no-go for production:** every acceptance step has evidence, smoke passes, the restore rehearsal passes, and there are no open 5xx. Any missing evidence is a no-go and is reported with the exact missing input.

## Stage 2: production (after its own authorization)

1. Provision the production host and secrets exactly as on staging. There is no production seed.
2. Deploy the same image digests that passed staging. Do not rebuild.
3. Migrate, start the services and run `pnpm smoke` against the production hostname, still behind a temporary or private DNS name.
4. Take the first backup immediately and record its checksum next to the release record.

## Stage 3: domain cutover (after its own authorization)

1. Lower the DNS TTL a day ahead.
2. Point `panel.coin-sprite.com` at the new host and confirm certificate issuance.
3. Confirm the production redirect URI is the only one registered for production.
4. Run smoke and the signed-in journey on the real domain.
5. Watch these for at least an hour:
   - heartbeats
   - outbox failure counts in the owner console
   - API error rates
6. Leave the previous website untouched. Its operator decides its future separately.

## Rollback

**Triggers:**

- smoke fails
- sign-in fails
- 5xx above 1% for 5 minutes
- the outbox grows without draining
- any data integrity alarm, such as an unbalanced ledger on `restore:verify` of a fresh backup

**Before cutover:** stop the new services. Nothing public changed.

**After cutover:**

1. Point DNS back, or switch to the previous image and configuration for the affected services (see [deployment](deployment.md#rollback)).
2. Never downgrade the schema or remove volumes.
3. Recover data only through a verified restore into a separate target first.

## Release record

For each stage, keep one record with:

- the operator, date and authorization reference
- the commit, image digests and migration version
- smoke output, acceptance evidence and load results
- the backup checksum
- the go/no-go decision and its reason
