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

## Verification record (delivered M2 source)

Local, Node 24.19.0, pnpm 11.25.0, Prisma 7.10.0. Docker Hub returned HTTP 429, so the disposable services were local PostgreSQL **16** on `localhost:55432` (`sparko_test`, `sparko_browser_test`, `sparko_restore_test`) and Redis 7 on `localhost:56379` (DB 15). CI uses PostgreSQL 17.6/Redis 7.4.6 containers.

- `pnpm typecheck`, `lint`, `format:check`, `build` (19 prerendered routes, browser boundary) — pass.
- `pnpm test` — **165/165** unit.
- `pnpm test:integration` (empty disposable schema, five migrations) — **135/135** in 13 files.
- `pnpm test:e2e` (separate browser database) — **7/7** journeys.
- Desktop (1440×900) and mobile (390×844) screenshots of picker, overview, Studio, setup, analytics and ticket settings were inspected; the Studio mobile inspector width and `/messages/*` deep-link defects found were fixed.
- Not run locally: production Compose validation (needs CI secrets env) and Docker image builds (registry rate limit). CI runs both.

All browser/integration tests use a controlled external Discord boundary. They do not prove live Discord acceptance.

## Environment notes

- Start Docker with `dockerd &` if the socket is missing; use `infra/compose.test.yaml` when Docker Hub is reachable. Otherwise initialise a local PostgreSQL cluster on port 55432 with user/password `sparko` and the three disposable databases from `infra/test-databases.sql`, and run `redis-server --port 56379`.
- Install Node 24.19.0 if the image has an older Node (the repo `engines` field requires it).
- Never point reset-based tests at a non-disposable database; the runner enforces `*test` database names and Redis DB 15.

## M3 review findings / next implementation plan

Existing backend logic is substantial; generic record views do not fulfill its combined exit gate.

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
