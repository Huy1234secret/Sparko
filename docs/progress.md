# Sparko implementation progress

Active continuation (Claude, 2026-10-11). Repository: private `Huy1234secret/Sparko`; default branch `main`. All application source is new; no legacy source was read/imported. Brand `#FACC15`; intended production origin `https://panel.coin-sprite.com/`. Milestone PR creation and merge are authorized by the user; production deployment/domain cutover is a separate operator action.

## Resume checkpoint

Work continues on `claude/amazing-maxwell-yonuhl`. It was built from the M2 continuation `claude/zen-noether-1w2xai` (`1da2342`, worker repairs + idempotency race fix) with `main` (`ad6e1f1`, M1 merge) merged in. Run `git log --oneline -5` and `git status` before editing. Each completed milestone is delivered as a PR from this branch into `main`, merged after CI passes on the exact head, then the branch continues from the merged result.

## Milestone / PR state

| Milestone                   | State                    | Evidence / next gate                                                                                                                                                      |
| --------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation               | **Merged**               | [PR #1](https://github.com/Huy1234secret/Sparko/pull/1); main CI passed.                                                                                                  |
| M1 Identity / first tickets | **Merged**               | [PR #2](https://github.com/Huy1234secret/Sparko/pull/2) at `ad6e1f1`; [main CI run 38131958193](https://github.com/Huy1234secret/Sparko/actions/runs/38131958193) passed. |
| M2 Message platform         | **Complete locally; PR** | All local gates pass (below). See `docs/milestones/m2.md`. PR/CI recorded on delivery.                                                                                    |
| M3 Community                | Next                     | Backend substantial; typed UI and combined acceptance remain (findings below).                                                                                            |
| M4–M9                       | In progress (partial)    | See later gaps below and per-feature rows in `docs/feature-traceability.md`.                                                                                              |

## Verification record (delivered M3 source)

Local, Node 24.19.0, pnpm 11.25.0, Prisma 7.10.0, PostgreSQL 16 / Redis 7 local disposable services (Docker Hub returned HTTP 429; CI uses PostgreSQL 17.6 / Redis 7.4.6). Results are recorded in the M3 PR description after the final run on the exact head.

M2 was delivered with 165 unit / 135 integration / 7 browser tests; its PR CI run passed every required step including Compose validation and both images.

All browser/integration tests use a controlled external Discord boundary. They do not prove live Discord acceptance.

## Environment notes

- Start Docker with `dockerd &` if the socket is missing; use `infra/compose.test.yaml` when Docker Hub is reachable. Otherwise initialise a local PostgreSQL cluster on port 55432 with user/password `sparko` and the three disposable databases from `infra/test-databases.sql`, and run `redis-server --port 56379`.
- Install Node 24.19.0 if the image has an older Node (the repo `engines` field requires it).
- Never point reset-based tests at a non-disposable database; the runner enforces `*test` database names and Redis DB 15.

## M3 outcome and remaining community limits

Resolved: typed community services/pages; `/levels/me` member portal; single rank-card contract and API/`/level` parity with hidden-XP and max-level fixes; crate/counting/greeting/reward/role-menu workflows with histories and delivery errors; crate fallback/failure policy; configured designs; publish-after-delivery; shared privileged-role policy; module-wide channel/role preflight; suggestion/Q&A queues; giveaway detail/reroll/claims; starboard provenance; analytics gaps/units/coverage.

Still open (tracked for later milestones): rank cards do not render avatars/backgrounds; community message XP, counting and starboard depend on live Gateway observation; leaderboards show user IDs (no stored display names).

## Next concrete action

M4 — complete staff/ticket/forms/reports/moderation interfaces, scheduled lock/ban expiry, anti-nuke variants/restoration, verification and hierarchy diagnostics. Start by listing safety routes in `packages/domain/src/safety.ts`, compare with the generic module pages, and build typed workspaces using `apps/web/src/features/config` like M3.

## Later exact gaps / external prerequisites

M4–M5: full staff/ticket/forms/safety/time UI; timed lock/ban expiry; full anti-nuke response/restoration; fresh waitlist eligibility; ambiguous temporary-voice creation reconciliation; workflow recovery. Invite ambiguity stays unknown rather than fabricated.

M6: persist owner feature policy separately; enforce shared plan/prerequisite/runtime gates in direct Gateway/workflow/worker paths while allowing cleanup/refunds/privacy maintenance. Uniform plan limits, delegated resource discovery, `/account/billing` route, support-only owner navigation/read scopes, support replies/attachments/status, grants, privacy export kinds and commercial lifecycle UI remain.

M7/M8: typed member/staff workflows; correct endpoints `/economy/me`, `/trades/me`, `/reputation/me` and `/social/sources`; composite inventory/collection/lottery DTOs; R52 navigation; staff refund/order queue; trivia reload recovery; actual opt-in multi-server rollout; provider panels and real voice runtime. See `docs/economy.md` and `docs/providers.md`.

M9: complete acceptance/load/accessibility/localization and authorized deployment. Pending asset reservations intentionally retain quota until retried; abandoned-file reclamation needs safe reconciliation, not blind expiry.

No Discord/provider/hosting credentials are bound. Live checks require an authorized Discord application/client secret/token/callback/test guild/permissions/intents and appropriate provider sandbox accounts/keys. Exact live checks: OAuth exchange, install/hierarchy, V2/embed/modal/StringSelect/media/emoji behavior, private channels/transcripts, Gateway reconnect/invites, billing callbacks, social access, AI requests, and music after a real voice adapter exists. Hosting/DNS/TLS access and explicit cutover authorization are required for production. No live success, synthetic telemetry or deployed release is claimed.
