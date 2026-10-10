# Sparko — From-Scratch Antigravity Build Prompt

**Target:** An entirely new Discord bot + public website + member portal + server dashboard + owner dashboard + real backend  
**Build mode:** New, empty repository. Write all application code and scripts from zero.  
**Brand:** Yellow, primary `#FACC15`  
**Existing domain:** https://panel.coin-sprite.com/  
**New target repository:** https://github.com/Huy1234secret/Sparko  
**Prepared:** 10 October 2026  
**Intended coding model:** GPT-6.1 Sol; select Ultra in the client if that combination is available  
**Status:** A build specification and coding prompt. Creating this file does not create the new application or delete a GitHub repository.

## How to use this file

Use the new `Huy1234secret/Sparko` repository, clone it, keep this Markdown file in its root, and open that checkout in Antigravity. Paste the launch prompt below. If the empty repository only contains a README/license/.gitignore, replace the placeholder README as part of scaffolding and preserve the chosen license.

**This is a genuinely fresh implementation:** new frontend, new backend, new database schema, new Discord handlers, new worker logic, new UI, new tests, and new build/deployment scripts. The old CoinSprite/Sparko source is not a starting skeleton. There is no required legacy runtime, data import, compatibility layer, or feature-preservation project. Existing records may stay in the old deployment; the new application starts with a clean database. Any later import is a separate user-requested task.

Select GPT-6.1 Sol and the highest supported effort you want in Antigravity's actual settings. The word **Ultra** in a prompt does not activate a client setting. Client support must be checked; when using the OpenAI Responses API directly, the documented GPT-6.1 Sol efforts are `low`, `medium`, `high`, `xhigh`, and `max`, so do not send `reasoning.effort: "ultra"`. Use `max` for the most demanding API work. This brief does not establish Antigravity's model availability or invent a configuration key. [O1–O3]

### Copy-paste launch prompt

```text
You are my senior full-stack product engineer, Discord application engineer,
UI designer, and release owner. Read
SPARKO_ANTIGRAVITY_FROM_SCRATCH_GPT61_ULTRA.md completely and implement it.
I want a completely new Sparko product written from zero in this new empty
repository. I do not want an incremental refactor of my old bot.

Create all-new application code and scripts: public website, member portal,
server dashboard, owner dashboard, REST API, Discord bot, durable workers,
database schema, assets, tests, local setup, CI, and deployment documentation.
My brand color is yellow (#FACC15). My existing domain is
https://panel.coin-sprite.com/. Use Sparko as the working product name unless
I explicitly rename it. The target is Huy1234secret/Sparko. Verify that this is the repository open
in the workspace before writing application code.

Do not copy, wrap, retain, or build on the old CoinSprite implementation.
Do not add the old repository as a source dependency or submodule. Historical
project information in this brief supplies product context only. All new
application modules, handlers, schemas, UI components, tests, and runtime
scripts must be written for this architecture. Normal third-party libraries
and standard framework scaffolding are allowed.

Start with a clean database. Do not make old-data migration, old command
compatibility, old published-message support, or old framework preservation
prerequisites. Those are separate projects only if I request them later.
Keep new production records consistent and durable once the new system runs.

Use React + Vite + strict TypeScript, Tailwind CSS, React Router DOM, Lucide
React, Recharts, Zustand, React Hook Form + Zod, Axios behind a typed service
layer, TanStack Query, and Lottie/dotLottie for website animations. Build the
real backend now with TypeScript, Fastify, PostgreSQL, Prisma, Redis/BullMQ,
and discord.js. Use one shared domain layer, contract package, authorization
policy, message compiler, and durable operation system. Pin compatible
supported releases after checking official documentation.

Discover and use relevant installed frontend-design, React, TypeScript,
backend, database, Discord, accessibility, testing, security, and deployment
skills. Read their actual instructions. Framework names are stack choices,
not proof a skill is installed. Any old project-skill requirement to preserve
CommonJS, old dashboard scripts, SQLite/JSON storage, or old runtime structure
is outside this fresh-build scope. Follow higher-priority environment rules.
Do not claim unavailable skills were used or activate disabled skills.

Aim to outperform Arclo through clear setup, attractive message design,
reliable automation, accessible mobile workflows, honest metrics, and complete
features. Verify competitor context from official public sources and build
an original yellow identity. Do not copy its assets or invent benchmark wins.

Use Discord Components V2 for modern interactive messages and traditional
embeds as a separate output mode. Do not combine embeds/content with the V2
flag. JSON animations run on the website; supported exported media or valid
animated emojis provide Discord equivalents. Respect SDK/protocol limits,
interaction deadlines, permissions, intents, and role hierarchy.

Implement the whole P0/P1/P2 roadmap in milestones. Each feature needs its
frontend, API/domain behavior, Discord behavior where applicable, persistence,
authorization, failure states, meaningful tests, and documentation. Start
with a working vertical slice, then continue through the full roadmap. Do not
stop after scaffolding, static pages, or one milestone. Provider-dependent P3
features need real adapters, capability gates, and tests; missing credentials
must be reported honestly while independent work continues.

Make routine decisions autonomously. Ask only for a genuinely blocking unknown
or an action outside scope. Keep docs/progress.md current so a long task can
resume from the last working commit. Use short progress updates. If supported
and permitted, parallel agents can own independent feature sets, with one
integrator for contracts, migrations, dependencies, and final verification.

Verify tenant isolation, permissions, stale writes, idempotency, concurrent
claims, queue recovery, full browser/API journeys, message payloads, and clean
setup. Distinguish local tests from live Discord/provider checks. Never
fabricate completion, production metrics, uptime, or successful payments.

Begin by confirming this is the intended new checkout, creating the fresh
monorepo, defining contracts and the yellow design system, and implementing
login -> server selection -> ticket configuration -> panel publication ->
Discord ticket -> persisted dashboard record. Then keep building the remaining
milestones until the complete product is reviewable and deployment-ready.
```

The prompt makes the scope, continuation, deliverables, and verification explicit. Do not expose private reasoning; show decisions, changed behavior, and test evidence. [O2]

## Contents

1. [Project evidence and assumptions](#1-project-evidence-and-assumptions)
2. [Empty repository and fresh-build rules](#2-empty-repository-and-fresh-build-rules)
3. [What better than Arclo means](#3-what-better-than-arclo-means)
4. [Skills and engineering workflow](#4-skills-and-engineering-workflow)
5. [Required technology stack](#5-required-technology-stack)
6. [Yellow brand and design system](#6-yellow-brand-and-design-system)
7. [Website and dashboard navigation](#7-website-and-dashboard-navigation)
8. [Public website requirements](#8-public-website-requirements)
9. [Server and member dashboard requirements](#9-server-and-member-dashboard-requirements)
10. [Discord experience and message platform](#10-discord-experience-and-message-platform)
11. [Message Studio and animation system](#11-message-studio-and-animation-system)
12. [Complete feature catalogue](#12-complete-feature-catalogue)
13. [Detailed feature behavior](#13-detailed-feature-behavior)
14. [Command and permission contracts](#14-command-and-permission-contracts)
15. [Architecture and service ownership](#15-architecture-and-service-ownership)
16. [Data model and consistency rules](#16-data-model-and-consistency-rules)
17. [API and realtime contracts](#17-api-and-realtime-contracts)
18. [Authentication, privacy, and security](#18-authentication-privacy-and-security)
19. [Owner operations and premium](#19-owner-operations-and-premium)
20. [Reliability and performance](#20-reliability-and-performance)
21. [Existing domain and deployment](#21-existing-domain-and-deployment)
22. [Milestones and continuation](#22-milestones-and-continuation)
23. [Testing and acceptance](#23-testing-and-acceptance)
24. [Examples and implementation contracts](#24-examples-and-implementation-contracts)
25. [Deliverables and definition of done](#25-deliverables-and-definition-of-done)
26. [Sources and limits of verification](#26-sources-and-limits-of-verification)

## 1. Project evidence and assumptions

### 1.1 Product context, not inherited implementation

Read-only inspection of the connected `Huy1234secret/CoinSprite` repository established that the current product is named **Sparko** and has an older bot/dashboard plus partial TypeScript API/bot/web/worker work. A separate `coinsprite-html` repository also exists. This information is background only. Neither repository supplies code or architecture that must be retained in the new product. [G1–G7]

The original repository has previous build plans and a legacy-focused Discord development skill. They are not the authority for this new from-scratch request. Do not import their code, preserve their entrypoints, port their SQL migrations, copy their dashboard, or require their feature identifiers. Use this document's new contracts and `R01–R70` catalogue.

Keep the yellow brand, supplied domain, and Sparko working name. Create fresh owned assets where needed. The public retrieval tool could not inspect `https://panel.coin-sprite.com/`; its deployment framework, hosting, DNS, and availability were not established. A retrieval failure is not evidence of a site outage.

The selected new `Huy1234secret/Sparko` repository was confirmed accessible, private, on default branch `main`, with only an 8-byte `README.md` at its root before this prompt was added. This is the fresh implementation target. [G8]

### 1.2 Working assumptions

- Start in the user-selected new repository: `Huy1234secret/Sparko`. Keep `CoinSprite` and `coinsprite-html` outside the build.
- Build a multi-server community product with members, staff, server administrators, and a distinct global bot owner.
- Use the supplied domain for the initial public website, member area, and dashboards; same-origin API hosting is the default.
- Use English first with Vietnamese-ready localization and explicit user/server timezones.
- Begin with a clean PostgreSQL database and new schema migrations. No old data is imported automatically.
- Keep optional modules disabled until configured. Help, setup, sessions, and privacy remain usable.
- Use real provider adapters for premium, social alerts, AI, and music; credentials/approvals are not implied by GitHub access.
- Write new local startup, build, test, registration, migration, seed, backup, deployment, and verification scripts.
- A new codebase does not require creating a new Discord application. Make the application/client ID an operator setting; reuse the user's application only if configured, without relying on old source code.

Record routine decisions in `docs/decisions.md`. Continue independent work when a provider setup step is pending. Ask only when a missing fact blocks a concrete action or changes ownership/deployment scope.

## 2. Empty repository and fresh-build rules

### 2.1 Recommended path: a new repository

The user has selected `https://github.com/Huy1234secret/Sparko` as the fresh target. Clone/open that repository and give Antigravity this file. Build the independent new codebase there. The old `CoinSprite` and `coinsprite-html` repositories are not implementation targets.

The coding agent must verify its checkout before it starts. If it is opened in the old project by mistake, create/use a separate new project directory or report the checkout mismatch. Do not implement a halfway refactor there and call it a fresh build.

### 2.2 What “from scratch” requires

1. Scaffold a new TypeScript monorepo and package manager setup.
2. Write new web pages, UI primitives, forms, routing, state management, service clients, and animation wrappers.
3. Write new API routes, domain services, policies, validation, session logic, database schema, and migrations.
4. Write new Discord command handlers, event ingestion, persistent control routing, message builders, and registration logic.
5. Write new workers, schedules, queues, outbox delivery, retries, and operational tooling.
6. Write new tests and fixtures around the new contracts and important behavior.
7. Write new README, operator docs, CI, containers, reverse proxy, environment template, and deployment scripts.
8. Start with a clean database and initial schema. Example/demo seed data is confined to explicit development mode.
9. Keep one canonical runtime path. Do not ship old `index.js`, old admin builders, compatibility shims, inherited JSON stores, old Next app, or duplicate lockfiles.
10. Use original branding/UI/assets or explicitly approved external assets with licenses. Third-party packages are allowed; copying the old custom application is not.

### 2.3 If the user chooses to reuse the repository shell

The repository name/history can stay while its application is replaced. On a separate branch, record the old commit and remove the old tracked application content before building the fresh skeleton. Remove the old runtime and source structure completely from the replacement release; do not gradually wrap it.

Keep `.git` and repository administration intact. Delete only the intended project's source paths, with an explicit file manifest; never use a blanket deletion command that could remove another directory, credentials, or attached volumes. Old operational data can stay outside the new application and is not loaded. Any deliberate permanent deletion of external databases/storage is a separate action from replacing source files.

### 2.4 No mandatory legacy work

There is no required data migration, old publication/control support, old command alias, copied feature code, or framework-preservation step. If the user later asks to import records, scope that as a separate, tested importer. Do not allow speculative backward compatibility to dominate this build.

Use normal forward schema migrations and durable records for the **new** application's own evolution. Those are fresh database engineering, not reuse of old scripts.

## 3. What better than Arclo means

The user's “arlco” is interpreted as **Arclo**, based on the existing Sparko plan and the official `arclo.gg` product. Recheck this assumption if the user supplies a different bot link. Its public material describes an all-in-one dashboard with moderation, protection, tickets, levels, giveaways, configurable output, and custom commands. That is a documented comparison baseline, not a measured performance result. [A1–A3]

Do not copy Arclo's brand, artwork, text, private behavior, or UI composition. Sparko needs a distinct yellow identity and useful improvements with evidence.

| Dimension | Sparko target | Evidence required before a superiority claim |
| --- | --- | --- |
| First setup | Invite -> login -> server -> guided preset -> permission check -> test -> enabled. Common first setup should take under three minutes excluding Discord authorization. | Timed first-time usability sessions; report test conditions. |
| Settings clarity | Every consequential setting explains effect, default, scope, and what changes for existing records. | A new admin can complete five representative tasks without a developer. |
| Message design | One reusable studio with valid V2 and embed modes, token assistance, exact compiled payload, and test delivery. | Compiler tests plus real Discord posts for representative designs. |
| Reliability | Settings, actions, and jobs survive restart; repeated input does not repeat business effects. | Crash/retry/concurrency tests and documented live smoke checks. |
| Transparency | Show saved revision, runtime-applied revision, pending delivery, collection gaps, and actionable errors. | Disconnect bot/Redis/Discord and verify honest states in the dashboard. |
| Mobile use | Setup, ticket handling, role menus, and configuration work on small screens and by keyboard. | Screenshots and tested workflows at the specified breakpoints. |
| Flexible access | Explicit page/action capabilities without handing every staff member global owner access. | Allow/deny tests for every role and tenant boundary. |
| Breadth | Deliver the whole feasible catalogue below with usable configuration and runtime behavior. | Feature traceability links UI, API, handlers, persistence, tests, docs, and provider evidence. |

Feature counts alone do not prove a better product. Prefer clear defaults, shared patterns, recovery tools, and complete workflows. Public claims must describe features actually shipped.

## 4. Skills and engineering workflow

Framework names are technology choices. Skills are reusable engineering instructions and workflows. Use both deliberately.

### 4.1 Skill discovery and use

Read applicable `AGENTS.md` files in the new repository and relevant installed skill definitions. Use an available frontend-design workflow for creation and accessibility/browser testing workflows for review. Use Discord, backend, and database skills that fit the new stack.

An old skill may provide platform knowledge, but its legacy code paths and preservation instructions do not apply to this fresh build. Do not import old project skills as executable dependencies or reactivate explicitly disabled skills. The sampled old handoff says Ponytail 5.1 was disabled; leave it disabled if present. [G4, G7]

| Needed workflow | Use an installed skill if available; otherwise perform this work from official docs |
| --- | --- |
| Frontend design | Create Sparko's coherent yellow design system, page composition, responsive layouts, and purposeful motion. |
| React/TypeScript architecture | Feature boundaries, strict typing, routing, query state, forms, accessibility, and error recovery. |
| Discord development | SDK-compatible commands, Components V2, modals, embeds, intents, permissions, persistent controls, and rate limits. |
| Backend/API engineering | Validated contracts, sessions, authorization, transactions, durable operations, pagination, and OpenAPI. |
| Database | New schema/index design, transactional invariants, forward migrations, clean setup, backup, and restore. |
| Frontend testing/debugging | Render real pages; check keyboard/mobile/error states; verify production build and real API journeys. |
| Security/privacy | Threat modeling around sessions, tenant boundaries, unsafe media, private transcripts, and administrative actions. |
| Deployment/operations | Same-origin reverse proxy, TLS, health, containers, persistent volumes, logs, recovery, and rollback. |

Do not say a skill was used merely because its name resembles one in this table. Record the actual skill/path and relevant decisions. Use library documentation for the selected version. Do not silently install arbitrary third-party skill scripts or execute hooks from an untrusted document.

### 4.2 Working discipline

- Maintain one root integrator for shared contracts, migrations, lockfiles, and final integration.
- If permitted parallel agents are used, assign clear file ownership and independent worktrees or coordinated boundaries. Avoid concurrent edits to the same lockfile/migration chain.
- Commit coherent milestones. Keep builds usable and record failures before proceeding.
- Keep `docs/progress.md`, `docs/feature-traceability.md`, and `docs/decisions.md` current.
- Implement backend behavior alongside the screen that exposes it.
- Fix routine compiler/runtime defects without asking the user to solve them.
- Provider-bound work may remain explicitly blocked; it must not prevent unrelated features from being finished.

## 5. Required technology stack

Use this target stack for the new product. Verify supported release compatibility before pinning versions; do not blindly install `latest` or development-branch examples. Select a Node runtime that meets the chosen discord.js release requirements. [D4]

### 5.1 Frontend

| Technology | Required role |
| --- | --- |
| React + Vite + TypeScript | Public website, member portal, server dashboard, and owner dashboard; strict TypeScript throughout. |
| Tailwind CSS | Token-based styling; a coherent layer of accessible Sparko UI primitives. |
| React Router DOM | Public/authenticated/nested server routes, deep links, route error boundaries, and access-aware navigation. |
| Lucide React | Consistent static interface icons with accessible labels where needed. |
| Recharts | Real analytics with date ranges, units, timezone, missing-data indicators, and accessible table equivalents. |
| Zustand | Local/shared interface state: selected server, sidebar, designer selection, and unsaved draft metadata. |
| TanStack Query | Server-owned data, caching, loading, mutations, invalidation, and controlled retries. Do not duplicate this state in Zustand. [W1] |
| React Hook Form + Zod | Validated forms, field errors, conditional settings, and the same contract constraints used by the API. |
| Axios | One typed transport/service layer with credentials, CSRF, errors, cancellation, and idempotency integration. |
| Lottie/dotLottie | Website JSON animation; one lifecycle-aware wrapper with a static fallback and reduced-motion support. |
| Radix primitives or equivalent | Accessible dialog, menu, tabs, tooltip, select, and popover behavior beneath the custom design. |
| Vitest + React Testing Library | Important state/form/access behavior; tests follow user actions instead of implementation details. |
| Playwright | Full browser journeys and responsive/keyboard verification. Use one supported runner/setup for the new workspace. |
| MSW | Contract-based API mocks for development/tests only; never the production data source. |

Use `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `noImplicitOverride`. Validate external data at runtime. Do not fill the codebase with `any`, unsafe assertions, or unchecked JSON casts. Keep browser-safe packages free of database/secret/server imports.

Vite is the chosen target. Configure SPA fallbacks and prerender/static generation for public SEO pages. Create fresh routes from the navigation specification; no old Next app or route compatibility layer is required.

### 5.2 Backend and bot

| Technology | Required role |
| --- | --- |
| Supported Node LTS + TypeScript | Consistent, pinned runtime across API, bot, workers, containers, and CI; satisfy all package engines. |
| pnpm workspace | One canonical package manager and lockfile for the new application. |
| Fastify | REST API, session handling, validation, rate limits, request IDs, OpenAPI, and health endpoints. |
| Zod/shared contracts | Versioned DTOs, feature configuration schemas, error schemas, event payloads, and compiler inputs. |
| PostgreSQL | Authoritative settings, business records, operations, ledger, deduplication, schedules, audit, and outbox. |
| Prisma | One ORM/migration layer for the new schema; use reviewed SQL where locks/constraints require it. No inherited ORM or SQL migration chain. |
| Redis + BullMQ | Reconstructable queues, bounded transient cache, coordination, and efficient due-job execution. Redis alone must not hold irreplaceable business state. |
| discord.js | Gateway events, interaction handling, command registration, REST effects, embeds, and SDK-supported V2 builders. |
| Pino + optional OpenTelemetry | Structured redacted logs and request/job correlation; traces when they materially aid diagnosis. |
| Sharp or compatible renderer | Safe image processing and rank-card exports; pin fonts and renderer identity for reproducibility. |
| Object storage/private volume | Validated public assets and permission-gated private transcripts; separate lifecycle policies. |
| Docker + Compose | Repeatable local and initial production deployment; API, bot, workers, web proxy, database, and Redis are distinct services. |
| GitHub Actions | Lint/typecheck/build/test, migration checks, browser boundary checks, and artifact/container verification. |

Use Fastify consistently; do not add an unnecessary second HTTP framework. Avoid adding Kubernetes, microservices per feature, Kafka, or a second ORM for this initial scale. A modular monorepo with explicit process responsibilities is sufficient.

### 5.3 API layer must work now

“Ready for a future REST backend” is not enough for this request. Create the typed layer **and connect it to the implemented REST backend**. Production saves, login, tickets, analytics, and owner operations must call real authorized endpoints. Pure preview can run locally when it does not require private data or side effects.

Keep `src/services/http.ts` responsible for transport and `src/services/<feature>.ts` responsible for typed feature calls. Components should not make scattered direct requests. Use abort signals for reads; retry mutations only with preserved idempotency identities and known retry safety.

## 6. Yellow brand and design system

Sparko should feel warm, clear, polished, playful, and trustworthy. Create a distinctive yellow spark/sprite mascot and a fresh matching asset set with documented ownership/licenses. Keep the yellow identity while giving the new product its own consistent visual system.

### 6.1 Color tokens

| Token | Proposed value | Use |
| --- | --- | --- |
| Brand primary | `#FACC15` | Main identity, selected accents, progress highlights, Discord container/embed accent. |
| Brand hover | `#EAB308` | Hover/pressed emphasis with dark text. |
| Brand soft | `#FEF9C3` | Light-theme selected surfaces and informative highlights. |
| Light background | `#FFFCF3` | Warm page canvas. |
| Light surface | `#FFFFFF` | Cards, forms, dialogs. |
| Light primary text | `#1C1917` | Main readable content. |
| Light secondary text | `#57534E` | Descriptions and labels; verify contrast. |
| Dark background | `#111110` | Dark page canvas. |
| Dark surface | `#1C1C19` | Cards and panels. |
| Dark raised surface | `#262620` | Menus and elevated sections. |
| Dark primary text | `#FAFAF5` | Main content. |
| Success / warning / danger | Semantic green / amber / red tokens | Status and consequences with text/icon labels. |

These are design starting points; verify every actual text/control combination. Yellow buttons use dark text. Do not use pale yellow text on white. Do not communicate errors or feature state by color alone.

### 6.2 Layout and components

- Use Inter or a similarly readable owned/self-hosted font; keep the font set small.
- Use a consistent spacing scale and restrained rounded corners. Typical cards use 12–16 px radii; controls share one size system.
- Desktop dashboard: approximately 240 px sidebar, compact top bar, breadcrumbs, clear page title, and a bounded content region.
- Mobile dashboard: drawer navigation, always-visible server context, single-column editors, and a sticky primary save action.
- Build button, icon button, input, textarea, select, switch, checkbox, radio, color picker, duration picker, server/channel/role picker, status badge, tabs, dialog, sheet, toast, skeleton, table, empty state, and permission diagnostic once.
- Important forms show dirty state, save/cancel actions, validation, last saved revision, and any runtime lag.
- Use consistent “Enable”, “Save changes”, “Preview”, “Send test”, and “Publish” meanings. A saved draft is not a Discord post.
- Use comfortable pointer targets, visible keyboard focus, accessible labels, clear disabled reasons, and screen-reader announcements for async results.
- Support light, dark, and system themes; prevent a theme flash and persist user preference.

### 6.3 Motion direction

Use short transitions for feedback, not a constantly moving dashboard. Animate the mascot on the public hero, celebrate successful setup once, and animate feature icons on intentional hover/focus or selection. Keep analytical pages calm. Respect reduced motion, pause offscreen/hidden animations, and provide a motion preference.

Do not create flashing effects, looping coin rain, excessive parallax, or animated numbers that hide real values. An animation failure must never prevent saving or using the bot.

## 7. Website and dashboard navigation

Use one app shell and a small number of meaningful navigation groups. Default to a server's enabled modules and searchable discovery; do not show a wall of seventy unexplained entries to a new admin.

| Surface | Route examples | Audience |
| --- | --- | --- |
| Public website | `/`, `/features`, `/features/:slug`, `/commands`, `/docs`, `/status`, `/support`, `/changelog`, `/privacy`, `/terms` | Visitors and members. |
| Account | `/account`, `/account/preferences`, `/account/privacy`, `/account/support` | Signed-in user; global preferences stay separate from server configuration. |
| Server picker | `/dashboard` | Signed-in user; clearly show manageable, installed, and invite-required servers. |
| Server overview | `/dashboard/:guildId` | Authorized server staff. |
| Setup | `/dashboard/:guildId/setup` | Owners/admins and approved setup managers. |
| Engagement | `/dashboard/:guildId/engagement/...` | Levels, crates, counting, economy, achievements, games, giveaways, events. |
| Community | `/dashboard/:guildId/community/...` | Welcome, roles, polls, suggestions, Q&A, starboard, birthdays, forms. |
| Support | `/dashboard/:guildId/support/...` | Tickets, applications, transcripts, staff workflows. |
| Safety | `/dashboard/:guildId/safety/...` | Moderation, automod, protection, reports, appeals, verification. |
| Messages and automation | `/dashboard/:guildId/messages/...`, `/automations/...` | Message Studio, templates, publications, schedules, workflows, custom commands. |
| Insights and settings | `/dashboard/:guildId/insights/...`, `/settings/...` | Analytics, logging, access, commands, integrations, backups, privacy. |
| Member portal | `/servers/:guildId/me`, `/leaderboard`, `/shop`, `/inventory`, `/tickets`, `/submissions` | Members see only their permitted records/actions. |
| Owner console | `/owner/...` | Explicit global operator capabilities; not a server admin shortcut. |

Implement the new route map consistently. Register the new OAuth callback explicitly. Old `/admin` aliases and other historical routes are not required unless the user later requests them.

## 8. Public website requirements

### 8.1 Homepage

Build a polished, responsive homepage with:

1. Clear logo/name, compact navigation, theme switch, “Add to Discord”, and “Open dashboard”.
2. A yellow-accented hero explaining the outcome: easier community management, attractive messages, and useful automation.
3. An interactive product demo using the same pure message compiler/design primitives. Label sample content as a demo.
4. Feature groups with a few meaningful examples instead of an undifferentiated icon grid.
5. A short setup walkthrough: invite, choose server, configure, test, enable.
6. Screenshots of the actual shipped dashboard at desktop and mobile sizes.
7. Clear availability/free/premium information driven by real configuration.
8. Honest service status and verified usage counters only when available. Omit unsupported server/user counts.
9. FAQ focused on permissions, privacy, setup, data removal, pricing, compatibility, and support.
10. A footer with docs, support, changelog, status, and operator-reviewed legal information.

Use original copy and real product behavior. Do not invent testimonials, logos, revenue, uptime badges, or fake customer names.

### 8.2 Feature, command, and documentation pages

Each feature page explains its purpose, setup, required permissions/intents, relevant command examples, configuration preview, restrictions, and plan availability. Documentation search should find settings and commands, not just page titles. Generate command references from the actual command registry so website and bot help agree.

Include quick-start guides, setup guides, “why didn't this work?” troubleshooting, tutorials for common server types, API/operator docs where appropriate, and a readable changelog. Keep unavailable features out of public claims or label their real roadmap status.

### 8.3 Public SEO and delivery

Set original titles, descriptions, canonical URLs, Open Graph images, sitemap, robots rules, semantic headings, and accessible image alternatives. Prerender public Vite routes where search visibility requires HTML content. Authenticated pages are not indexed. Keep public metrics safe and aggregate; do not leak server names or user data through a public stats endpoint.

## 9. Server and member dashboard requirements

### 9.1 Onboarding wizard

After Discord login, show eligible servers and bot installation status. When a server is selected:

1. Check current user authorization and actual bot availability.
2. Ask for a goal with presets: small community, gaming, support, creator, study, or custom.
3. Explain the modules each preset would enable; show the exact configuration diff.
4. Select relevant channels/roles using real server data and searchable selectors.
5. Run permission, hierarchy, intent, feature-access, and quota checks.
6. Offer harmless test output in a selected test channel.
7. Save the configuration, track the operation, and show when the bot applied it.
8. Give the admin a concise next action and a direct link to the module.

Preset application must not create channels, assign roles, post messages, or punish users unexpectedly. Require the explicit action for those effects. A missing prerequisite should explain what to fix and allow independent setup steps to continue.

### 9.2 Server overview

Show real module health, setup issues, bot permissions, important active records, recent configuration activity, queued operations, and useful metrics. Each metric displays its time window and data freshness. Distinguish “no activity”, “not collected”, and “service unavailable”.

Add action cards such as “Finish ticket setup”, “Your bot role is below a reward role”, “Giveaway draw needs retry”, or “Unsaved message draft”. Recommendations should come from actual server state.

### 9.3 Standard module page contract

Every module uses these sections where relevant: overview/status, general settings, rules, messages/design, permissions/exclusions, activity/history, and advanced options. Show one concise explanation before the settings. Put rare tuning behind an expandable advanced section.

Always implement loading, empty, ready, dirty, saving, saved, pending runtime, forbidden, feature locked, missing intent, missing bot permission, offline, conflict, partial failure, and retry states. A disabled button needs an explanation. On stale-save conflict, show the current revision and a diff/reload option; do not discard local edits silently.

### 9.4 Member portal

Let members view their own rank, XP history, claims, inventory, achievements, preferences, ticket history, submissions, and eligible event/giveaway states. Public leaderboards show only fields allowed by privacy settings. Members must not gain administrative access through member endpoints.

Only include member-facing actions backed by actual authorization and domain logic. Website actions cannot forge Discord message XP, counting turns, reaction entries, or gateway events. Economy purchases and claims use the same services as the Discord commands.

### 9.5 Global account and support

Support theme, locale, timezone, motion, notification preferences, privacy/export controls, and connected session management. Global product-support tickets belong to the user's account and support staff, not to any guild administrator. Keep server tickets and product support visibly distinct.

## 10. Discord experience and message platform

### 10.1 Usability and identity

- Use slash commands as the primary entry point, with discoverable subcommands and autocomplete.
- Keep `/help`, `/setup`, `/dashboard`, `/status`, and `/privacy` straightforward.
- Use clear labels, short confirmations, pagination, selective private responses, and modals for meaningful input.
- A private interaction is bound to its user; another member cannot use the same controls to view private records.
- Persistent public controls use a durable router and persisted state. Do not depend on a short-lived in-memory collector for a ticket panel or role menu.
- Recheck authorization on every button, select, modal submission, command, and final action.
- Use yellow on container/embed accents and owned images. Discord button colors are platform-defined; do not promise CSS-styled yellow buttons in Discord.

### 10.2 Components V2 and embed modes

Implement two explicit output modes. **V2** uses `IS_COMPONENTS_V2` and component-based content; **embed** uses traditional embeds and compatible legacy controls. V2 disables ordinary `content`, `embeds`, `poll`, and `stickers`; its flag cannot be removed once applied to a message. Attachments require component exposure. Validate the current aggregate limit of 40 components and all nesting/type rules. Interactive `custom_id` values must be distinct per message and fit the documented 1–100 character limit. [D1, D2]

Prefer SDK-supported containers, text displays, sections, separators, galleries, thumbnails, buttons/selects, and supported modal components. Compile from a typed internal document; never send user-authored arbitrary payloads directly. Converting between modes requires a loss report and may require posting a replacement message.

### 10.3 Acknowledgement and lifecycle

Send the initial response within three seconds. Defer slow work early, then update with the chosen output. Interaction tokens expire after fifteen minutes; long-term persistent controls and scheduled messages cannot rely on old tokens. A modal must be the appropriate initial response rather than a deferred reply followed by `showModal`. When deferring a message response, set permitted defer flags only; apply the V2 flag with the subsequent original-response edit. [D3]

Use a shared response helper to prevent double acknowledgements and invalid update/reply transitions. Late processing shows a recoverable message or returns the operation status through a new interaction. Distinguish ephemeral/public output at creation time; do not attempt to change visibility afterward.

### 10.4 Discord limitations and recovery

Use lossless string snowflakes, honor actual rate-limit headers/retry instructions, validate bot permissions and channel overwrites, enforce role hierarchy, and request only necessary intents. Pin supported protocol limits in one verified capability module and validate before any post. [D5–D8]

Where a gateway event cannot be observed because an intent/permission is unavailable, show the resulting feature limitation. Do not invent join attribution, message contents, deleted-message history, or voice participation. Use graceful Unicode/static emoji fallbacks for invalid or inaccessible custom emoji IDs.

If Discord accepts a business action but the response/notification fails, do not repeat the action just to obtain a prettier confirmation. Track both the business state and delivery state. If a network timeout makes message creation ambiguous, reconcile or mark it unknown rather than claiming exactly-once external delivery.

## 11. Message Studio and animation system

### 11.1 One canonical message document

Create a versioned, typed `MessageDocument` shared by the website, API, bot, and workers. Separate its portable design from resource-bound publication state. The document contains output mode, content blocks, allowed tokens, media references, controls, supported actions, visibility, and schema version. Persist immutable versions; published messages point to a version/snapshot.

Use a pure compiler and validator in a browser-safe package. The API performs final resource validation and authorization; the bot/worker executes a validated publication. An attractive client preview is not evidence that a payload is valid or an action is permitted.

### 11.2 Editor capabilities

- Visual block list plus properties inspector, undo/redo, keyboard reordering, duplication, deletion, and useful starter templates.
- V2 container/text/section/media/control editing and a separate traditional embed editor with fields, footer, author, thumbnail, image, and color.
- Desktop/mobile preview widths, light/dark Discord-like preview, example event contexts, and visible placeholder errors.
- Token picker with descriptions and event availability: member/server/channel, level/XP, ticket number, giveaway deadline, results, and other explicit module data.
- Escaped token substitution; missing optional values have a defined fallback. Forbidden or unsupported token contexts are errors.
- Resource pickers use actual guild channels/roles and display missing/deleted references.
- Safe file upload, media library, cropping where relevant, image alt text, and documented size limits.
- Character/component budgets and field-path validation before publishing.
- Draft autosave with conflict handling, named versions, duplication, schema-versioned export/import, and safe rollback to an older design.
- Separate **Save draft**, **Send test**, **Publish**, **Update publication**, and **Archive** actions with their own permissions and outcomes.
- A JSON inspector may show the compiled payload for advanced users. Raw arbitrary JSON never bypasses the canonical validator.

The layout preview reproduces the compiled design as closely as practical; Discord clients can differ in typography/layout. Do not claim pixel-perfect Discord UI rendering. Rank cards exported by the shared image renderer can have exact output parity when renderer/font/assets/input are identical.

### 11.3 Buttons, selects, forms, and actions

Support link navigation, private response, safe channel response, modal/form launch, role add/remove/toggle, ticket creation, voting, crate claim, giveaway entry, and a restricted custom workflow action. Use a reviewed action registry; keep every action's input schema, required capability, effect type, and retry behavior explicit.

Controls use short issued opaque IDs that resolve to persisted control identity, guild, publication version, action definition, expiry policy, and actor restrictions. Do not embed secrets or trust arbitrary guild/action IDs supplied by the client. Durable controls continue working after restarts and after the interaction token expires.

Validate submitted choices against the published snapshot. A member cannot invent a select option, claim another user's record, grant an unmanaged role, or execute a stale action that has been revoked. Role “toggle” must resolve to a persisted desired state for an operation so a delivery retry cannot toggle twice.

For forms longer than the supported modal shape, use a persisted multi-step flow. Bind progress to the actor, apply timeout/cancel rules, validate each step, and recheck final authorization. Never force unsupported controls into a modal payload.

### 11.4 Publication lifecycle

Maintain an inventory of guild/channel/message IDs, template version, state, applied revision, last delivery attempt, and current permissions. Support test posts, initial publication, safe compatible edits, explicit replacement, archive, and reconciliation when a message/channel was removed externally.

Show a diff and loss report when an edit changes output mode or incompatible control meaning. Do not edit live tickets/forms/giveaways into a different creation-time business snapshot accidentally. Deleting or archiving a template with live references requires an explicit reference policy.

### 11.5 Animated JSON icon library

Create a small owned asset collection for the website: spark/mascot, setup success, coin, trophy, ticket, shield, welcome, giveaway, calendar, chart, automation, settings, empty inbox, loading, and error/retry. Keep each icon visually consistent with Lucide and the yellow palette.

The common `AnimatedIcon` wrapper must support:

- `idle`, `hover`, `focus`, `active`, `success`, `error`, and `disabled` states where supplied;
- play once or bounded loop behavior;
- light/dark color variants, static SVG/PNG fallback, and accessible naming;
- reduced motion and user motion preference;
- lazy loading, offscreen suspension, hidden-tab pause, cleanup, and render failure fallback;
- an asset registry with ID, version, license, author/source, dimensions, byte size, and export variants.

Use a single selected player runtime. Validate JSON structure and file budgets, avoid externally referenced assets where possible, and reject untrusted scripts/unsafe links in imported animation/media assets. Animated files are not a reason to bypass the upload policy.

Discord does not run a website Lottie player. For Discord, use valid animated custom/application emojis where supported, exported GIF/static media where appropriate, or Unicode fallback. Preview those exports and validate the SDK emoji object; never pass a website icon name as a fake Discord emoji ID. [D2, D9]

## 12. Complete feature catalogue

The following is the requested target roadmap. IDs `R01–R70` belong to this new product. Do not inherit or map old feature identifiers as a build prerequisite.

**P0:** foundation and complete core product. **P1:** complete general community product. **P2:** advanced expansion. **P3:** provider-dependent extensions. Priorities determine order, not permission to leave P0/P1/P2 as static placeholders. P3 must have honest capability gates and working adapters/tests; live verification depends on actual provider access.

| ID | Priority | Feature | Required result |
| --- | --- | --- | --- |
| R01 | P0 | Public website | Original yellow website, useful demos, real links, feature pages, docs, and status. |
| R02 | P0 | Guided setup | Goal-based presets, dependency checks, diff, test, save, and applied status. |
| R03 | P0 | Account/session system | Real Discord OAuth, secure sessions, logout, preferences, and server selection. |
| R04 | P0 | Access policy | Tenant-safe administrator, delegated staff, member, and global owner capabilities. |
| R05 | P0 | Message Studio | Validated V2/embed design, tokens, controls, preview, tests, and versions. |
| R06 | P0 | Publications | Durable publish/edit/replace/archive inventory with delivery status and recovery. |
| R07 | P0 | Templates | Shared reusable, versioned, importable/exportable message designs. |
| R08 | P0 | Animation/icon library | Owned JSON animations on the web, valid Discord equivalents, reduced motion. |
| R09 | P0 | Message leveling | Eligible-event XP, cooldowns, exclusions, curves, and accurate history. |
| R10 | P0 | XP crates | Scheduled drops, weighted choices, atomic claims, expiry, and preview/test mode. |
| R11 | P0 | Reward roles | Stack/highest policies, hierarchy checks, reconciled desired state, and errors. |
| R12 | P0 | Rank cards | Customizable image design with shared renderer, fonts, and output parity. |
| R13 | P1 | Seasons/leaderboards | Lifetime and seasonal progression with archived results and explicit resets. |
| R14 | P1 | Achievements | Configurable milestones, badges, progress, and idempotent rewards. |
| R15 | P0 | Counting | Turn-safe channel state, clear rules, rewards, failure handling, and persistence. |
| R16 | P0 | Self-service roles | Buttons/selects, exclusive groups, required/blocked roles, and safe expiry. |
| R17 | P1 | Automatic roles | Join, milestone, time-based, or other supported events with documented prerequisites. |
| R18 | P1 | Verification | Rules acknowledgement and configured challenges without impossible security guarantees. |
| R19 | P0 | Welcome | Join greeting, channel/DM/card variants, tokens, and bot permission diagnostics. |
| R20 | P0 | Leave/boost messages | Separate configurable event messages, exclusions, and honest event coverage. |
| R21 | P0 | Tickets | Private channel/thread creation, routing, claim, participants, close, and history. |
| R22 | P0 | Ticket forms | Versioned categories, modal steps, validated answers, and creation snapshots. |
| R23 | P1 | Support workflows | Availability, priority, assignment, reminders, escalation, and staff analytics. |
| R24 | P0 | Transcripts | Private searchable observed history, safe files, retention, and capture status. |
| R25 | P1 | Forms/applications | Draft/publish, role-gated submissions, review stages, decisions, and notifications. |
| R26 | P1 | Moderation | Case-based warns/timeouts/kicks/bans, notes, purges, locks, and scheduled expiry. |
| R27 | P1 | Auto moderation | Explicit rules, exclusions, simulation, observe mode, escalation, and diagnostics. |
| R28 | P1 | Raid guard | Configured join/burst detection, alerts, quarantine, and manual recovery. |
| R29 | P1 | Anti-nuke protection | Audited destructive-event detection, safe response, and best-effort recovery. |
| R30 | P1 | Reports/appeals | Private intake, evidence, reviewer roles, state machine, and auditable decisions. |
| R31 | P0 | Giveaways | Durable creation, qualified entry, secure draw, timers, and rerolls. |
| R32 | P1 | Giveaway claims | Claim windows, winner history, configurable replacements, and notification recovery. |
| R33 | P1 | Polls | Single/multiple choice, eligibility, vote changes, deadlines, results, and manager controls. |
| R34 | P0 | Suggestions | Submission, voting, staff decisions, reason, history, and optional DM. |
| R35 | P0 | Q&A | Questions, staff answer, resolution, and permission-aware knowledge reuse. |
| R36 | P0 | Starboard | Unique reaction votes, thresholds/exclusions, mirrored message lifecycle, and provenance. |
| R37 | P1 | Events/RSVP | Timezone-aware schedules, capacity/waitlist, updates, reminders, and cancellation. |
| R38 | P1 | Birthdays | Opt-in month/day, privacy, timezone, reminders, and optional role expiry. |
| R39 | P1 | Temporary voice | Join-to-create, validated controls, ownership transfer, and safe cleanup. |
| R40 | P1 | Invite tracking | Event-based attribution with ambiguous/unknown states and retained history. |
| R41 | P1 | Invite rewards | Configured eligibility, delayed verified rewards, reversals, and anti-abuse controls. |
| R42 | P0 | Scheduled messages | Durable one-off/recurring publication with timezone, dedupe, and misfire policy. |
| R43 | P0 | Auto replies | Allowlisted conditions, cooldowns, scopes, preview, and loop prevention. |
| R44 | P0 | Sticky messages | Debounced repost, ownership tracking, updates, and channel exclusions. |
| R45 | P1 | Workflow builder | Typed trigger/condition/action steps, dry run, budgets, and durable execution history. |
| R46 | P1 | Custom slash commands | Safe declarative actions, namespace/limit validation, registration diff, and usage logs. |
| R47 | P2 | Social/RSS alerts | Provider adapters, verified source ownership where needed, dedupe, and rate budgets. |
| R48 | P0 | Server analytics | Real member/message/voice/module trends with range, freshness, gaps, and export. |
| R49 | P0 | Audit/event logging | Structured configuration/moderation/module events with scope and retention. |
| R50 | P1 | Configuration backups | Versioned export, protected secrets, restore preview, and resource remapping. |
| R51 | P2 | Economy ledger | Scoped virtual currency with atomic transfers, audit, limits, and reconciliation. |
| R52 | P2 | Daily/work rewards | Persistent eligibility, cooldowns, multipliers, caps, and idempotent claims. |
| R53 | P2 | Shop/inventory | Stock, purchases, unique ownership, consumables, and permission-safe role items. |
| R54 | P2 | Trading/auctions | Escrow, offers, expiry, atomic settlement, recovery, and explicit cancellation. |
| R55 | P2 | Collections/hunting | Collectibles, rarity, collection progress, crafting recipes, and controlled rewards. |
| R56 | P2 | Mini-games | Quiz/trivia and simple interactive games with server-controlled participation/rewards. |
| R57 | P1 | Profiles/storage | Server/global scope distinction, owned designs, privacy, quotas, and usable galleries. |
| R58 | P0 | Product support | Private account support separate from guild tickets, staff workflow, and attachments. |
| R59 | P0 | Owner operations | Real fleet health, scoped grants, job recovery, diagnostics, and maintenance controls. |
| R60 | P1 | Premium/billing | Honest plan capabilities, provider-verified entitlements, history, and sandbox tests. |
| R61 | P2 | Multi-server tools | Explicit opt-in configuration comparison, diffed rollout, and per-server authority. |
| R62 | P0 | Privacy/export | Retention policies, account/server exports, deletion workflow, and access enforcement. |
| R63 | P0 | Localization/accessibility | English/Vietnamese-ready strings, locale/timezone settings, keyboard and mobile usability. |
| R64 | P3 | Music | Licensed/allowed source adapters, voice prerequisites, queue controls, and resource limits. |
| R65 | P3 | AI assistance | Opt-in bounded assistant/summarization with provider disclosure and human-controlled actions. |
| R66 | P1 | Reminders | Personal/server reminders with explicit destinations, recurring rules, and opt-out. |
| R67 | P2 | Virtual lottery | Opt-in virtual-only entries, immutable draw rules, secure settlement, and limits. |
| R68 | P2 | Reputation | Scoped commendations, anti-farming limits, optional badges, and audit. |
| R69 | P2 | Webhook/event adapters | Verified external events, narrow schemas, replay controls, and tenant-specific secrets. |
| R70 | P2 | Public widgets | Opt-in safe leaderboard/status widgets without leaking private server information. |

Adding a feature row never establishes implementation. Maintain actual status as **not started**, **in progress**, **implemented locally**, **provider verified**, or **released**, with evidence and blockers. A marketing page is not a backend completion gate.

## 13. Detailed feature behavior

### 13.1 Levels, cards, achievements, and seasons

Consume only eligible real events. Ignore bots/webhooks and excluded channels/roles. Per-member cooldown and event identity must prevent duplicate XP when a gateway event or worker task repeats. Document whether edits can affect eligibility; do not award again for the same message ID.

Support configurable XP range, base growth/curve, optional role/channel multipliers, capped boosts, maximum level, leveling announcements, and reward-role policy. Curves must be deterministic, monotonic, bounded, and testable. Custom formulas use a safe expression grammar rather than JavaScript evaluation.

Admin grants/removals require explicit capability, reason, bounds, audit, and idempotency. Changing a curve recalculates displayed level from XP under a documented policy; it does not silently destroy stored XP. Preview role reconciliation before bulk changes. Keep lifetime totals distinct from seasonal totals; archive seasons before reset.

Rank cards support background, avatar shape, layout, readable typography, progress bar, badges, and privacy-safe fields. Use the same authoritative image renderer/assets/fonts for website export and Discord attachment. Cache by validated input hash and renderer version. Provide an accessible text summary as well as the image.

Achievements track declared conditions and award once per relevant scope/season. Voice XP is optional and must have supported event observation, AFK/exclusion rules, and a clear participation definition; lack of presence access is not proof of activity.

### 13.2 XP crates

Configure drop channels/fallbacks, weighted crate types, art, XP ranges, duration, claim limits, per-user repeat behavior, drop schedule, exclusions, and messages. A weighted selection must use a validated finite distribution; reject negative/empty/impossible configurations.

Persist drop identity, selected type, publication snapshot, state, expiry, and winners. Claim capacity and user uniqueness are enforced atomically in the database. Claim XP and its record commit in the same transaction. Notifications can retry without granting XP again.

The test mode publishes a clearly labeled zero-reward preview and never changes progression. If a drop cannot be published, show its actual delivery state and apply the configured reschedule/skip policy. Reloading the worker cannot duplicate the same scheduled drop.

### 13.3 Counting

Configure channel, starting value, allowed syntax, turn rule, failure policy, cooldown, milestone rewards, and reset messages. Prefer a simple integer mode first; expression mode uses a safe parser if added.

Serialize each channel's state transition. A source message is accepted once, a member cannot take consecutive turns when disallowed, and only the expected valid value advances the count. Define ordering and late-event behavior. A delayed duplicate cannot reset the channel after a newer accepted event.

Persist current value, previous member, last source event, streak/best, and reward checkpoints. Manual resets require reason/confirmation and preserve history. Rewards use explicit checkpoint identity; replay cannot pay again. Web dashboards can configure or request an authorized reset, but cannot impersonate a member's Discord turn.

### 13.4 Roles, welcome, verification, and birthdays

Role menus support add/remove, mutually exclusive groups, allowed/blocked prerequisites, min/max selections, optional timed access, and readable role colors. Validate managed roles, bot hierarchy, permissions, and deleted references at publish and action time. Do not offer administrator or other privileged roles through an unrestricted public menu.

Autoroles support selected event types with explicit intent prerequisites. Delayed grants and expirations are durable jobs; manually replaced roles must not be reverted by an obsolete expiry. Welcome/leave/boost messages share Message Studio and support channel/DM/card variants with DM-denied handling.

Verification can acknowledge rules, check configured account/member eligibility, or run an opt-in challenge. Explain its limits. Keep unverified users' access intentional through actual channel permissions; a yellow “verified” badge is not an access control.

Birthdays are opt-in; collect month/day and timezone unless more data is necessary. Respect leap-day policy, private/public preference, role duration, and removal requests. Do not infer birthdays or ages from profile names.

### 13.5 Tickets, applications, and staff support

A panel has categories, button/select entry, role access, working hours, routing, creation form, open-ticket limit, channel/thread strategy, and message templates. Persist a versioned creation snapshot so later panel edits do not rewrite an existing ticket's permissions or answers silently.

Use a state machine: `creating -> open -> claimed -> awaiting_member/awaiting_staff -> closing -> closed`, plus explicit failed/reconciliation states. Staff can claim, release, transfer, add/remove permitted participants, rename with validation, set priority, request information, close with a reason, and reopen only where the implemented resource strategy supports it.

Two staff cannot successfully claim the same unclaimed ticket simultaneously. A repeated create request cannot open another business ticket. Discord channel creation may become ambiguous on timeout; reconcile the tracked marker/resource before retrying.

Capture required transcript data before destructive channel cleanup. If capture fails, retain the resource and show a recoverable closure state. Do not label an unobserved or truncated transcript “complete”. Message edits/deletions can be recorded only when actually observed; historical deletion data cannot be reconstructed from nothing.

Transcripts use safe escaped HTML/text, search, attachment metadata, retention, checksums, and fresh authorization at download. Attachment links must not turn private tickets into public object-storage URLs. Staff metrics use actual timestamps and clear definitions for first response, resolution, and reopened cases.

Applications/forms support eligibility, repeated-submission limits, immutable form version, answer validation, review queue, stage/decision/reason, optional role action, and notification retry. A reviewer never receives unrestricted server-management access merely to review a form.

### 13.6 Moderation, reports, and appeals

Create a numbered case for consequential actions with guild, target, actor, rule/source, reason, timestamp, duration, status, and delivery results. Support warnings, timeouts, kicks, bans/unbans, notes, scoped purge, slowmode, and lockdown. Reject impossible targets, owner/hierarchy conflicts, and unsupported durations before acting.

Recheck the moderator and bot's permissions at execution. Long-running jobs do not inherit unlimited authority from their creator. Expiry removes only the still-active punishment instance; it must not undo a newer timeout or manually changed role/lock state.

DM failure does not reverse a successful moderation action. Notification retry does not create another case or punishment. Sensitive evidence and staff notes remain private. Reports and appeals use separate intake/reviewer policies, status transitions, decisions, and auditable links to the original case. A member sees only the records they are entitled to access.

Bulk/destructive actions show affected count/scope and require a deliberate confirm step. The default owner console must not expose arbitrary shell commands, SQL, or unsandboxed “eval”.

### 13.7 Auto moderation, raid guard, and anti-nuke

Begin with explicit deterministic filters: message bursts, duplicate text, excessive mentions, configured keywords, links/invites, attachment rules, caps, and other clearly defined conditions. Support role/channel/member exemptions, cooldowns, escalation windows, and action budgets. Normalize safely without damaging normal multilingual text.

Add a rule tester and observe mode using the same rule engine as runtime. Show exactly which condition matched and what action would occur. Do not punish in a test. Regular expressions require bounds or a safe engine; avoid catastrophic matching on untrusted text.

Raid guard tracks configured join/burst patterns, account eligibility, and trusted roles. Provide temporary protective modes, alerts, staff review, and a restore plan. Anti-nuke uses available events/audit evidence with attribution confidence and delay handling. Unknown attribution is not permission to ban an arbitrary user.

Recovery is best effort: deleted messages and some managed resources cannot be recreated faithfully. State what was protected, what failed, and what staff must restore. Never claim perfect prevention or unrestricted Discord audit access.

### 13.8 Giveaways and virtual lottery

Giveaways include prize, channel, duration/end time, winner count, role/level/account/member-age requirements, optional entry limits, host, messages, claim windows, and reroll policy. Check eligibility at entry and use a documented policy for rechecking at draw/claim. If a required fact is unavailable, pause/reject honestly rather than assume eligibility.

Persist entries, draw snapshot, unique winners, winner order, exclusions, claim state, and all rerolls. Use cryptographically secure randomness and an unbiased selection algorithm. Changing settings must not silently rewrite a live draw's rules; relevant changes require an explicit operation and audit.

An end timer, staff “End now”, and a queue retry must converge on one draw operation. Notification failures cannot reroll winners automatically unless the configured claim/replacement policy calls for it. “View my entry” is private and actor-bound.

Virtual lottery is separate from billing and real-money payments. Use virtual-only currency/items without cash redemption, explicit opt-in, published rules, atomic entry settlement, spending limits, and immutable draw records. Never hide it in a default community preset.

### 13.9 Polls, suggestions, Q&A, and starboard

Polls support single/multiple choices, role eligibility, maximum selections, whether votes can change, result visibility, end time, and manager access. Enforce eligibility on the server, not by hiding buttons. Define “anonymous” honestly; do not promise staff cannot identify votes when identifiable records are stored.

Suggestions have author, content, votes, staff status/reason, discussion link, and optional decision DM. Q&A has question, authorized answer, accepted/resolved state, and useful search without revealing private content.

Starboard counts unique eligible source votes, avoids self/duplicate abuse according to settings, and keeps one mirror per source message. Handle source edits/deletions, removed votes, and missing message content under an explicit policy. Do not attribute a reaction vote to a web request or fabricate deleted-message text.

### 13.10 Events, reminders, and temporary voice

Use server/user IANA timezones, store actual instants in UTC, and display timezone labels. Recurring schedules define daylight-saving, missed-run, and cancellation behavior. RSVP supports capacity, waitlist, role eligibility, reminders, and event updates. A capacity claim is atomic; two requests cannot consume the final slot.

Personal reminders require explicit destination and DM availability. Server reminders require permission for the destination and controlled mention policy. Cancellation stops future effects even if a job is already queued.

Temporary voice rooms track guild/channel/creator/allowed users, requested template, current occupants, and cleanup state. Controls check current ownership and bot permissions. A member cannot redirect a room action at an unrelated channel. Transfer ownership or delete under a defined empty-room policy; do not delete a room occupied during a stale cleanup check.

### 13.11 Invite tracking and rewards

Compare available invite observations around member joins, retain evidence, and represent ambiguous/unknown attribution. Vanity invites, deleted invites, simultaneous joins, and missing permissions must not be forced into a confident inviter identity.

Reward only evidence that satisfies the configured policy, such as member tenure and exclusion of repeat/obvious farming events. Track reward and possible reversal identities. Dashboard editing cannot manufacture eligible invite events. The analytics page should separate confirmed and uncertain joins.

### 13.12 Schedules, auto replies, sticky messages, and workflows

Scheduled messages use immutable template/version references, one-off or supported recurring rules, timezone, destination, missed-run policy, and durable run history. Debounce sticky reposts; keep the current message ID and avoid feedback loops from the bot's own messages.

Auto replies use declarative match rules, cooldowns, exclusions, and fixed allowed actions. Never execute arbitrary uploaded scripts or forward private content to an external provider unexpectedly.

Workflow builder supports typed triggers, conditions, and actions: send allowed message, choose branch, add/remove permitted role, create ticket, or schedule a bounded continuation. Persist each step's state, correlation, actor/context, and retry result. Set limits for actions, recursion, time, mentions, outbound calls, and fan-out. Previews show planned effects without executing them.

A loop between welcome, auto reply, and custom command must be detected or bounded. Re-evaluate feature access and destination permissions before delayed effects. Record partial completion; do not blindly replay successful earlier steps.

### 13.13 Custom slash commands and external integrations

Custom commands are declarative, namespaced, schema-validated, guild-owned, and subject to Discord registration limits. Prevent collisions with core commands and update registrations by diff/hash. A failed registration should show its real state without deleting all working commands.

Use narrow adapters for RSS, YouTube, Twitch, GitHub, voting providers, and other chosen services. Verify official provider APIs, credentials, permitted usage, limits, and event authenticity. Deduplicate events and redact provider secrets. A service card remains unavailable when its credentials or provider approval are missing.

No connector or integration gets arbitrary internal API access. External webhooks map verified source events into explicit tenant-owned operations with bounded payloads and replay policy.

### 13.14 Economy, shop, inventory, trade, and collection games

Build a real virtual-economy ledger, not a mutable frontend balance. Represent currency as integer minor units using safe database types; expose large integers as decimal strings when needed. Define whether each currency/account is global or guild-scoped before implementation; the default new economy is guild-scoped.

Transfers, daily rewards, purchases, crafting, trade settlement, auctions, and refunds are atomic transactions with idempotency, balanced ledger entries, inventory constraints, caps, and audit. Use explicit issuer/sink/system accounts. A request cannot spend the same balance twice or create negative inventory under concurrency.

Shops include item definitions, stock, price, limits, eligibility, and delivery state. If buying a role/item succeeds but Discord role assignment fails, show pending delivery and reconcile or refund according to a documented policy. Do not charge again on retry.

Trades/auctions lock escrowed items/funds and settle once; stale/cancelled offers cannot reclaim assets already transferred. Scheduled auctions recover after restart. Collection/hunting/crafting use defined rarity and recipes, reward/cooldown budgets, progress, and understandable outcomes.

New ledger balances must reconcile before games go live; no old balances are imported by default. Keep virtual balances separate from real billing amounts and entitlements. Game rewards must not affect moderation, privacy, or staff access.

### 13.15 Analytics, logging, backups, and multi-server tools

Track allowed aggregate member/message/voice/module events with source identity, collection coverage, retention, and clear metrics. Retain raw message text only when necessary for an enabled feature and disclosed policy. Dashboard graphs use actual API aggregates and export the same underlying values.

Audit records include actor, tenant/scope, action, relevant before/after summary, outcome, and correlation. Sensitive fields are redacted. Configuration backups are versioned exports with secrets removed; restoring includes validation, preview, resource remapping, and an audited operation. A configuration backup is not a database backup.

Multi-server rollout requires explicit authority for every target. Show per-server diffs and prerequisites; failed authorization on one target cannot leak its configuration. Use per-target outcomes and reversible operations where possible rather than one unbounded all-or-nothing UI claim.

### 13.16 AI and music extensions

These are opt-in provider-dependent features. Build their settings, adapter boundaries, quotas, and honest unavailable states after core systems are complete.

AI assistance may help explain settings, draft safe message copy, summarize explicitly permitted ticket material, or answer a configured knowledge base. Disclose what leaves the service, add per-guild budgets, and treat user/provider text as untrusted. It cannot grant roles, punish members, reveal private tickets, or change settings without ordinary authorization and a deliberate confirmed action.

Music requires supported voice runtime, permitted sources, resource controls, DJ policy, queue/skip/volume controls, and idle cleanup. Use official permitted provider methods. Do not promise extraction from restricted services, unlimited playback, or working live audio without provider verification.

## 14. Command and permission contracts

Keep commands grouped and discoverable. This table describes namespaces; generate exact options and localization from the actual registry and current Discord limits. Do not register dozens of unusable commands for disabled modules.

| Namespace | Typical actions | Default actor boundary |
| --- | --- | --- |
| `/help`, `/status`, `/dashboard`, `/privacy` | Search help, service diagnostics, dashboard link, privacy controls. | Members; diagnostics expose only safe public/session data. |
| `/setup` | Guided checks and dashboard setup link. | Current server owner/admin or explicit setup capability. |
| `/level`, `/leaderboard`, `/profile` | Own/public permitted progression and profile. | Members; admin awards are a separate capability/subcommand. |
| `/crate` | View/claim; manager create/end where configured. | Members for claim; managers for consequential operations. |
| `/ticket` | Open, own status, participant action, staff claim/close. | Actor/participant/staff policy per action. |
| `/form` | Submit, own status, review, publish. | Submitter/reviewer/manager are distinct. |
| `/warn`, `/timeout`, `/kick`, `/ban`, `/case` | Moderation and cases. | Explicit moderation capability plus Discord authority/hierarchy. |
| `/report`, `/appeal` | Private member intake and permitted status. | Members for own requests; reviewers for decisions. |
| `/giveaway` | Entry view, create/end, reroll, claim. | Separate member/manager/host policies. |
| `/poll`, `/suggestion`, `/qna` | Participation and authorized management. | Members for participation; managers for editing/decisions. |
| `/event`, `/remind` | RSVP/reminder and manager event controls. | Own participation; destination/manager checks for publication. |
| `/roles`, `/voice` | Permitted role menu/room controls. | Eligibility and resource ownership rechecked at runtime. |
| `/balance`, `/daily`, `/shop`, `/inventory`, `/trade` | Virtual-economy actions. | Own account/authorized counterparty; admin changes separate. |
| `/custom`, `/automation`, `/message` | Declarative custom actions and message operations. | Configured capability; no arbitrary code execution. |
| `/music`, `/ask` | Provider-gated extensions. | Configured member/DJ/AI policy and quota. |

### 14.1 Access model

Use server-owner/Administrator management as the initial new-product default. Support deliberate delegation such as `tickets.read`, `tickets.manage`, `templates.edit`, `messages.publish`, `moderation.execute`, `analytics.read`, and `config.manage`. `Manage Server` alone is not the default management grant. Broader delegated access must be explicitly configured and auditable.

Keep global capabilities separate: `fleet.read`, `support.read`, `support.reply`, `entitlements.manage`, `maintenance.manage`, and `diagnostics.read`. A guild owner is not automatically a global bot operator. Narrow staff capabilities must not grant access to provider secrets or arbitrary private member records.

An action is allowed only when the current actor, resource tenant, capability, module availability, bot permission, channel overwrite, role hierarchy, and operation context all satisfy policy. UI visibility and slash-command default permission metadata are helpful presentation, not the complete runtime gate. [D5]

### 14.2 Feature and plan gates

Track **configured enabled**, **owner allowed**, **plan entitled**, **prerequisites available**, and **runtime applied** separately. A premium badge cannot replace a backend entitlement check. When entitlement expires, preserve records and explain the transition; do not delete data or secretly reset settings.

### 14.3 Sensitive action UX

Use explicit confirmations for destructive/bulk actions with target, effect, and scope. Normal saves and harmless previews should remain fast. Provide clear reasons for forbidden/missing capability states without leaking the private resource's existence to unrelated actors.

## 15. Architecture and service ownership

### 15.1 Fresh monorepo

Create the following new paths. The table is a target, not a request to copy corresponding directories from the old repository.

| Path | Responsibility |
| --- | --- |
| `apps/web` | Vite/React public site, member portal, server dashboard, owner console. |
| `apps/api` | Fastify HTTP API, OAuth/session/CSRF, access enforcement, reads, mutations, realtime subscriptions. |
| `apps/bot` | Discord Gateway ownership, command registration, event ingestion, interaction routing, timely acknowledgements. |
| `apps/worker` | Durable job execution, outbox delivery, schedules, reconciliation, transcripts, image tasks, provider events. |
| `packages/contracts` | Browser-safe Zod schemas, DTOs, API/event types, error codes, feature configuration. |
| `packages/domain` | Business services and invariants independent of transport/UI. |
| `packages/db` | New Prisma schema, forward migrations, repositories, transaction helpers. |
| `packages/policy` | Explicit guild/member/global capabilities and action authorization. |
| `packages/messages` | Canonical document, pure validation/compiler, mode conversion, action definitions. |
| `packages/ui` | Sparko design tokens, accessible React primitives, shared presentation. |
| `packages/assets` | New asset registry, static/animated icons, mascot, licensed fonts. |
| `packages/rendering` | Safe rank-card/media renderer and renderer version identity. |
| `packages/config` | Server environment validation and shared build/lint conventions. |
| `packages/observability` | Redaction, request/job correlation, structured metrics/log helpers. |
| `tools` | New registration, schema, backup, seed, smoke, and release scripts. |
| `infra` | Container definitions, Compose, reverse proxy, and operational examples. |
| `docs` | Setup, architecture, APIs, progress, traceability, runbooks, and decisions. |

Use feature boundaries within each app/package. Components call typed services; services call routes; routes/Discord handlers call domain services; services transact through repositories and enqueue durable effects. Keep transport-specific errors and provider clients outside pure domain logic.

### 15.2 Process boundaries

Only the bot process initializes Discord Gateway clients and registers commands. Web/API processes do not attach event handlers, award message XP, or start bot schedulers during import/startup. Workers may execute authorized REST delivery effects but do not open duplicate Gateway sessions.

Keep command definitions deterministic and register via an explicit deployment script/diff. Use a development guild for fast iteration when configured; production registration is a separate explicit command. Runtime policy still enforces module state even if a command remains visible.

The web bundle imports browser-safe contracts/UI/compiler code only. It cannot import Prisma, Node filesystem/network APIs, database repositories, provider secrets, or the bot token. Add a build boundary check for this.

### 15.3 Mutation and effect lifecycle

1. Authenticate actor/source and validate input/resource scope.
2. Check module, capability, current revision, and applicable quotas.
3. Claim the operation's idempotency identity in PostgreSQL.
4. In one transaction, apply the business decision and write required outbox records.
5. Return the committed business result plus operation/delivery status.
6. Dispatch the outbox to reconstructable Redis queues.
7. Lease and execute the external effect with bounded retries and fresh prerequisites.
8. Persist success, transient/permanent failure, or ambiguous outcome; reconcile where needed.
9. Emit a scoped event so the dashboard can refresh canonical state.

Network calls must not hold a database transaction open. Use a clear recovery protocol when an external resource must be created before its final ID is known. A queue ID is not the authoritative business deduplication key.

### 15.4 Persistent interaction routing

Persist issued controls and their action snapshots. The bot routes by opaque control ID, validates the published message/context where relevant, checks actor/tenant policy, and executes the domain operation. A revoked/expired control gets an understandable private response and a route to a current panel.

For stateful multi-step flows, persist actor/session/step/version/expiry and final operation identity. Handle cancel, expiry, restart, and concurrent submissions. Ephemeral interaction tokens are response capabilities; keep them short-lived and never use them as durable business identities.

## 16. Data model and consistency rules

Start with a new PostgreSQL schema. Use one controlled forward migration chain. Never import old SQL/JSON stores or old database scripts as the foundation.

### 16.1 Main entities

| Entity group | Representative tables/models | Scope and important constraints |
| --- | --- | --- |
| Identity/session | `users`, `sessions`, `oauth_credentials`, `user_preferences` | Global identity; opaque sessions, expiry/revocation, encrypted provider credentials. |
| Guilds/access | `guilds`, `guild_membership_cache`, `access_grants`, `feature_access` | Guild resources/capabilities; cached observations do not become permanent authority. |
| Configuration | `feature_configs`, `config_revisions`, `presets` | Unique feature per guild, schema version, expected revision, saved/applied state. |
| Messages | `templates`, `template_versions`, `publications`, `issued_controls` | Tenant ownership, immutable versions, persistent control uniqueness and revocation. |
| Operations | `operations`, `idempotency_records`, `source_events`, `outbox_events`, `delivery_attempts` | Scoped dedupe, body hash, durable outcomes, leases/fences, retry metadata. |
| Tickets | `ticket_panels`, `tickets`, `ticket_participants`, `ticket_events`, `transcripts` | Creation snapshot, actor/open-limit rules, exclusive claim, private media references. |
| Forms | `forms`, `form_versions`, `submissions`, `submission_reviews` | Immutable form identity/version, actor eligibility, ordered audited decisions. |
| Progression | `member_progress`, `xp_events`, `seasons`, `role_reward_rules`, `achievement_awards` | Guild/user/season keys; unique source/reward identity. |
| Crates/counting | `crate_drops`, `crate_claims`, `counting_channels`, `counting_turns` | Atomic capacity/turn transition, unique claim/source message. |
| Giveaways/polls | `giveaways`, `giveaway_entries`, `draws`, `winner_claims`, `polls`, `votes` | Unique eligible entry/vote scope, immutable draw result, claim/expiry identity. |
| Community | `suggestions`, `suggestion_votes`, `questions`, `starboard_entries`, `reputation_events` | Guild ownership, unique source/vote/reward identities, privacy policy. |
| Safety | `moderation_cases`, `active_punishments`, `automod_rules`, `incidents`, `reports`, `appeals` | Target/actor/source audit, punishment instance ownership, sensitive evidence access. |
| Time/voice | `events`, `rsvps`, `reminders`, `schedules`, `scheduled_runs`, `voice_rooms`, `birthdays` | UTC instant + IANA zone/local rule, run dedupe, capacity, cleanup ownership. |
| Invites | `invite_observations`, `join_attributions`, `invite_rewards` | Evidence confidence, ambiguity, reward/reversal identity. |
| Economy | `currencies`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `inventory`, `trades`, `auctions` | Declared global/guild scope, atomic balanced amounts, escrow, stock constraints. |
| Content/integrations | `assets`, `integration_accounts`, `provider_events`, `workflow_definitions`, `workflow_runs` | Validated assets, tenant secrets, event dedupe, versioned step state. |
| Product operations | `support_tickets`, `support_messages`, `plans`, `entitlements`, `billing_events`, `audit_logs` | Global support/capabilities distinct from guild staff; provider verification. |

### 16.2 Required database invariants

- Store Discord snowflakes as lossless strings or equivalent numeric storage with string DTOs.
- Put `guild_id` on every guild-owned business/resource relation and enforce tenant identity in queries and relationships. Optional row-level security is defense in depth; it does not replace authorization.
- Use appropriate foreign keys, check constraints, unique keys, and indexed list queries. Validate plans for hot event/leaderboard/queue queries.
- Use database constraints/transactions for claim capacity, ownership, balances, stock, and active state. An in-memory mutex alone is insufficient with multiple processes.
- Keep immutable source events/reward/operation identities for replay protection as required by retention policy.
- Separate creation snapshots from editable module defaults.
- Use UTC timestamps for instants and explicit timezone/local-rule fields for recurrence; avoid storing a displayed date string as the only schedule truth.
- Keep big amounts safe across Node, Prisma, JSON, and React; do not convert through unsafe JavaScript `Number` values.
- Use version/revision checks for changes that can conflict. Do not permit silent last-write-wins on important configuration.
- Public IDs should be opaque and authorized; obscurity alone is not access control.
- Deletion/retention must account for foreign references, pending jobs, assets, audit policy, and exports. Soft archive is not automatic proof that a resource may still execute.

### 16.3 Backup and schema evolution

Provide clean setup, ordered migrations, representative data fixtures, backup, restore, and schema-upgrade rehearsal for the new application's own versions. Run migration tests against disposable databases and preserve applied migration history. Separate development seed fixtures from production initialization.

Once the new product is live, protect its records during upgrades. The from-scratch request applies to this starting codebase; it does not authorize later updates to wipe the new users' records.

## 17. API and realtime contracts

### 17.1 Conventions

Use `/api/v1` as the API prefix. Define request/response schemas and OpenAPI from the actual implementation. The typed frontend service layer consumes these contracts and validates critical response boundaries.

Use bounded cursor pagination, filters, stable sorting, UTC timestamps, lossless IDs, and clear empty results. Consequential mutations include an actor/resource-scoped idempotency key. Store request hash/result: same key and same input returns the original operation; same key with changed input returns conflict.

Configuration writes include `expectedRevision`; reads report `revision` and `appliedRevision`. Distinguish persisted configuration from bot acknowledgement. Use an operation status endpoint for long work rather than holding a browser request indefinitely.

### 17.2 Endpoint families

| Method and route | Required behavior |
| --- | --- |
| `GET /auth/discord` | Start safe user OAuth; generate session-bound single-use state and allowed return route. |
| `GET /auth/discord/callback` | Validate state/redirect, exchange credentials server-side, rotate session, redirect safely. |
| `GET /session`, `GET /me` | Safe identity, capabilities/preferences, CSRF material where appropriate; no credentials. |
| `POST /session/logout` | CSRF-protected logout/revocation and realtime termination. |
| `GET /guilds` | Real current visible/manageable guilds, bot availability, bounded pagination. |
| `GET /guilds/:guildId/overview` | Authorized current overview with honest health and coverage. |
| `GET`, `PUT /guilds/:guildId/features/:featureId/config` | Typed revision-controlled feature settings; explicit unsupported feature errors. |
| `GET /guilds/:guildId/resources/channels`, `/roles` | Authorized validated selectors and permission/hierarchy context. |
| `POST /guilds/:guildId/setup/preview`, `/apply` | Preset diff without effect, then authorized apply operation. |
| `GET`, `POST /guilds/:guildId/templates` | Tenant-owned template discovery/create. |
| `POST /guilds/:guildId/templates/:id/versions` | Create immutable validated version, with conflict checks. |
| `POST /guilds/:guildId/messages/preview`, `/test`, `/publish` | Pure/authorized preview, explicit test, durable production publication. |
| `GET /guilds/:guildId/publications`, `POST /.../:id/update`, `/archive` | Live reference inventory, compatible edit/replacement plan, archive policy. |
| `GET /guilds/:guildId/operations/:id`, `POST /.../:id/retry` | Scoped operation state and authorized safe recovery. |
| `GET`, `POST /guilds/:guildId/tickets` | Staff/member-appropriate list/create; cannot trust client-supplied actor. |
| `POST /guilds/:guildId/tickets/:id/claim`, `/close`, `/participants` | Versioned ticket lifecycle with policy and audit. |
| `GET /guilds/:guildId/tickets/:id/transcripts/:assetId` | Fresh authorized private delivery, bounded/range handling as implemented. |
| `/guilds/:guildId/levels`, `/crates`, `/giveaways`, `/polls`, `/forms`, `/events` | Explicit feature-specific read/action schemas and scope checks. |
| `/guilds/:guildId/moderation`, `/automod`, `/incidents`, `/reports`, `/appeals` | Capability-separated safety operations and sensitive evidence rules. |
| `/guilds/:guildId/economy`, `/inventory`, `/trades`, `/auctions` | Shared ledger/inventory services, idempotent atomic actions. |
| `/guilds/:guildId/analytics`, `/audit`, `/backups`, `/workflows` | Typed ranges, exports, restore previews, versioned durable runs. |
| `/account/preferences`, `/account/privacy`, `/account/support` | Own global account/support data; no guild-admin access shortcut. |
| `/owner/fleet`, `/owner/health`, `/owner/jobs`, `/owner/entitlements` | Explicit global capabilities and audited narrow operations. |
| `/webhooks/:provider` | Verified provider-specific callback with raw-body requirements and replay controls. |
| `/public/status`, `/public/features`, `/public/widgets/:id` | Safe aggregate/opt-in public information only. |

All routes above are relative to `/api/v1`. Choose exact subroute bodies from domain contracts; never expose a generic “execute arbitrary action” endpoint to sidestep feature validation.

### 17.3 Errors and asynchronous results

Use stable safe codes such as `UNAUTHENTICATED`, `FORBIDDEN`, `FEATURE_DISABLED`, `MISSING_PERMISSION`, `INVALID_INPUT`, `REVISION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`, `SERVICE_UNAVAILABLE`, and `DELIVERY_FAILED`. Return a safe message, optional field paths, request/correlation ID, and retry advice when meaningful.

Use appropriate HTTP status codes. Do not return HTTP 200 “success” for a rejected mutation. A committed operation with pending external delivery can return accepted/pending state; the frontend reports that accurately and polls/subscribes until resolved.

Cancelling a read stops waiting where supported. Disconnecting after a business mutation commits does not cancel that mutation. Retrying with a new idempotency key after a client timeout can repeat a business action; preserve the original key until its result is resolved.

### 17.4 Realtime state

Use a single authenticated WebSocket event stream for module updates, job outcomes, ticket changes, and health. Authorize tenant subscriptions, validate Origin, recheck/revoke authority, cap payloads/rates/buffers, and add heartbeat/reconnect handling.

Events carry `eventId`, type, tenant/resource, revision, timestamp, and safe summary. The API remains canonical. On replay gap or reconnection, invalidate queries and refetch; a stale event never overwrites a newer revision. Do not put tokens, transcript content, or private support records in broad broadcasts.

Use REST for writes initially. Provide bounded polling fallback. A browser tab hidden for an hour must resynchronize when visible rather than trusting its old cache.

## 18. Authentication, privacy, and security

### 18.1 Discord OAuth and session design

Use authorization-code user OAuth with minimal `identify` and `guilds` scopes, server-side token exchange, exact configured redirect URI, single-use state, and safe return-route allowlist. Keep installation scopes/permissions separate from user login. Do not request email or privileged scopes without a real purpose. [D7]

Use an opaque, rotated HttpOnly session cookie. In HTTPS production use Secure, appropriate SameSite, and a `__Host-` cookie where compatible. Store session/revocation state and encrypted provider credentials server-side. Keep the CSRF token accessible only in the intended authenticated flow; verify Origin and CSRF for cookie-based mutations.

Never store bot/OAuth secrets or bearer tokens in frontend localStorage, public build variables, screenshots, JSON exports, logs, or repository history. Public client ID/API base URL may be browser configuration; client secret, bot token, signing/storage keys, and payment secrets may not.

### 18.2 Current authority

Authenticate server membership/management rights with a bounded fresh authority policy. Logout, role removal, bot removal, and revoked access must take effect within a documented window. Sensitive writes fail closed when authority cannot be established. Client-provided guild permissions are never trusted.

Resource queries and downloads enforce both tenant and actor policy. Guessing another guild/ticket/asset ID cannot disclose it. Rate limits and quotas are actor/tenant-aware; one noisy guild should not exhaust the whole service.

### 18.3 Untrusted content and files

Escape output in web previews/transcripts and define mention behavior explicitly. Use conservative `allowed_mentions` by default and require deliberate role/everyone ping permission. Template values and AI/provider text are data, not instructions or executable code.

Upload policy covers allowlisted formats, detected MIME, bytes/dimensions/duration/frame limits, decoded resource budget, malware handling where available, and storage quotas. Sanitize/reject active SVG/HTML and unsafe animation references. Media fetching must block private/internal addresses and unsafe redirect/DNS behavior to prevent SSRF; prefer operator-controlled sources/uploads.

Private transcripts/support files require fresh authorization and bounded download links/routes. Public assets and private media use different locations/policies. Generated HTML must not execute message content.

### 18.4 Provider callbacks and operational secrets

Verify provider-specific signatures/authentication against the official protocol, including exact raw bytes/timestamps where required. Apply event deduplication and narrow schemas before creating internal operations. Do not infer a verified payment from a browser success page.

Validate environment configuration at startup and fail with safe actionable missing-variable names. Redact tokens, cookies, authorization headers, webhook secrets, email/private content where applicable, and signed download URLs. Use separate keys for sessions, token encryption, control signing, and private media; document rotation.

### 18.5 Privacy and retention

Document what each enabled feature observes, stores, shares externally, and retains. Prefer aggregate analytics and short retention for raw data. Never claim zero message-content storage if transcripts/logging/AI actually retain or transmit it.

Implement user/server exports with authorization and privacy filtering, deletion requests with policy/operational processing, opt-out where meaningful, and a clear guild-removal policy. Legal pages are operator-reviewed text describing actual behavior; do not invent an entity, jurisdiction, or certification.

Preserve records for the new product according to the policy. Public widgets and leaderboards require opt-in/privacy controls; product-support conversations remain outside guild-admin access.

## 19. Owner operations and premium

### 19.1 Owner console

Show real service build/version, Discord shard connectivity, heartbeat freshness, queue depth/age, due jobs, retries/dead letters, database/storage health, error rate, request/command latency, and recent incidents. Label metric time windows and collection gaps. CPU/storage values require a real collector; do not substitute sample percentages.

Provide fleet search, server feature grants, usage/quota views, audited maintenance toggles, narrow job retry/reconcile tools, diagnostics, and global product-support queues. Confirm consequential actions and record actor/reason/scope.

Read-only diagnostics should be usable by a narrower capability than privileged maintenance. No browser “terminal”, unrestricted runtime evaluation, arbitrary SQL, or raw secret viewer. Logs are redacted and bounded; a web UI cannot tail unlimited private data.

Maintenance mode separates new public actions from read access and essential cleanup. Explain which operations pause and what happens to due jobs. Do not stop punishment expiry or required consistency tasks inadvertently.

### 19.2 Premium and billing

Define plans from real capability limits rather than arbitrary frontend badges: additional templates/retention/storage, larger automation quotas, richer cosmetics, multi-server tools, or support tiers. Core privacy and safe permission checks are never bypassed by a paid tier.

Use a provider abstraction with selected supported billing provider(s). Verify official availability for the operator's account/region and current terms before choosing a live adapter. Do not assume Stripe/PayPal access or reuse old billing scripts. Build sandbox integration and keep checkout unavailable until the adapter is configured.

Verified provider events control entitlement state. Handle duplicate/out-of-order callbacks, payment failure, cancellation, expiry, refunds, chargeback/revocation policy, and reconciliation. Keep provider payment amounts/currencies separate from virtual-economy units.

Assign a subscription to a guild under explicit user authority. Moving it to another guild must follow an audited bounded policy. Never show mock purchases or revenue as production records. Preserve data when access is downgraded, and show clear feature/retention behavior.

### 19.3 Global support

Give users a private support inbox with categories, status, attachments, and staff replies. Keep support read/reply/fleet/diagnostic capabilities separate. Notification delivery is tracked and does not duplicate replies. A support agent can request a scoped diagnostic export instead of receiving credentials or unrestricted access.

## 20. Reliability and performance

### 20.1 Initial engineering targets

These are targets to measure under documented conditions, not verified production promises. Establish a baseline and report actual results.

| Area | Target and measurement |
| --- | --- |
| Interaction acknowledgement | Internal p95 below one second, always designed to meet Discord's deadline; measure handler receipt to defer/reply. |
| Common API reads | Aim for p95 below 300 ms at the agreed load, excluding unavoidable live provider calls; report environment/data size. |
| Config save | Immediate committed result where possible, with separate pending/applied delivery status. |
| Public page UX | Aim for good Core Web Vitals on representative mobile hardware; measure the production build. |
| First-time setup | Common module setup under three minutes excluding user authorization/provider prerequisites. |
| Web assets | Code-split heavy designers/charts; set measured animation/image/font budgets and lazy-load optional modules. |
| Query scalability | Bounded lists and indexed hot paths; test realistic guild/member/event sizes before broad deployment. |
| Queue recovery | Due work reconstructs from PostgreSQL after Redis loss/restart without duplicate business rewards/actions. |
| Accessibility | Key flows work with keyboard and screen reader semantics; verify contrast/focus and mobile targets. |

Do not promise a specific supported server count without load and sharding tests. Keep public uptime derived from actual monitoring; a process being alive is not proof the bot is connected.

### 20.2 Failure behavior

- **Discord unavailable:** save permissible settings, show runtime/delivery lag, honor retries; do not fabricate published messages.
- **Redis unavailable:** durable outbox remains in PostgreSQL; API actions follow documented availability policy; workers resume/reconstruct.
- **Database unavailable:** fail mutations closed with a safe error; do not acknowledge a reward as granted from memory.
- **Gateway disconnect:** let the SDK reconnect/resume; monitor heartbeat/shard health and avoid starting duplicate ingestion owners.
- **Permission removed:** classify the operation as blocked/permanent where appropriate; explain the required permission and preserve business state.
- **External effect timeout:** mark ambiguous delivery and reconcile before repeating non-idempotent effects.
- **Worker crash:** reclaim expired leases/fences and continue from persisted step/result.
- **Disk/storage full:** reject unsafe writes, retain required resources, alert operators, and avoid false transcript completeness.
- **Session/access revoked:** reject subsequent writes/downloads and terminate scoped realtime streams.

Use bounded exponential backoff with jitter where permitted, obey provider retry instructions, distinguish transient/permanent errors, and avoid retry storms. Implement dead-letter/reconciliation tools and correlated logs.

### 20.3 Graceful shutdown and resource ownership

Stop accepting new work, finish or release leases safely, flush buffered observations, close Gateway/database/queue connections, and exit within a documented deadline. Give the orchestrator sufficient termination grace. Job ownership uses leases/fencing; wall-clock timer existence is not proof of exclusive ownership.

Retain enough observation/source identity for restart recovery, with privacy-aware retention. Never claim every external effect is exactly once; guarantee internal business invariants and expose delivery uncertainty honestly.

## 21. Existing domain and deployment

### 21.1 Same-origin production plan

Use `https://panel.coin-sprite.com/` as the initial canonical origin. The reverse proxy routes:

| Public path | Target |
| --- | --- |
| `/api/v1/*` | Fastify API. |
| `/ws/events` | Authenticated API WebSocket upgrade. |
| `/assets/*` | Versioned public web assets or separately controlled validated public media, according to the selected deployment. |
| Public/dashboard/member routes | Vite production assets with correct SPA fallback; public prerendered pages where generated. |
| Private transcript/support assets | Authorized API download routes; never a public static-file directory. |

Do not route API errors into `index.html`, cache private responses publicly, or expose PostgreSQL/Redis to the public internet. Preserve real 404s for missing assets. Configure HTTPS, secure cookies, trusted proxy settings, appropriate CSP/headers, compression, limits, and hashed immutable asset caching.

Register the exact OAuth redirect:

```text
https://panel.coin-sprite.com/api/v1/auth/discord/callback
```

For local development, use an explicitly registered local callback and a Vite `/api/v1`/WebSocket proxy to Fastify. Production SPA hosting does not create the reverse proxy automatically.

### 21.2 New environment template

Provide a real `.env.example` with placeholders only and service-specific documentation. At minimum define these concepts; exact variable names must match actual code:

| Setting | Exposure and purpose |
| --- | --- |
| `NODE_ENV`, `APP_VERSION` | Runtime mode and release identity. |
| `PUBLIC_APP_URL` | Canonical origin; server validation/links. |
| `VITE_API_BASE_URL` | Public frontend setting, normally `/api/v1`. |
| `DISCORD_CLIENT_ID` | Public application identity; server/installation configuration. |
| `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN` | Server-only Discord credentials. |
| `DISCORD_REDIRECT_URI` | Exact registered OAuth callback. |
| `DISCORD_TEST_GUILD_ID` | Optional authorized development/test server. |
| `DATABASE_URL`, `REDIS_URL` | Private service connections. |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | Independent server-only secrets with documented formats/rotation. |
| `CONTROL_SIGNING_KEYS`, `CONTROL_ACTIVE_KEY_ID` | Restart-safe issued-control signing/key rotation if the implementation uses signatures. |
| `ALLOWED_ORIGINS`, `TRUST_PROXY` | Narrow browser/proxy policy, not wildcard credentials configuration. |
| `OWNER_USER_IDS` | Bootstrap explicit owner identity; ongoing capabilities still audited. |
| Storage/media settings | Private/public location, credentials, quota, retention, and URL policy. |
| Billing/provider settings | Server-only configured adapter keys and verified webhook secrets. |
| AI/music/social settings | Optional provider keys/limits; absence disables the relevant integration honestly. |
| Test connection settings | Disposable `TEST_DATABASE_URL`/`TEST_REDIS_URL`; never fall back to production. |

Validate formats and required variables per process. Do not force an unconfigured music/AI adapter to prevent the core API from starting. Never put secrets under the `VITE_` prefix.

### 21.3 New scripts and release procedure

Write fresh scripts for install, dev:web, dev:api, dev:bot, dev:worker, typecheck, lint, format check, build, unit tests, integration tests, browser tests, database migration/seed, command registration, backup/restore, health smoke, and production service startup. README examples must run as written.

Use multi-stage non-root containers, health checks, pinned base/runtime versions, restart/backoff policy, resource limits, and persistent storage. Keep API/bot/workers separately scalable. Define shard ownership before adding bot replicas.

Provide the DNS/TLS/origin checklist for the existing domain after its hosting provider is established. Prepare staging and a controlled final switch. Do not infer deployment credentials or replace the live site just because this new source repository is selected.

Release sequence: review source -> passing checks -> production build/images -> clean staging schema -> environment validation -> registered application settings -> authorized test server smoke -> staging browser/provider smoke -> domain cutover under deployment authorization -> live health verification -> documented rollback.

Rollback switches application artifacts/configuration and follows the new schema compatibility plan; it does not blindly delete new records. Record the deployed commit, schema version, asset/renderer versions, and service health.

## 22. Milestones and continuation

Build all required P0/P1/P2 features in ordered milestones. The first milestone is a starting point, not the complete deliverable. If work spans sessions, keep the checklist, current commit, schema version, blocked provider steps, last passing checks, and next concrete action in `docs/progress.md`.

| Milestone | Implemented scope | Exit gate |
| --- | --- | --- |
| M0 — Fresh foundation | Verify new repository, new monorepo, strict TS, contracts, new DB schema, service boundaries, yellow primitives, environment/CI/local scripts. | Clean install/typecheck/build and first migrations work; no old application code dependency. |
| M1 — Identity and first complete workflow | OAuth/session/CSRF, server picker/access, setup, ticket configuration, message preview, durable publish, real ticket creation, dashboard record. | Browser/API/bot/worker slice works locally; live Discord behavior separately verified when credentials/server are available. |
| M2 — Message platform | Full Studio, V2/embed compiler, tokens, owned animation assets, templates/versions, publications, persistent controls/forms, private assets. | Valid representative payloads and restart-safe interactions; edit/replacement/permission failures behave correctly. |
| M3 — Core engagement/community | Levels/cards/role rewards/crates/counting, welcome/leave/boost, role menus, suggestions/Q&A/starboard, giveaways, real analytics. | UI+API+Gateway/job persistence tested together; no duplicate rewards or draws. |
| M4 — Safety/support expansion | Complete tickets/transcripts/staff workflow, forms/applications, moderation, automod/raid/anti-nuke, reports/appeals, verification. | Privacy, hierarchy, case lifecycle, capture failure, observation limits, and concurrency gates pass. |
| M5 — Time/automation | Polls/events/reminders/birthdays/temp voice, invites/rewards, schedules/replies/sticky, workflow builder/custom commands. | Timezone/misfire/restart/cancellation, source authenticity, and action budgets verified. |
| M6 — Accounts/owner/commercial | Profiles/storage/privacy/export, global support, real owner metrics/operations, entitlements and billing adapter. | Global/guild boundaries pass; sandbox commercial state verified or visibly blocked on exact provider prerequisites. |
| M7 — Advanced community/economy | Seasons/achievements, virtual ledger/shop/inventory/trade/auctions/collection/games/lottery/reputation, multi-server tools/public widgets. | Atomic settlement, scope, escrow, fairness, privacy, and complete member/staff UX pass. |
| M8 — Provider extensions | Social alerts/webhooks, optional music/AI, adapter configuration and quotas. | Validated adapters/tests; live access constraints reported without fake success. |
| M9 — Release and polish | Full public site/docs, mobile/accessibility/localization, performance/load/recovery, containers/proxy/domain, release runbooks. | Fresh setup and complete acceptance matrix pass; deployment is reviewable and ready for authorized cutover. |

### 22.1 Per-milestone delivery contract

For each milestone, provide working source and a short report containing:

- concrete user-visible behavior delivered;
- completed feature IDs with frontend/API/domain/Discord/worker coverage;
- meaningful checks run and their results;
- clean environment/setup/schema steps;
- local versus live Discord/provider evidence;
- remaining blockers and exact missing credentials/configuration;
- a short reproducible manual smoke procedure;
- updated progress/traceability/decision records.

Do not replace the implementation with a long explanation. Routine checkpoints do not require the user to repeatedly say “continue”. Finish independent work when provider access is blocked. Do not present P1/P2 as complete merely because navigation is present.

### 22.2 Cross-feature consistency

All modules reuse the same session, policy, resource pickers, Message Studio, media pipeline, operation status, error language, timezone helpers, and owner diagnostics. Avoid implementing a separate permission system or incompatible duration field in each feature.

Feature completion must include integration with these shared systems. A domain function without a route/handler/UI is not a completed product feature; a rendered form without persistence is not either.

## 23. Testing and acceptance

### 23.1 Required checks

Provide and run actual root scripts for `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm test:e2e`. Integration tests use explicitly disposable PostgreSQL/Redis services. Test startup must reject production connection targets and must not silently fall back to `DATABASE_URL`.

Use focused tests for pure compiler/rules, domain invariants, access/session routes, job recovery, and user workflows. Add browser tests for representative important journeys, not brittle snapshots of every icon. Inspect rendered pages and real production builds at mobile/tablet/desktop widths. Automated accessibility tools supplement keyboard/manual review.

### 23.2 Acceptance matrix

| Scenario | Required result |
| --- | --- |
| Fresh repository install | One documented install; all source is new; environment validation; schema/build/tests run as written. |
| OAuth login/logout | Valid flow works; wrong/replayed state/return URL rejected; logout revokes session/streams. |
| Tenant isolation | Guild A cannot read/change/download Guild B's records by guessing IDs. |
| Member access | Member endpoints reveal only own/public permitted data; no config or staff-record bypass. |
| Delegated staff | Narrow ticket/template/analytics capability allows its actions and denies unrelated/global access. |
| Guild authority change | Lost role/admin access invalidates consequential requests within the documented freshness window. |
| Owner authority | Global owner capabilities are separate from guild admin and are audited. |
| Configuration conflict | Two editors use one revision; the stale save gets conflict with local edits retained. |
| Save versus apply | Bot offline shows saved/pending; reconnect shows actual applied revision. |
| Idempotency | Same actor/scope/key/body returns the original operation; changed body conflicts. |
| V2/embed output | Valid modes post; incompatible fields/mode edits reject with useful paths/loss report. |
| Persistent controls | Ticket/role/crate/giveaway controls survive restart, resist forged values, and enforce actor/tenant. |
| Interaction timing | Slow work defers promptly; modal and follow-up transitions remain valid. |
| Emoji/media | Invalid IDs and failed animations fall back; unsafe/oversized media rejects. |
| Ticket creation/claim | Duplicate creation and concurrent claim preserve the business invariant; ambiguous channel outcome reconciles. |
| Ticket close/capture | Required capture failure retains resource; private downloads recheck access; history gaps labeled. |
| XP/crate/counting | Replayed/concurrent events do not double-reward; cooldown/turn/capacity rules hold. |
| Giveaway draw/claim | Timer/manual/retry converge on one draw; claim expiry and rerolls preserve winner history. |
| Moderation expiry | An old expiry cannot undo a newer punishment or overwrite staff changes. |
| Automod testing | Simulator/observe mode applies no punishment; runtime exclusions and action budgets enforce. |
| Invite attribution | Ambiguous/unsupported joins stay unknown and cannot create unjustified rewards. |
| Schedule/timezone | DST, missed runs, restart, cancellation, and repeated jobs follow the declared policy. |
| Economy/trade | Concurrent spend/claim/settlement cannot create money/items or negative stock; ledger reconciles. |
| Provider callback | Forged/replayed/duplicate/out-of-order events are rejected or handled idempotently. |
| Billing | Browser redirects cannot grant paid access; verified sandbox events update correct scoped entitlement. |
| Redis/worker restart | Outbox/steps recover from DB without repeating completed business effects. |
| External timeout | Unknown delivery is visible and reconciled; no false exactly-once claim. |
| Privacy/export/deletion | Only authorized records included; sensitive assets expire/retain according to documented policy. |
| Mobile/keyboard | Setup, save, ticket claim/close, Studio, and menus usable without hover or pointer-only steps. |
| Analytics/status | No-data/gap/offline differ; totals/date ranges match exported underlying data. |
| Clean production deploy | API/SPA/WebSocket routes, HTTPS/cookies, private assets, health, and graceful shutdown work. |

### 23.3 Feature traceability

For every `Rxx` row, record:

```text
Feature ID | Priority | UI routes | API schemas/routes | Domain services |
Discord commands/events/controls | Worker jobs | DB models |
Policy/permissions/intents | Unit/integration/browser checks |
Live provider evidence | Docs | Actual status | Blockers
```

Use stable filenames/links where practical. A test report must identify the tested commit/environment. Tests copied from the old codebase are not the fresh implementation's verification; write fixtures around the new contracts.

### 23.4 Live verification boundaries

Only mark Discord delivery/provider activity verified after observing the actual action in an authorized test environment. Local SDK mocks, rendered previews, and unit tests are valuable but prove different things. If credentials are unavailable, finish implementation/tests and list the exact manual steps remaining.

Separate release-readiness from production-deployed state. Do not print or request secrets in chat; use the environment's approved credential/configuration flow.

## 24. Examples and implementation contracts

These examples illustrate the required semantics. Implement/export the actual schemas and make docs/examples compile or validate against them. Values are fictional demonstration data; no sample should appear as production activity.

### 24.1 Example V2 message

```json
{
  "flags": 32768,
  "allowed_mentions": { "parse": [] },
  "components": [
    {
      "type": 17,
      "accent_color": 16436245,
      "components": [
        { "type": 10, "content": "## Welcome to Sparko Support" },
        {
          "type": 10,
          "content": "Choose a topic. Your request will be visible only to the permitted support participants."
        },
        { "type": 14, "divider": true, "spacing": 1 },
        {
          "type": 1,
          "components": [
            {
              "type": 2,
              "style": 1,
              "label": "Open a ticket",
              "custom_id": "spk:ctl:demo-support-create",
              "emoji": { "name": "🎫" }
            },
            {
              "type": 2,
              "style": 5,
              "label": "Dashboard",
              "url": "https://panel.coin-sprite.com/dashboard"
            }
          ]
        }
      ]
    }
  ]
}
```

`16436245` is the integer value of `#FACC15`. The demonstration control ID must be replaced by a persisted server-issued identity before publication. It carries no authorization by itself. This payload intentionally contains no traditional embed or content field. Check the installed SDK's matching builders and the current protocol before sending. [D1, D2]

### 24.2 Separate embed-mode message

```json
{
  "allowed_mentions": { "parse": [] },
  "embeds": [
    {
      "title": "Your giveaway entry is saved",
      "description": "Use View my entry to check your current eligibility and status.",
      "color": 16436245,
      "footer": { "text": "Sparko • Demonstration" }
    }
  ],
  "components": [
    {
      "type": 1,
      "components": [
        {
          "type": 2,
          "style": 2,
          "label": "View my entry",
          "custom_id": "spk:ctl:demo-entry-view"
        }
      ]
    }
  ]
}
```

There is no V2 flag. Runtime supplies the issued control identity and private response policy. Do not reuse the text until the actual entry operation succeeded. Validate embed/legacy control limits using the selected SDK.

### 24.3 Configuration save request

```json
{
  "expectedRevision": 7,
  "config": {
    "enabled": true,
    "timezone": "Asia/Ho_Chi_Minh",
    "maxOpenPerMember": 1,
    "requireTranscriptBeforeCleanup": true,
    "staffRoleIds": ["123456789012345678"],
    "panelTemplateVersionId": "tmplver_demo_01"
  }
}
```

Send to the actual ticket configuration route with session credentials, CSRF, and a stable idempotency key. Server validation checks real guild ownership, roles, template/version, and policy. A client cannot grant itself staff access using this body.

### 24.4 Committed save with pending runtime

```json
{
  "data": {
    "featureId": "tickets",
    "revision": 8,
    "appliedRevision": 7
  },
  "operation": {
    "id": "op_demo_01",
    "businessStatus": "committed",
    "deliveryStatus": "pending"
  },
  "requestId": "req_demo_01"
}
```

UI wording: **“Settings saved. Waiting for the bot to apply them.”** After canonical status confirms delivery/application, show **“Applied.”** Publishing a Discord message uses its own operation and cannot be inferred from saving settings.

### 24.5 Safe conflict response

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "These settings changed since you opened them.",
    "currentRevision": 9,
    "fieldErrors": [],
    "retryable": false
  },
  "requestId": "req_demo_02"
}
```

Return HTTP 409. Keep the user's draft and offer to review/reload the newer version. Do not overwrite it automatically.

### 24.6 New script contract

Implement working scripts with these meanings; match README commands to actual service ports/configuration:

```text
pnpm install --frozen-lockfile   Install the selected locked dependencies.
pnpm dev                       Start the documented local app setup.
pnpm dev:web                   Start Vite only.
pnpm dev:api                   Start Fastify only.
pnpm dev:bot                   Start the Discord Gateway bot only.
pnpm dev:worker                Start durable workers only.
pnpm db:migrate                Apply new-product schema migrations.
pnpm db:seed                   Seed explicit development examples only.
pnpm discord:register          Register validated commands explicitly.
pnpm typecheck                 Check strict TypeScript package boundaries.
pnpm lint                      Run configured lint rules.
pnpm format:check              Check formatting.
pnpm test                      Run meaningful fast behavior suites.
pnpm test:integration          Run against disposable PostgreSQL/Redis.
pnpm test:e2e                  Run browser/API journeys with controlled data.
pnpm build                     Build all required production packages/apps.
pnpm backup                    Create an engine-supported backup.
pnpm restore:verify            Restore into a disposable target and verify.
pnpm smoke                     Check the configured staging/local service health.
```

In a first-ever scaffold, generate and commit the lockfile before asking the operator to use `--frozen-lockfile`. A script must not be a placeholder that prints “done” instead of performing its documented action.

### 24.7 Required product language

Prefer concise outcomes and next actions:

| State | Example wording |
| --- | --- |
| Missing role hierarchy | “Move Sparko's role above Member Rewards, then try again.” |
| Feature off | “Welcome messages are off. Finish setup and enable them to start posting.” |
| Publication failed | “Your design is saved. Sparko couldn't post in this channel; check Send Messages.” |
| Claim already processed | “You already claimed this crate.” |
| Private control mismatch | “This view belongs to another member. Open your own view.” |
| No collection | “Message analytics are not being collected for this period.” |
| Provider not configured | “Connect a billing provider before enabling checkout.” |
| Transcript incomplete | “Some history was unavailable. The ticket channel has been retained.” |

Avoid stack traces and internal database vocabulary in ordinary member flows. Technical diagnostics belong in an authorized owner view and logs.

## 25. Deliverables and definition of done

The finished implementation must include:

1. New repository source with the described web/API/bot/worker architecture and strict typing.
2. Fresh accessible yellow UI, public website, member area, server dashboards, and owner console.
3. Real typed API services and database persistence for every implemented feature; no production MSW/demo fallback.
4. Shared V2/embed compiler, Message Studio, versioned templates/publications, durable controls, and media/animation handling.
5. Complete P0/P1/P2 feature workflows, with P3 capability/provider status explicit.
6. New schema/migrations, transaction/ledger invariants, durable operations/outbox/jobs, and clean startup.
7. Real OAuth/access/session/privacy systems and narrow global owner/support capabilities.
8. New runnable install/development/build/test/registration/schema/backup/deployment scripts and a single lockfile.
9. Meaningful automated tests, rendered UI inspection, and separately labeled live Discord/provider smoke evidence.
10. Complete README/environment template, architecture/API docs, feature guides, traceability/progress/decisions, and operational runbooks.
11. Containers and same-origin deployment configuration prepared for `panel.coin-sprite.com`, with health/recovery/rollback.
12. An honest final release report stating what works, what was verified, what remains provider-blocked, and the exact operator steps.

### Final checklist

- [ ] Target is `Huy1234secret/Sparko`; old repositories are not source dependencies.
- [ ] All custom application code and scripts are newly written for this architecture.
- [ ] Clean database setup works; no legacy import/compatibility prerequisite was introduced.
- [ ] The real website and bot use the same backend/domain/contracts and policy.
- [ ] Yellow brand, light/dark theme, responsive layout, and motion preferences are coherent.
- [ ] V2 and embed messages use separate valid modes; animations use supported surfaces.
- [ ] Important actions survive restart, deduplicate, and enforce current authority.
- [ ] Every module's UI accurately reflects persisted/running/delivery/blocked state.
- [ ] Analytics, status, billing, and owner views use real data or honest unavailable states.
- [ ] Required feature traceability and checks are complete with actual evidence.
- [ ] Existing domain deployment is prepared; production changes occur only within the requested deployment scope.
- [ ] No old framework, runtime, lockfile, or hidden compatibility subsystem was retained as an implementation crutch.

**Completion means a working new product, not a static website attached to a half-finished bot.**

## 26. Sources and limits of verification

Research/connected-repository inspection occurred on 10 October 2026. Official specifications and package support can change; the coding agent must recheck the chosen release before implementation. Product targets and architecture choices in this brief are proposals, not claims that Sparko already implements them.

### Official Discord references

- **D1:** [Components overview](https://docs.discord.com/developers/components/overview) — explicit V2 opt-in and separate traditional behavior.
- **D2:** [Component reference](https://docs.discord.com/developers/components/reference) — payload modes, component rules, custom IDs, attachments, and supported types.
- **D3:** [Receiving/responding to interactions](https://docs.discord.com/developers/interactions/receiving-and-responding) — acknowledgement deadline, token lifetime, response/defer/modal semantics.
- **D4:** [discord.js documentation](https://discord.js.org/docs/packages/discord.js/main) — consult the stable version selected for the build; the linked main branch is not a production version pin.
- **D5:** [Discord permissions](https://docs.discord.com/developers/topics/permissions) — current permissions/hierarchy/overwrites.
- **D6:** [Discord Gateway](https://docs.discord.com/developers/events/gateway) — event, intent, connection, and sharding behavior.
- **D7:** [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2) — supported flows, scopes, installation, and token exchange.
- **D8:** [Discord rate limits](https://docs.discord.com/developers/topics/rate-limits) — provider-directed retry behavior.
- **D9:** [Discord emoji resource](https://docs.discord.com/developers/resources/emoji) — real emoji objects and application/guild resources.

### Official model and web-library references

- **O1:** [GPT-6.1 Sol model page](https://developers.openai.com/api/docs/models/gpt-6.1-sol) — direct API model/effort/tool support.
- **O2:** [GPT-6 family prompting guidance](https://developers.openai.com/api/docs/guides/latest-model) — explicit scope, initiative, continuation, and validation; adapt to the chosen model/workload.
- **O3:** [Client model settings](https://learn.chatgpt.com/docs/models) — client Max/Ultra behavior; it does not establish Antigravity support.
- **W1:** [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview) — server-state responsibilities.

### Competitor's own public material

- **A1:** [Arclo website](https://arclo.gg/) — public product descriptions and example workflows.
- **A2:** [Arclo documentation](https://arclo.gg/docs) — documented product scope and setup organization.
- **A3:** [Arclo custom commands](https://arclo.gg/features/custom-commands) — documented declarative command capability.

These are source descriptions, not independent benchmarks. No Arclo/Sparko performance comparison or authenticated competitor dashboard audit was performed.

### Connected repository background

- **G1:** [Old product README](https://github.com/Huy1234secret/CoinSprite/blob/main/README.md) — sampled opening sections, identity and documented runtime.
- **G2:** [Old root manifest](https://github.com/Huy1234secret/CoinSprite/blob/main/package.json) — existing package identity/dependency/script context.
- **G3:** [Old web manifest](https://github.com/Huy1234secret/CoinSprite/blob/main/apps/web/package.json) — existing Next-based web context, not a new-build dependency.
- **G4:** [Old handoff](https://github.com/Huy1234secret/CoinSprite/blob/main/docs/handoff.md) — sampled integration/readiness/instruction context; described checks were not rerun here.
- **G5:** [Old traceability](https://github.com/Huy1234secret/CoinSprite/blob/main/docs/feature-traceability.md) — sampled old roadmap/readiness context; not inherited feature IDs.
- **G6:** [Previous plan](https://github.com/Huy1234secret/CoinSprite/blob/main/SPARKO_ANTIGRAVITY_MASTER_PLAN.md) — historical identity/competitor context; superseded by the user's fresh-build clarification.
- **G7:** [Old project Discord skill](https://github.com/Huy1234secret/CoinSprite/blob/main/skills/sparko-discord-development/SKILL.md) — platform workflow context; old stack/code-preservation instructions are not this build's requirements.
- **G8:** [New Sparko repository](https://github.com/Huy1234secret/Sparko) — explicitly selected target; root/default-branch metadata inspected.

No repository source code was executed, no bot was deployed, no live Discord messages/payments were sent, and no old repository was deleted while preparing this specification. The new coding task begins from this document in the selected fresh repository.
