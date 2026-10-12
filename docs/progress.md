# Sparko implementation progress

Active continuation (Claude, 2026-10-12). Repository: private `Huy1234secret/Sparko`; default branch `main`. All application source is new; no legacy source was read/imported. Brand `#FACC15`; intended production origin `https://panel.coin-sprite.com/`. Milestone PR creation and merge are authorized by the user; production deployment/domain cutover is a separate operator action.

## Resume checkpoint

- `main` contains M1–M3 ([PR #2](https://github.com/Huy1234secret/Sparko/pull/2), [PR #3](https://github.com/Huy1234secret/Sparko/pull/3), [PR #4](https://github.com/Huy1234secret/Sparko/pull/4)), the vendored project skills ([PR #5](https://github.com/Huy1234secret/Sparko/pull/5)) and the UI/UX pass ([PR #6](https://github.com/Huy1234secret/Sparko/pull/6), `3303fbe`).
- M4 merged ([PR #7](https://github.com/Huy1234secret/Sparko/pull/7), `396bfdd`). It merged the paused M4 branch `claude/amazing-maxwell-yonuhl` (`cafe717`, kept intact on the remote) onto the UI pass. See `docs/milestones/m4.md`.
- M5 merged ([PR #8](https://github.com/Huy1234secret/Sparko/pull/8), `e9d58a1`). See `docs/milestones/m5.md`.
- M6 merged ([PR #9](https://github.com/Huy1234secret/Sparko/pull/9), `f7ee647`). See `docs/milestones/m6.md`.
- M7/M8 merged ([PR #10](https://github.com/Huy1234secret/Sparko/pull/10), `114b548`). See `docs/milestones/m7.md`.
- M9 is delivered from `claude/clever-lovelace-b5a124`, restarted from `114b548`. See `docs/milestones/m9.md`, `docs/quality.md` and `docs/deployment-plan.md`.
- Run `git log --oneline -5` and `git status` before editing. Each milestone is a PR into `main`, merged after CI passes on the exact head; the next milestone restarts the working branch from the merged `main`.

## Milestone / PR state

| Milestone                   | State      | Evidence / next gate                                                                                                                                                      |
| --------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 Foundation               | **Merged** | [PR #1](https://github.com/Huy1234secret/Sparko/pull/1); main CI passed.                                                                                                  |
| M1 Identity / first tickets | **Merged** | [PR #2](https://github.com/Huy1234secret/Sparko/pull/2) at `ad6e1f1`; [main CI run 38131958193](https://github.com/Huy1234secret/Sparko/actions/runs/38131958193) passed. |
| M2 Message platform         | **Merged** | [PR #3](https://github.com/Huy1234secret/Sparko/pull/3) (`338bd6a`). See `docs/milestones/m2.md`.                                                                         |
| M3 Community                | **Merged** | [PR #4](https://github.com/Huy1234secret/Sparko/pull/4) (`8108330`). See `docs/milestones/m3.md`.                                                                         |
| UI/UX pass over M1–M3       | **Merged** | [PR #6](https://github.com/Huy1234secret/Sparko/pull/6) (`3303fbe`). See `docs/milestones/ui-pass.md`.                                                                    |
| M4 Safety/support expansion | **Merged** | [PR #7](https://github.com/Huy1234secret/Sparko/pull/7) (`396bfdd`). See `docs/milestones/m4.md`.                                                                         |
| M5 Time and automation      | **Merged** | [PR #8](https://github.com/Huy1234secret/Sparko/pull/8) (`e9d58a1`). See `docs/milestones/m5.md`.                                                                         |
| M6 Gates, plans and support | **Merged** | [PR #9](https://github.com/Huy1234secret/Sparko/pull/9) (`f7ee647`). See `docs/milestones/m6.md`.                                                                         |
| M7/M8 Economy and social    | **Merged** | [PR #10](https://github.com/Huy1234secret/Sparko/pull/10) (`114b548`). See `docs/milestones/m7.md`.                                                                       |
| M9 Config tools and quality | **PR**     | All local gates pass. See `docs/milestones/m9.md`; PR and CI recorded on merge. Production deployment awaits separate authorization.                                      |

## Verification record (M9 source)

Local, Node 24.19.0, pnpm 11.25.0, Prisma 7.10.0, PostgreSQL 16 / Redis 7 local disposable services (CI uses PostgreSQL 17.6 / Redis 7.4.6): typecheck, lint, format, build and browser boundary pass; 274 unit, 173 PostgreSQL integration and 29 browser tests pass, including the axe accessibility matrix (0 violations on 23 pages in both themes). Local load baseline in `docs/quality.md`.

All browser/integration tests use a controlled external Discord boundary. They do not prove live Discord acceptance.

## Environment notes

- Start Docker with `dockerd &` if the socket is missing; use `infra/compose.test.yaml` when Docker Hub is reachable. Otherwise initialise a local PostgreSQL cluster on port 55432 with user/password `sparko` and the three disposable databases from `infra/test-databases.sql`, and run `redis-server --port 56379`.
- Install Node 24.19.0 if the image has an older Node (the repo `engines` field requires it).
- Never point reset-based tests at a non-disposable database; the runner enforces `*test` database names and Redis DB 15.

## M3 outcome and remaining community limits

Resolved: typed community services/pages; `/levels/me` member portal; single rank-card contract and API/`/level` parity with hidden-XP and max-level fixes; crate/counting/greeting/reward/role-menu workflows with histories and delivery errors; crate fallback/failure policy; configured designs; publish-after-delivery; shared privileged-role policy; module-wide channel/role preflight; suggestion/Q&A queues; giveaway detail/reroll/claims; starboard provenance; analytics gaps/units/coverage.

Still open (tracked for later milestones): rank cards do not render avatars/backgrounds; community message XP, counting and starboard depend on live Gateway observation; leaderboards show user IDs (no stored display names).

## M4 outcome and remaining safety/support limits

Resolved: typed moderation (timed bans/locks), forms and staged review, reports/appeals with member intake, verification settings and member flow, auto moderation rules with a no-effect tester, raid guard and anti-nuke incidents with recorded manual recovery, ticket priority/assignment/availability/waiting-for-member/participants, SLA reminder and escalation timers, staff metrics, and in-page transcript search.

Still open: automatic waiting-for-member transitions on member replies and every Gateway-driven safety signal need live observation; staff availability is self-reported; anti-nuke never punishes automatically or recreates deleted resources (by design).

## M5 outcome and remaining time/automation limits

Resolved: typed workspaces for polls, events/RSVP, reminders, birthdays, temporary voice, invite tracking and rewards, scheduled messages, auto replies, sticky messages, workflows (typed step builder with an engine-rule dry run, no JSON) and custom commands; member-side voting, RSVP, reminders, birthday and voice-room controls in the member profile; zone-aware time editing that matches the server's DST rules; `GET /invite-rewards`; one shared auto-reply matcher.

Still open: fresh role eligibility at waitlist promotion; ambiguous voice-room creation reconciliation; every Gateway-driven automation (messages, joins, voice, invites) and command registration need live observation; lists show Discord user IDs rather than display names.

## M6 outcome and remaining commercial/operator limits

Resolved: one shared feature gate (server switch, stored owner policy, plan) used by HTTP, Gateway, workflows and worker with cleanup exempt; uniform Free/Plus limits with data kept on downgrade; delegated resource discovery; server Plan & billing and `/account/billing`; capability-scoped owner console with per-module pause, staff Plus grants, audited job retry, support queue and operator access; product support lifecycle with private screenshots; privacy export kinds.

Still open: real Stripe sandbox checkout/callbacks/refunds/disputes; moving a subscription between servers; reply notifications for support; scoped diagnostic exports; usage/quota dashboards.

## M7/M8 outcome and remaining economy/social limits

Resolved: composite member read models (`/economy/me`, `/inventory/me`, `/collections`, `/trades/me`, `/auctions`, `/lotteries`); trivia reload recovery (`GET /games/me`); staff order queue (`GET /shop/orders`) with reasoned refunds; member economy portal; typed staff pages for every economy module including R52 navigation; social alerts sources/items/budgets; external-event integrations with one-time secrets; honest provider status for social, music and AI.

Still open: live role delivery; live provider polling/AI/voice runtime; member/staff AI request UI; display names instead of user IDs.

## M9 outcome and remaining release limits

Resolved: configuration backups (snapshot, import, download, remapped restore under previewed revisions); opt-in multi-server preview and per-server atomic rollout behind Plus and fresh authorization; public widget publishing; one shared reference/remap/revision writer for settings; WCAG 2.2 AA automated matrix with the fixes it found; loopback load tool and baseline; staged deployment plan.

Still open: live acceptance (see `docs/quality.md`); rollout between two real guilds; screen-reader passes and a reviewed Vietnamese interface; production deployment and cutover after authorization.

## Next concrete action

Merge M9 after CI passes on its exact head, then restart the working branch from `main`. The code milestones are then complete. What remains needs the owner: the authorizations and inputs in `docs/deployment-plan.md` (hosting, DNS, Discord application, secrets, approved providers) for staging, then live acceptance, then production and cutover, each separately authorized.

## Later exact gaps / external prerequisites

M4–M5 (delivered; residual): full anti-nuke response/restoration (by design unsupported); fresh waitlist eligibility; ambiguous temporary-voice creation reconciliation. Invite ambiguity stays unknown rather than fabricated.

M6 (delivered; residual): provider sandbox commercial evidence, subscription moves, support reply notifications, scoped diagnostic exports and usage dashboards.

M7/M8 (delivered; residual): AI request UI, real voice runtime and live provider/role-delivery evidence. See `docs/milestones/m7.md`, `docs/economy.md` and `docs/providers.md`.

M9 (delivered; residual): live acceptance and capacity on the real host, assistive-technology passes, a reviewed Vietnamese catalogue, and authorized deployment. Pending asset reservations intentionally retain quota until retried; abandoned-file reclamation needs safe reconciliation, not blind expiry.

No Discord/provider/hosting credentials are bound. Live checks require an authorized Discord application/client secret/token/callback/test guild/permissions/intents and appropriate provider sandbox accounts/keys. Exact live checks: OAuth exchange, install/hierarchy, V2/embed/modal/StringSelect/media/emoji behavior, private channels/transcripts, Gateway reconnect/invites, billing callbacks, social access, AI requests, and music after a real voice adapter exists. Hosting/DNS/TLS access and explicit cutover authorization are required for production. No live success, synthetic telemetry or deployed release is claimed.
