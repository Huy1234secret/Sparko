# Community domain

The community implementation is new application code. It consumes verified Discord Gateway observations through `ingestCommunityEvent` and records business changes in PostgreSQL through `Platform.mutate`. There is no HTTP endpoint for manufacturing message XP, counting turns, member joins, voice activity, or starboard reactions.

## Configuration and scope

`communityConfigSchemas` defines validated configuration for R09/R10/R11/R15/R16/R17/R19/R20/R31/R34/R35/R36/R48. The central `/guilds/:guildId/features/:featureId/config` API owns configuration revisions and authorization. Modules default to disabled. Reward roles, role menu roles, destinations, bot permissions, and hierarchy require current Discord resource checks before publication and execution. The workers must report provider failures as pending/failed delivery; committing a desired role does not establish that Discord applied it.

All records are scoped by `guildId`, typed `kind`, and unique business `key`. Mutations run under the platform's serializable transaction, per-guild advisory lock, request identity, and audit log. Notifications and role changes use the durable outbox after the business commit. Member reads/actions use the authenticated actor identity; managers need `community.manage` and analytics reads need `analytics.read`.

## Gateway contract

Every event has `kind`, stable `eventId`, and UTC ISO `occurredAt`. Message events have `messageId`, `memberId`, `roleIds`, `channelId`, nullable `content`, `bot`, and `webhook`. Member events are `memberJoin`, `memberLeave`, `memberBoost`, and `memberUpdate`, with member ID, roles, bot flag, and optional observed `joinedAt`/`accountCreatedAt`. Reaction events have source message/channel/author IDs, reacting member/roles, emoji, add/remove flag, and nullable source content. Edits/deletions refer to the source IDs. Voice events have member ID, previous/current nullable channel IDs and AFK state. `coverage` records each metric's `collecting` or `gap` transition and reason.

The bot supplies these facts from Discord, not user input. Unknown message content remains null. Gateway receipt records contain source identities and timestamps, not full message text. Repeated source events do not produce repeated business rewards. Gateway message edits never award XP again. Counting stores numeric turns; starboard stores observed source text only for its enabled mirror function.

## Levels and rewards

XP is a nonnegative safe integer. The level threshold is `baseXp × level + growthXp × level × (level − 1) / 2`, bounded to 1000 levels with validated coefficients. Curve changes retain lifetime XP and recompute displayed levels. Role multipliers choose the highest matching configured value; the selected channel multiplier is multiplied and capped. A zero multiplier disables XP for that match. Bots, webhooks, excluded roles/channels, repeated message IDs, and events inside or older than the member cooldown are excluded. Message content is not necessary to award message-event XP.

`grantXp(ctx, userId, amount, source, reason)` commits the profile and unique history together. Reusing a source with a different recipient or amount fails. Administrative adjustments have a bounded signed amount and required reason. Rank responses include progress bounds, card preferences and an accessible text summary. Public leaderboards include only members who explicitly opt into a public profile; totals remain tenant scoped. Image rendering, seasonal progression, and achievement rewards are separate integrations with the same authoritative profile/grant service.

Reward reconciliation persists the desired managed role set and queues a fresh hierarchy checked Discord effect. Stack policy retains every achieved reward; highest policy retains the highest achieved reward. Preview returns the desired set without assigning roles. Unrelated roles are not removed.

## Crates and counting

Crates select from positive finite integer weights using `crypto.randomInt`; fixed type and reward rules are captured at drop creation. A drop has expiry, capacity, selected art/document, channel, delivery state, and repeat exclusions. Claims require successful publication and commit claim identity, capacity, and XP together. Previews are explicitly zero reward and cannot be claimed. Notifications retry independently of rewards.

Schedules persist interval, first run, destination, and `skip`/`run-once` misfire policy. Each occurrence uses a unique schedule/run key, schedules its durable successor, and can be cancelled. Worker restarts do not create another drop for the same occurrence. A skipped overdue run records its reason. The next occurrence starts after the last scheduled time or recovery time, whichever is later.

Counting accepts signed decimal integer syntax only; expressions are not evaluated. Source snowflakes establish channel ordering: an event older than the last observed source cannot reset newer state. A member cannot take consecutive turns unless enabled. Wrong values/turns/cooldown violations reset or are ignored according to policy. Noninteger chatter is ignored while preserving source ordering. State preserves the current value, member, source, streak/best and run identity. Milestone rewards use `channel:run:checkpoint` identity. Authorized resets require revision, reason, confirmation, and retain reset history.

## Roles and greetings

Role menus validate min/max selections, exclusive groups, required and blocked roles, and optional expiry. A member submits only selected IDs from the persisted published menu. Selection changes increment a business revision and supersede old expiries. Timed access uses the original expiry instants; expirations carry a revision fence and cannot undo a newer menu selection. Observed removal of a selected role marks applied ownership externally changed and invalidates old expiry. This depends on actual member-update observation; it does not claim to detect unobserved changes while disconnected. Delivery-state updates must not increment business revision.

Join/boost autoroles store desired state and optional durable join delay. Welcome, leave, and boost output use the shared message document compiler, token registry and retryable channel/DM effects. A refused DM is a real delivery error. Member/boost event coverage depends on required Gateway intents. Unavailable facts are not inferred.

## Giveaways

Creation captures prize, destination, end, winner slots, eligibility, limits, claim duration, replacement policy and message design. Publication must apply before entry opens. Entry identity is unique per member/giveaway. Roles and level are checked using the authenticated actor; account age derives from the Discord user snowflake. Required member tenure needs an observed join time; absent facts reject entry instead of treating them as eligible.

Draws use unbiased partial Fisher–Yates with `crypto.randomInt`. The automatic deadline and authorized “end now” converge on one initial draw. Draw records preserve entry IDs, rule snapshot, winner order, exclusion history, algorithm and claim deadline. Entry eligibility is snapshotted; observed departed members are excluded at draw. Claims recheck current entry requirements and belong only to the winner actor. Delivery retries do not alter results.

Rerolls preserve historical draws, exclude every prior winner, replace prior unclaimed winner states, and retain claimed prizes. New slots cannot exceed the configured winner count minus already claimed slots. Optional claim expiry replacement grants precisely expired slots; it does not change the original live rules. Expiry itself is persisted so a repeated deadline cannot generate a second replacement draw.

## Suggestions, Q&A and starboard

Submissions default to private. Public submission requires server configuration; member list/search returns only the actor's own and public records. Managers use separate staff reads. Suggestions have unique actor votes, manager decision/reason/revision history, an optional Discord discussion URL and decision DM. Q&A answers require staff capability; the author alone can accept an answer. Private questions are not exposed as public knowledge.

Starboard votes are unique by source message/member. Configured emoji, exclusions, self-vote policy and removed-vote policy determine counts. One source record tracks the mirror and its real observed provenance. Edits synchronize; deletion deletes the mirror or presents a tombstone, according to policy. Missing/deleted text remains unavailable. Web requests cannot attribute Discord reaction votes.

## Analytics and retention

The API exports the same hourly aggregates used for charts: messages, joins, leaves, voice transitions and observed participant-seconds. Requested boundary hours are included in full and this precision is disclosed. Coverage transitions distinguish no collection, no activity, actual observations, and gaps. Open gaps continue until a collecting observation resumes. A fresh aggregate timestamp does not establish complete collection. Voice sessions never extrapolate across missing coverage, out-of-order events or an unobserved interval longer than one day. AFK time is excluded.

Retention settings are validated. Deployment must schedule retention cleanup for analytics buckets and coverage records; until that cleanup is integrated, operators must not claim automatic retention enforcement. Event dedupe receipts and business reward history need distinct retention policies so deletion cannot reopen rewards. Message-text storage is limited to explicitly enabled features; see the overall privacy/export policy.

## Routes and delivery integration

`communityRoutes` includes own level/history and preferences, opt-in leaderboard, administrative XP adjustments, role reconciliation preview/action, crate list/create/claim/schedules/cancellation, counting status/reset, role menu list/create/select, giveaways list/create/entry/draw/reroll/claim, actor-visible/staff suggestions and questions, suggestion vote/decision, question answer/resolve, starboard staff history, and analytics JSON/CSV range reads. Creation responses distinguish committed records from pending external delivery.

`runCommunityJob` handles `community.crate.schedule`, `community.crate.drop`, `community.crate.expire`, `community.giveaway.draw`, `community.giveaway.claim-expire`, and `community.roles.expire` inside `Platform.mutate`. Provider workers handle message/publication/reconciliation effects. Successful crate publication sets `publicationState=applied` and state `open`; giveaway publication sets state `open`; role menu publication sets `published`. Providers recheck configuration access, actor/source scope, current permissions/hierarchy and stale revisions before executing.

## Verification evidence

`community.test.ts` currently verifies 16 cases including exact curve boundaries, bounded/weighted randomness, unique sampling, exclusions/cooldown/boost caps, counting late events and turns, analytics gaps, actual gateway domain ingestion, XP source uniqueness, crate capacity/replay/publication gates, immutable initial giveaway draw identity, actor-bound claims, and missing member facts. The domain package typechecks. Repository doubles test the actual services; PostgreSQL serializable/advisory-lock concurrency and real Discord publication require separate integration/live checks. No live Gateway, role assignment, crate message or giveaway notification is asserted by these unit tests.
