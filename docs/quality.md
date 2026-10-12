# Acceptance, accessibility, localization and load

This is the M9 quality matrix. It separates what automated local checks prove from what still needs a live Discord application, provider accounts, assistive-technology users or a production host. Nothing here claims live success.

## Acceptance matrix

Every row below runs on each pull request in CI (`verify`) against disposable PostgreSQL and Redis with a controlled Discord boundary.

| Area                                   | Automated local evidence                                                              | Needs live acceptance                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Sign-in, sessions, CSRF, access policy | API security PG suite; OAuth state/callback in every browser journey                  | Real OAuth exchange and callback on the production origin                   |
| Tickets and support                    | Ticket member/staff browser journeys; ticket PG suite                                 | Private channel creation, transcripts and permissions in a real guild       |
| Message Studio and publications        | Studio browser journey; publication PG suite                                          | Components V2/embed rendering, emoji and media in Discord clients           |
| Community, safety, automation          | Community, safety and automation browser journeys and PG suites                       | Gateway observation (messages, joins, voice, invites), command registration |
| Plans, billing, owner console          | Owner/account browser journey; billing callback PG tests                              | Stripe sandbox checkout, callbacks, refunds and disputes                    |
| Economy and social                     | Economy browser journeys; economy/provider PG suites                                  | Role delivery and hierarchy; live RSS/YouTube/Twitch/GitHub polling         |
| Backups, multi-server, widgets         | Config-tools browser journeys; API PG suite (privacy, revisions, remap, opt-in, Plus) | Rollout between two real installed guilds                                   |
| Music and AI                           | Settings and consent pages; PG consent/quota tests                                    | A voice runtime and an approved AI provider (neither is present)            |

The release gate in [deployment](deployment.md) lists the live checks to record before cutover.

## Accessibility

Target: WCAG 2.2 AA.

**Automated** (`tests/e2e/accessibility.spec.ts`, runs in CI):

- axe-core 4.13 checks every WCAG 2.0/2.1/2.2 A and AA rule it supports on 23 pages, in both the light and the dark theme:
  - 5 public pages: home, features, docs, status and privacy.
  - 18 signed-in pages: the server list, overview, setup, tickets, Studio, levels, shop, moderation, workflows, analytics, backups, multi-server, widgets, preferences, privacy, member profile, member economy and the owner console.
  - The suite fails on any violation.
  - The first scan found three contrast failures (footer note, Studio block labels) and an unlabeled Studio file input. All four are fixed, and the current result is zero violations.
- Reflow: the new settings pages and the member economy portal fit at 320 CSS px (400% zoom of 1280) and 640 CSS px (200% zoom) without sideways scrolling. `ui-navigation.spec.ts` covers the earlier pages at 375 and 720 px.
  - Rows of buttons now wrap instead of overflowing.
- Keyboard:
  - A backup is named and saved using only Tab, typing and Enter.
  - `ui-navigation.spec.ts` covers the finder, breadcrumbs, focus after navigation and Studio deep links.

**Manual inspection** (this milestone):

- New pages were inspected at 375, 768 and 1440 px in both themes.
- Reduced motion follows the system setting and the account preference, as delivered in the UI pass.

**Not yet done:**

- Screen-reader passes with NVDA, JAWS, VoiceOver and TalkBack.
- Testing with users who rely on assistive technology.
- Windows high-contrast mode.

Automated rules catch only part of WCAG; these passes are required before a public launch.

## Localization

- **Interface:** all copy is English. The preferences page already says so.
- **Saved preference:** members can choose Tiếng Việt, and the choice is saved for localized notifications.
- **Vietnamese input:** full diacritics are kept exactly in names and labels and fit at 320 px. This is covered by the keyboard test.
- **Dates:** shown in the browser's locale. Instants are stored in UTC, and server schedules use each server's IANA timezone (default Asia/Ho_Chi_Minh).
- **Remaining:** a Vietnamese interface needs a reviewed translation catalogue and a native-speaker review. This release does not ship machine translation.

## Load baseline

`pnpm load` signs in through the real OAuth state and callback against the browser-test server's controlled Discord. It then runs a fixed mix of public and signed-in reads, and refuses non-loopback origins unless explicitly allowed.

Run on 2026-10-12 against a local disposable stack:

- Node 24.19, PostgreSQL 16, Redis 7, one API process.
- Rate limit raised with `TEST_API_RATE_LIMIT_PER_MINUTE`.
- 20 s at concurrency 16.

| Route                          | Requests | p50 ms | p95 ms | p99 ms |
| ------------------------------ | -------: | -----: | -----: | -----: |
| `/health/ready`                |      910 |     11 |     18 |     22 |
| `/api/v1/public/status`        |      913 |     11 |     18 |     24 |
| `/api/v1/guilds`               |      915 |     33 |     51 |     64 |
| server overview                |      916 |     46 |     75 |    106 |
| module settings                |      917 |     55 |     84 |    114 |
| member economy (`/economy/me`) |      916 |    138 |    206 |    247 |
| backups list                   |      910 |     37 |     59 |     74 |

Totals: 6,397 requests (320 per second) and no errors.

The Discord boundary answers instantly, so these numbers measure the API and database only.

- The member economy overview is the slowest read. It assembles balance, modules, rewards and history in one transaction.
- Production capacity must be measured on the real host, with real Discord latency and the production rate limit (`API_RATE_LIMIT_PER_MINUTE`).
- The plan in [deployment-plan](deployment-plan.md) records that step.
