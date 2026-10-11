# Sparko implementation progress

Paused at the user's explicit request on **2026-10-11, 07:59 UTC**. Repository: private `Huy1234secret/Sparko`; default branch `main`. All application source is new; no legacy source was read/imported. Brand: `#FACC15`; intended production origin: `https://panel.coin-sprite.com/`.

## Resume checkpoint

**Resume from the tip of `sparko/m2-message-platform`, not the older M0 branch.** This pause checkpoint contains the M2 work in progress and this handoff. Run `git rev-parse HEAD` for the full checkpoint commit ID and `git status` before editing. The checkpoint's parent is M1 head `90dcab35bd94b49216d681d463d6dcef7d7827a5`. M2 is deliberately incomplete: its latest four worker files are unformatted and unverified. Pushing a checkpoint may start CI; it is not a completed-milestone claim.

The original task remains: read this file and the full 1,468-line `SPARKO_ANTIGRAVITY_FROM_SCRATCH_GPT61_ULTRA.md`, continue the ordered M0–M9 implementation, and create **and merge** a PR after each completed milestone. PR creation/merge is authorized. Production cutover is a separate operator action. Do not wait for repeated “continue” prompts after resumption.

The user meant **account allowance**, not context capacity, and said they would send “pause” at 20% remaining. They have now done so. All agents stopped, source is frozen, and no test/typecheck/lint/formatter/browser/API fixture process remains running. Only the disposable PostgreSQL/Redis test containers remain. No additional implementation or PR merge was performed after the pause.

## Milestone / PR state

| Milestone                           | State                               | Evidence / next gate                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation                       | **Merged**                          | [PR #1](https://github.com/Huy1234secret/Sparko/pull/1), main merge `d00ef2fd5f1d7094552b3088f755d2e104c878a9`. [CI run 38122246676](https://github.com/Huy1234secret/Sparko/actions/runs/38122246676) passed every required gate, including browser, Compose and both production images.                                                                                                                                                           |
| M1 Identity / first ticket workflow | **PR open; CI passed**              | [PR #2](https://github.com/Huy1234secret/Sparko/pull/2), head `90dcab35bd94b49216d681d463d6dcef7d7827a5`, tree `5225013024e67706ed30a2bd4305dd5dc572d347`. [CI run 38122738224](https://github.com/Huy1234secret/Sparko/actions/runs/38122738224), job `114420647381`, passed all required steps 6–21. It remains unmerged because the user paused. Implementation landed in the shared M0 baseline; PR #2 delivers the separate acceptance report. |
| M2 Message platform                 | **Paused WIP; no milestone PR yet** | Visual/version/form/resource work implemented and focused checks passed. Final worker review fixes, combined gates and report/traceability completion remain. See the precise checklist below and `docs/milestones/m2.md`.                                                                                                                                                                                                                          |
| M3 Community                        | In progress                         | Domain/API/Gateway/worker implementation exists; complete typed UI and combined acceptance remain. Read-only review findings below; no new M3 source was written in this resumed turn.                                                                                                                                                                                                                                                              |
| M4 Safety/support                   | In progress                         | Historical ticket privacy, forms and capture failure tested. Complete staff UI, timed locks/bans and full anti-nuke variants remain.                                                                                                                                                                                                                                                                                                                |
| M5 Time/automation                  | In progress                         | DST/misfire/cancellation/invite ambiguity/durable jobs tested. Complete UI, fresh waitlist eligibility and recovery remain.                                                                                                                                                                                                                                                                                                                         |
| M6 Accounts/owner/commercial        | In progress                         | Session refresh fencing, support/privacy, grants/metrics and billing adapter exist. Shared owner/plan/runtime gates and complete UI acceptance remain.                                                                                                                                                                                                                                                                                              |
| M7 Economy/advanced community       | In progress                         | Ledger/escrow/uniqueness/duplicate delivery/public opt-out regressions pass. Typed complete member/staff workflows remain.                                                                                                                                                                                                                                                                                                                          |
| M8 Providers                        | In progress                         | Signature-first callbacks, bounded social fetch and AI consent/quota/retention tested. Complete UI, real voice adapter and exact live provider checks remain.                                                                                                                                                                                                                                                                                       |
| M9 Release                          | In progress                         | Prerendered public pages, images, CI and recovery runbooks exist. Full acceptance/load/accessibility/localization and authorized cutover remain.                                                                                                                                                                                                                                                                                                    |

## What M2 changed

- Studio: selected-container insertion; editable section thumbnail/button/action; gallery add/remove/spoiler; embed title URL and UTC timestamp; fresh custom emoji picker and explicit Unicode fallback. Existing undo/redo, keyboard ordering, token validation/budgets, schema-versioned import/export and desktop/mobile previews remain canonical.
- Templates: optional immutable version names; parent/tenant-scoped history; duplicate a selected version; restore by appending a new immutable version. Neither draft operation posts or rewrites a publication. History preserves the prior unsaved editor draft; reviewed restore refreshes revision binding. Navigation covers retained drafts, delayed responses cannot rebind a different editor, and guild-keyed Studio resets destination/publication state on an approved server switch.
- Domain/API: publication DTO separates business state from actual outbox delivery state/errors; reconcile endpoint only queues observation. Publication effects carry revision fences. Channel overwrite/View/Send/Embed/Attach preflight and fresh custom emoji inventory/fallback are implemented. Template create/version/duplicate/restore enforce same-guild clean public assets or the actor's own private assets for private designs.
- Bot/forms: generic `form.open` now launches actor-bound published applications. Immutable multi-step forms survive BotRuntime recreation, persist opaque option-index mapping, recheck current version/control/roles/eligibility, reject forged/expired/revoked flows, and atomically submit/cancel. Seven-field ticket cancellation is covered. Native first-modal dismissal expires after fifteen minutes; explicit cancellation is available after persisted steps.
- Worker: reconciliation compares the saved design with the original Discord message, recording matching/missing/conflicting/unknown states and never sending a replacement. Initial focused reconciliation/media/permission/emoji checks passed. The four final review corrections listed next were written immediately before pause and have **not** been verified.
- Browser fixtures faithfully exercise actual API/auth/database/BotRuntime/worker and controlled external Discord REST, including real Discord error types. The older ticket/publication assertions now identify their own publication and replacement so unrelated M2 records do not affect them; these final assertion changes await the combined run.

## Exact unverified worker checkpoint — do this first

Latest files: `apps/worker/src/reconciliation.ts`, `reconciliation.test.ts`, `effects.ts`, `effects.integration.test.ts`. Formatting was interrupted when the user paused. No additional test/type/lint result exists for these latest edits.

The independent review found four concrete bugs; the current unverified implementation attempts to fix all four:

1. Expected-key subset comparison missed unexpected visible embed description/footer/timestamp or changed button disabled state. The new canonical comparison normalizes protocol defaults and ignores only context-specific generated metadata.
2. Archive/replacement cleanup used `components: []`, erasing V2 text/layout/media. The new helper preserves display, removes issued controls, and disables required section accessories.
3. Archive with null message ID falsely succeeded after an accepted POST lost its response. The new helper recovers durable attempt IDs/original nonce/persisted controls including revoked IDs, returns unknown if identification is ambiguous, and only permits a no-op when the send is proven unattempted/rejected. Keep archived/replaced business state and never POST a replacement automatically.
4. Embed updates omitted empty `content`, leaving old Discord text while marking the new revision applied. The new edit payload explicitly sends `content: ''`.

Seven new PostgreSQL regressions were added for archive/replacement display, revoked-control ambiguous-send recovery, unidentified archive, proven-unsent/rejected no-ops, and clearing embed content. New unit regressions cover visible drift, disabled controls and protocol metadata/default normalization. **Their presence is not a passing result.**

Resume with native generation/setup if needed, format those four files, run focused worker reconciliation/effects tests against the explicit disposable database, and fix actual failures before broader checks. Then run worker typecheck/lint/format and freeze all source before the root reset.

## Verification record and limits

**Completed M0/M1 source:** frozen install; native generation; four ordered migrations; full strict TypeScript/ESLint/format/build; **128 unit tests**, **104 real PostgreSQL integration tests in 12 files**, **4 browser journeys**; production Compose; runtime and web Docker images all passed locally and in GitHub CI. Nineteen public React routes prerendered; source and built browser import boundaries passed. Isolated non-root API/nginx proxy and checksummed PostgreSQL backup/disposable restore with ledger reconciliation passed. No production deployment.

**M2 checks before final review edits:** full typecheck/lint/format passed; quiet full unit rerun **147/147 in 17.9s**. A preceding concurrent run had one five-second timeout under CPU contention, which passed in the quiet rerun. That full run predates the final three Studio regression tests and latest worker edits; it is not final M2 acceptance.

Focused M2 evidence:

- Publication/template domain PostgreSQL **7/7**; immutable restore/concurrency, scoped duplication, actual blocked status and idempotent observation effect.
- API security/resources PostgreSQL **15/15**; resolver/Discord adapter/auth units **12/12**; API/messages typecheck/lint/format passed.
- Safety/time focused **39/39** (23 unit + 16 PostgreSQL), including current immutable application versions/eligibility.
- Bot/worker **40/40** (27 PostgreSQL + 13 unit), with final modal rerun **8/8**, prior to the four latest worker corrections. Both app typechecks/lint/format passed for that earlier baseline.
- Final frontend: editor **4/4**, template library **5/5**, Studio draft/navigation/async guild isolation **3/3**; web typecheck/scoped lint/format/diff passed.
- Three new browser scenarios passed in focused runs before the final review fixes: nested/accessory/gallery/UTC persistence; named history/duplicate/restore/draft return; emoji fallback + blocked delivery + drift/missing reconciliation. The latest revision4/focus/mobile/draft guards and targeted old publication assertions require a **full seven-test rerun**.

Do not run browser tests beside CPU-heavy static/unit checks: this environment has a two-core cgroup limit. Do not reset a test schema while another agent's PostgreSQL tests are running. The integration runner resets only its explicit disposable target and flushes reserved Redis DB15.

## Environment / schema

Node 24.19.0; pnpm 11.25.0; PostgreSQL 17.6; Redis 7.4.6; Prisma 7.10.0 PostgreSQL driver adapter. Native Prisma generation/migrations work without the former engine hint.

M0 migrations: initial schema; balanced ledger constraints; fenced OAuth refresh; immutable ledger entries. Financial corrections use balanced reversals. M2 adds `202610110005_template_version_labels`; native generation and application of all **five** migrations to `sparko_test` passed. The final root integration run must exercise all five from an empty disposable schema.

This environment retains `sparko-test-postgres` at localhost:55432 (user/password `sparko`, `sparko_test` and `sparko_browser_test`) and `sparko-test-redis` at localhost:56379. Only these task test containers remain. A replacement environment must recreate explicit disposable services from `infra/compose.test.yaml`; follow `docs/setup.md`. Build cache was pruned after vfs disk pressure; about 14 GiB remained at the last check.

## Next concrete actions

1. After resumption, verify M1 PR #2 still has head `90dcab35bd94b49216d681d463d6dcef7d7827a5` and green CI, then merge it using the existing authorization. It was left open only because of the pause.
2. Format/review/test the four latest worker files as above. Do not mark M2 complete from older focused results.
3. Run full `typecheck`, `lint`, `format:check`, unit and build gates, then `test:integration` with `TEST_DATABASE_URL=postgresql://sparko:sparko@localhost:55432/sparko_test` and `TEST_REDIS_URL=redis://localhost:56379/15`. Run `test:e2e` quietly with the separate `sparko_browser_test` URL. Inspect desktop/mobile screenshots and resolve failures. Preserve native migration verification and honest external boundaries.
4. Update this file, `docs/milestones/m2.md`, feature traceability and decisions with actual final evidence. Commit/push completed M2, create/attach its PR, wait for all CI gates and merge. The pause checkpoint itself is not that completed PR.
5. Continue M3–M9 in ordered milestone PRs; independent work does not need provider credentials or another “continue”.

## M3 read-only review findings / next implementation plan

No M3 source was changed in this resumed turn. Existing backend logic is substantial; generic record views do not fulfill its combined exit gate.

- Add typed community services/pages. Current generic list transform loses crate claims and giveaway `myEntries`/`myWins`; `/members/me` is nonexistent, use `/levels/me`. Add usable opt-in leaderboard, own history/privacy/card preferences, bounded staff XP adjustment and role preview/confirm.
- R12: one browser-safe card preference contract must align saved legacy `square`/background theme with renderer `rounded`/theme/hex color. Register server defaults, derive own-member render input from authoritative XP/rank, resolve only clean owned/same-guild public media, and use identical preparation/renderer for API PNG and `/level`. Renderer currently leaks actual progress percentage/bar when `showXp:false`; fix that and maximum-level behavior. No caller-supplied identity/XP or arbitrary media URL fetching.
- Build complete crate/counting/greeting/reward/role-menu workflows and manager history/error DTOs. Crate fallback channels/failure policy are captured but not executed. Worker crate/giveaway/menu publications ignore configured documents; role menus become published before actual Discord delivery applies.
- Community message delivery bypasses the validated publication pipeline for persistent controls/assets/fresh emoji/Embed/Attach checks/public visibility. Reuse that pipeline and retain delayed author authority. Share a role privilege policy: worker currently omits Manage Messages/Mention Everyone from the API mask. Community configs need scoped channel/role/document preflight, not ticket-only validation.
- Add private-first suggestions/Q&A staff queues, decisions/history/vote changes/author resolution; giveaway create/eligibility/own entries/wins/claims/end/reroll/draw history; starboard provenance/mirror/deletion UI.
- Analytics must preserve units/coverage, joins/leaves/voice/module metrics and actual null gaps; current chart can bridge missing collection intervals. Verify UI/API/Gateway/restarted-worker persistence together, including duplicate XP/claims/draws and permission failures.

## Later exact gaps / external prerequisites

M4–M5: full staff/ticket/forms/safety/time UI; timed lock/ban expiry; full anti-nuke response/restoration; fresh waitlist eligibility; ambiguous temporary-voice creation reconciliation; workflow recovery. Invite ambiguity stays unknown rather than fabricated.

M6: persist owner feature policy separately; enforce shared plan/prerequisite/runtime gates in direct Gateway/workflow/worker paths while allowing cleanup/refunds/privacy maintenance. Uniform plan limits, delegated resource discovery, `/account/billing` route, support-only owner navigation/read scopes, support replies/attachments/status, grants, privacy export kinds and commercial lifecycle UI remain.

M7/M8: typed member/staff workflows; correct endpoints `/economy/me`, `/trades/me`, `/reputation/me` and `/social/sources`; composite inventory/collection/lottery DTOs; R52 navigation; staff refund/order queue; trivia reload recovery; actual opt-in multi-server rollout; provider panels and real voice runtime. See `docs/economy.md` and `docs/providers.md`.

M9: complete acceptance/load/accessibility/localization and authorized deployment. Pending asset reservations intentionally retain quota until retried; abandoned-file reclamation needs safe reconciliation, not blind expiry.

No Discord/provider/hosting credentials are bound. Live checks require an authorized Discord application/client secret/token/callback/test guild/permissions/intents and appropriate provider sandbox accounts/keys. Exact live checks: OAuth exchange, install/hierarchy, V2/embed/modal/StringSelect/media/emoji behavior, private channels/transcripts, Gateway reconnect/invites, billing callbacks, social access, AI requests, and music after a real voice adapter exists. Hosting/DNS/TLS access and explicit cutover authorization are required for production. No live success, synthetic telemetry or deployed release is claimed.

## Git transport history

Native Git HTTP failed with upstream session-proxy HTTP503 during M0 publication. Connector publication used expected-head leases and exactly matching source trees: local M0 `68a5390`, remote initial `65b314e`, tree `118c7beb006725f9e3a832d9e12b989a89e98855`; isolated launcher/race fixes produced remote M0 `cf073da`, tree `84d372a2dcf846ae52ea81d92024e3adec516377`.

Native Git recovered at 07:53 UTC without proxy/CA/credential changes. Remote history was fetched; local M1 tree equaled remote tree `5225013024e67706ed30a2bd4305dd5dc572d347`. A soft reset aligned M2 ancestry without losing edits; prior local history remains at `sparko/local-transport-checkpoint` (`1c23d96`). Native pushes can resume. Do not force-push alternate local history. If transport fails again, connector writes need expected-head checks and verified tree equality. Both created PRs are attached to this chat.
