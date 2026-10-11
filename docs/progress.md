# Sparko implementation progress

Updated 2026-10-11. Target verified: private `Huy1234secret/Sparko`, default `main`. Baseline was README plus the attached specification. All application source is new; no old repository was read or imported.

## Current checkpoint

Working branch `sparko/m0-foundation`. **Paused at the user's request on 2026-10-11 so a new chat can use the republished environment. All parallel agents were interrupted.** M0/M1 implementation is in progress; no milestone is marked complete or released yet. No milestone PR has been created or merged. The prior checkpoint was `ebc6413`; the subsequent pause commit contains the latest source and this handoff.

## Evidence so far

- All 1,468 specification lines read, including all R01–R70 and M0–M9 gates.
- Workspace/remote and applicable instructions verified; no AGENTS.md or specialist engineering skills installed. Applied cloud-environment runtime skill. Official Discord, React, Vite, Fastify, Prisma, TanStack and competitor docs checked; package releases/engines checked against npm metadata.
- Node 24.19.0, pnpm 11.25.0, strict TypeScript monorepo with real PostgreSQL/Prisma adapter, new schema, durable operations/outbox and explicit policy.
- Clean initial SQL applied successfully to disposable PostgreSQL 17.6; Redis 7.4.6 disposable container running. This verifies SQL, not Prisma migrate CLI.
- Real Prisma Client 7.10.0 generated successfully with its bundled schema WASM path as unused native engine hint. ORM queries still use the actual PostgreSQL driver adapter; no mock persistence.
- Message compiler/forms/renderer: 19 meaningful tests passing. Assets: 17 tests and Chromium gallery/reduced-motion/GIF checks reported passing (integrator repetition pending).
- Root API journey integration: 7 tests passed against real disposable PostgreSQL, covering config revisions, idempotency conflicts, issued controls, concurrent ticket creation and claim, CSRF/cross-guild rejection, OAuth replay and logout revocation.
- Community agent reported 16 unit tests and 7 PostgreSQL integration tests passing. Safety/automation agent reported 14 unit tests and 10 PostgreSQL integration tests passing, including concurrent RSVP/form decisions, reviewer capability restrictions, DST timers and workflow replay/cancellation. These reports have not yet been repeated by the integrator as one root suite.
- Frontend agent reported 10 tests and the strict TypeScript/Vite web build passing. Ticket tests exercise dirty draft gating, pending delivery, stale-save draft preservation and reuse of the same idempotency key after a timeout.
- The last whole-workspace typecheck and lint were not passing. Bot/worker typing and unused imports were still being fixed. Full integration/build/browser acceptance remains in progress. Never treat current routes/screens as full roadmap completion.

## Blocked external verification

Cloud network denies `binaries.prisma.sh`; native Prisma migrate/generation without the local hint is blocked. User published unrestricted network settings, but this running chat remains bound to config revision 2. Official cloud docs say a new task is required to consume republished settings. Discord API/Gateway/CDN are not allowed in this environment and no Discord application credentials are bound. Provider keys, billing account availability, live hosting, DNS/TLS credentials are absent. Current `gh` token fails authentication; GitHub connector has verified admin/push/merge access and can be used if needed.

Exact live checks outstanding: configured OAuth callback/code exchange/login+logout, bot installation and current permission/hierarchy, actual V2/embed posts, ticket modal/private channel/claim/transcript, gateway event ingestion/reconnect, provider sandbox callbacks/playback/AI/social source verification, staging browser tests against Discord, domain cutover. Source PR merge is authorized; replacing the existing live site is not assumed.

## Next action

Resume only when the user starts the new chat. Integrate API/domain/worker/bot/frontend exports; finish repeatable clean scripts, seed only explicit development fixtures, test tenant/session/idempotency/revision/claims and queue recovery against disposable services. Run root checks and create/merge milestone PR only after its actual gate passes. The user explicitly authorizes creating and merging a PR for each completed milestone. Continue M2–M9 independent work; update traceability with real evidence and exact unfinished variants.

Immediate integration issues to review before claiming a working journey:

- Align the worker's ioredis version with BullMQ's resolved 5.11.1 to fix incompatible protected types; review remaining bot event tuple/type errors, then run the full typecheck and lint.
- Wire economy/provider routes and config schemas into the API; add the contracts `./providers` subpath export if still missing. Provider callback endpoints need raw-body signature verification before database transactions. Omit encrypted provider secrets, raw AI prompts and private billing fields from account/server exports.
- Fresh config reads currently parse `{enabled:false}` against schemas with mandatory fields. The frontend agent identified that this throws for initial verification, temporary voice and invite-reward setup. Return an honest unconfigured state with missing prerequisites, and let shared metadata drive the setup fields.
- Review worker coverage for every emitted effect, especially `ticket.welcome`, `ticket.cleanup`, role-order delivery/refunds and safety punishment expiry. Complete join date ingestion; invite evidence is currently unknown until a serialized real snapshot collector is connected.
- Security review findings remain to resolve: concurrent OAuth refresh, member access to staff audit data, account deletion retention/opt-ins, atomic support message append/idempotency, and appropriately narrow global grant management.
- Frontend module workflows remain partial beyond ticket/message/account paths. Generic persisted configuration does not complete each advanced community/economy/provider workflow.
- `apps/api/test/server.ts`, `fake-rest.ts` and `playwright.config.ts` are newly saved, unrun browser-test plumbing; the actual browser journey specification is still missing. Finish it and verify real persistence/outbox effects. Review public prerender tooling, CI, README/runbooks and deployment scripts; they are unfinished/unverified.

Disposable services in this paused workspace: PostgreSQL container `sparko-test-postgres` on localhost:55432, user/password `sparko`, databases `sparko_test` and `sparko_browser_test`; Redis container `sparko-test-redis` on localhost:56379, test DB 15. They may not exist in a new workspace. Recreate them from the deployment/testing scripts as necessary. `tools/test-integration.ts` permits only explicitly named local disposable test targets and resets their schema; never point it at production. Native Prisma migration verification must be repeated in the updated environment.

## Restart handoff

All current source is checkpointed on `sparko/m0-foundation`. This is an in-progress checkpoint, not a completed milestone or merged release. In a new cloud chat using the updated published environment, fetch that branch, read this file and all 1,468 lines of `SPARKO_ANTIGRAVITY_FROM_SCRATCH_GPT61_ULTRA.md`, inspect ongoing code and applicable instructions, then resume integration and milestones without importing legacy source. Keep the yellow brand `#FACC15` and target origin `https://panel.coin-sprite.com/`. GitHub git remote read/write works; gh API token is invalid, so use the connected GitHub tools for PR creation/merge. No credentials are committed; new environment credentials must be configured securely for the exact live checks listed above.
