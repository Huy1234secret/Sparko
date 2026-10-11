# Sparko implementation progress

Updated 2026-10-11. Repository: private `Huy1234secret/Sparko`; default branch `main`. All application source is new. No legacy application source was read or imported. Brand: `#FACC15`; intended production origin: `https://panel.coin-sprite.com/`.

## Current checkpoint

Resumed from `sparko/m0-foundation` at `699b872` after reading all 1,468 lines of the full specification and this handoff. The new environment has unrestricted network access. Native Prisma generation and migration now work without the former engine hint. Source PR creation and merge are authorized; production cutover is a separate operator action.

M0 foundation gates pass locally; its milestone PR is being prepared. M1 local acceptance passes and awaits its milestone delivery PR. M2 representative workflows pass; its exact remaining implementation gates are listed below. M3–M9 remain in progress. Existing routes, navigation, and extension records do not establish feature completion. Each completed milestone gets its own PR and merge.

## Milestone checklist

| Milestone                     | Status                       | Current evidence / next gate                                                                                                                                                                                                                                                                 |
| ----------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation                 | Verified locally             | Strict monorepo, contracts, service boundaries, native migrations, CI, containers, backup/restore, documentation; all local gates pass; PR pending.                                                                                                                                          |
| M1 Identity/ticket workflow   | Local acceptance in progress | Real OAuth handlers/cookies, PostgreSQL API, bot interaction handler and worker; controlled Discord boundary. Browser setup/publish/restart/create/claim/close and authorized transcript download pass. Milestone PR pending; live Discord remains unverified.                               |
| M2 Message platform           | Local acceptance in progress | V2/embed compiler, Studio, immutable template versions, publication update/replacement, persistent controls, owned assets and normalized media pipeline. Media reservation/privacy and all representative browser checks pass. Full visual/version/form/error gates below remain incomplete. |
| M3 Community                  | In progress                  | Domain/API/Gateway/worker implementation and regressions exist. Advanced frontend workflows and combined journey gates incomplete; see community.md.                                                                                                                                         |
| M4 Safety/support             | In progress                  | Private ticket scope, case/forms/verification rules and capture failure handling tested. Complete staff UI, long forms and exact anti-nuke variants remain; see safety-automation.md.                                                                                                        |
| M5 Time/automation            | In progress                  | DST, misfire, cancellation, invite ambiguity and durable jobs tested. Complete UI integration, fresh waitlist eligibility and workflow recovery remain.                                                                                                                                      |
| M6 Accounts/owner/commercial  | In progress                  | Session refresh fencing, deletion/export privacy, atomic support, narrow global grants, owner metrics and billing adapter implemented. Complete UI acceptance and sandbox checks remain.                                                                                                     |
| M7 Economy/advanced community | In progress                  | Balanced ledger, escrow, uniqueness, duplicate delivery and public seasonal opt-out regressions tested. Typed complete member/staff workflows remain; see economy.md.                                                                                                                        |
| M8 Providers                  | In progress                  | Signature-first webhooks, bounded social fetch, consent/quota/retention AI and billing adapter tests. Real voice runtime and live provider checks remain; see providers.md.                                                                                                                  |
| M9 Release                    | In progress                  | 19 prerendered public pages, native images, CI, deployment and recovery runbooks. Full acceptance/load/accessibility/localization matrix and authorized domain cutover remain.                                                                                                               |

## Verified environment and schema

- Node 24.19.0; pnpm 11.25.0; PostgreSQL 17.6; Redis 7.4.6; Prisma 7.10.0 using the PostgreSQL driver adapter.
- Native `prisma migrate deploy` applies four ordered migrations: initial schema; ledger constraints; fenced OAuth refresh leases; immutable ledger entries. Financial corrections use balanced reversal transactions.
- Disposable local databases: `sparko_test` and `sparko_browser_test` at localhost:55432, user/password `sparko`. Redis reserved test DB15 at localhost:56379. Root integration startup rejects nonlocal/unnamed targets, resets only the explicitly selected test schema, runs native migrations and flushes only the reserved Redis DB.
- Clean web production image and real PostgreSQL backup/restore into a separate disposable database passed. Restore validates archive checksum, explicit disposable target and ledger reconciliation. Production backup files use restricted permissions.
- Source and built browser import boundaries passed. All 19 public React routes prerendered with sitemap, metadata and CSP hashes.

## Verification record

Whole-workspace strict typecheck and ESLint passed. Clean native generation and all four forward migrations passed. The final root PostgreSQL integration run passed **104 tests in 12 files**, including session refresh/idempotency, tenant isolation, historical ticket staff scope, publication lifecycle races, duplicate community events, time/safety concurrency, ledger escrow and provider consent/signatures. Final root unit verification passed **128 tests in 17 files**. Root `build`, `format:check`, frozen installation, strict TypeScript and ESLint passed; 19 prerendered public routes and source/built import boundaries passed. Final `pnpm test:e2e` passed **4/4 in 39.6 seconds**, including authorized transcript download, mobile keyboard/focus/layout, publication update/replacement, and normalized uploaded bytes delivered by the actual worker to the controlled Discord boundary. Desktop 1280px and mobile 390px screenshots were inspected. Isolated production runtime/proxy and backup/restore rehearsals passed.

Browser tests exercise the actual application API, authentication handlers, database, BotRuntime interaction handler and worker. Only the external Discord authorization/API boundary is controlled. This establishes local behavior; it does not establish that a live Discord application accepted the payloads.

## External verification still required

No application/provider credentials are bound to this environment. Live checks need a configured Discord application/client secret/token, callback registration, a test guild with appropriate permissions/intents, and required provider sandbox keys/account access. Exact checks: live OAuth code exchange, bot installation and hierarchy, V2/embed posts and edits, modal/private channel/transcript behavior, Gateway ingestion/reconnect and invite permissions, billing sandbox callbacks, social source access, AI provider requests, and music playback after a real voice adapter exists. Hosting/DNS/TLS credentials and an authorized cutover are needed for the production domain.

Provider-independent work continues while these checks are unavailable. No mock production persistence, sample telemetry, synthetic provider success, or deployed release is claimed. Git remote read/write works; connected GitHub tools support PR creation and merge. No secrets are committed or requested in chat.

## Exact implementation gaps found during review

- M2: generic `form.open` controls currently redirect/reject instead of launching application intake; long ticket-form cancellation and restart-between-steps acceptance are missing. Studio lacks section accessories/nested insertion/gallery item editing, complete embed URL/timestamp controls, version history/naming/duplicate/rollback, custom emoji accessibility fallback, and accurate publication delivery errors/external deletion reconciliation. AttachFiles permission preflight remains to add.
- M3–M5: advanced typed UI/actions remain incomplete. Timed channel-lock/ban expiry, full anti-nuke response/restoration, fresh waitlist eligibility, long generic form intake and ambiguous temporary-voice creation retry reconciliation are missing. Invite ambiguity is conservatively reported rather than invented.
- M6: `context.requireFeature` checks administrator enabled state only. Persist owner policy separately and enforce shared plan/prerequisite/runtime gates in direct Gateway paths, workflows and worker effects while allowing cleanup/refunds/privacy maintenance. Advertised plan limits are not yet uniformly enforced. Role-delegated guild discovery/resource picker scopes need completion. Checkout returns to `/account/billing`, whose route is absent; owner support-only navigation/read scopes need correction. Support replies/attachments/status, grant management, full privacy export kinds and commercial lifecycle UI remain.
- M7/M8: replace generic record views with typed workflows. Correct member endpoints are `/economy/me`, `/trades/me`, `/reputation/me`; collection/inventory/lottery responses are composite DTOs. Rewards R52 lacks navigation. Staff order/refund queue, trivia reload recovery and actual multi-server rollout are incomplete. Social sources use `/social/sources`, not `/integrations`; AI/provider panels and a real music voice runtime remain.
- M9: full acceptance/load/accessibility/localization and authorized deployment remain. Image pending reservations intentionally retain quota until retried; reclaiming abandoned files needs a safe reconciler rather than blind expiry.

The user wants a stable handoff when their account allowance reaches 20% and will send “pause” then. On that message: stop agents/processes, update this file with actual commit/PR/check results and next action, commit/push the checkpoint, and leave no claimed completion without its gate.

## Next concrete action

Create/merge the verified M0 PR, then deliver the M1 acceptance PR and implement the remaining M2 gates before its PR and continue remaining milestone implementation without waiting for another “continue”. Update feature traceability with actual frontend/API/domain/Discord/worker coverage and exact incomplete variants.
