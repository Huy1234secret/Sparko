# Sparko implementation progress

Updated 2026-10-11. Target verified: private `Huy1234secret/Sparko`, default `main`. Baseline was README plus the attached specification. All application source is new; no old repository was read or imported.

## Current checkpoint

Working branch `sparko/m0-foundation`. M0/M1 implementation is in progress; no milestone is marked complete or released yet. Root coordinates shared schemas, migrations, dependency locks, API, integration and milestone PRs. Parallel work owns frontend/public pages, message compiler/assets/rendering, bot/workers, community services, safety/automation, and economy/providers.

## Evidence so far

- All 1,468 specification lines read, including all R01–R70 and M0–M9 gates.
- Workspace/remote and applicable instructions verified; no AGENTS.md or specialist engineering skills installed. Applied cloud-environment runtime skill. Official Discord, React, Vite, Fastify, Prisma, TanStack and competitor docs checked; package releases/engines checked against npm metadata.
- Node 24.19.0, pnpm 11.25.0, strict TypeScript monorepo with real PostgreSQL/Prisma adapter, new schema, durable operations/outbox and explicit policy.
- Clean initial SQL applied successfully to disposable PostgreSQL 17.6; Redis 7.4.6 disposable container running. This verifies SQL, not Prisma migrate CLI.
- Real Prisma Client 7.10.0 generated successfully with its bundled schema WASM path as unused native engine hint. ORM queries still use the actual PostgreSQL driver adapter; no mock persistence.
- Message compiler/forms/renderer: 19 meaningful tests passing. Assets: 17 tests and Chromium gallery/reduced-motion/GIF checks reported passing (integrator repetition pending).
- Full integration/build/browser acceptance remains in progress. Never treat current routes/screens as full roadmap completion.

## Blocked external verification

Cloud network denies `binaries.prisma.sh`; native Prisma migrate/generation without the local hint is blocked. User published unrestricted network settings, but this running chat remains bound to config revision 2. Official cloud docs say a new task is required to consume republished settings. Independent local work continues. Discord API/Gateway/CDN are not allowed and no Discord application credentials are bound. Provider keys, billing account availability, live hosting, DNS/TLS credentials are absent. Current `gh` token fails authentication; GitHub connector has verified admin/push/merge access and will be used if needed.

Exact live checks outstanding: configured OAuth callback/code exchange/login+logout, bot installation and current permission/hierarchy, actual V2/embed posts, ticket modal/private channel/claim/transcript, gateway event ingestion/reconnect, provider sandbox callbacks/playback/AI/social source verification, staging browser tests against Discord, domain cutover. Source PR merge is authorized; replacing the existing live site is not assumed.

## Next action

Integrate API/domain/worker/bot/frontend exports; finish repeatable clean scripts, seed only explicit development fixtures, test tenant/session/idempotency/revision/claims and queue recovery against disposable services. Run root checks and create/merge milestone PR only after its actual gate passes. Continue M2–M9 independent work; update traceability with real evidence and exact unfinished variants.

## Restart handoff

All current source is checkpointed on `sparko/m0-foundation`. This is an in-progress checkpoint, not a completed milestone or merged release. In a new cloud chat using the updated published environment, fetch that branch, read this file and the full specification, inspect ongoing code, then resume integration and milestones without importing legacy source. GitHub git remote read/write works; gh API token is invalid, so use the connected GitHub tools for PR creation/merge.
