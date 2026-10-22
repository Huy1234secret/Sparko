# Sparko

**The all-in-one Discord bot that explains itself.** Sparko gives a server tickets, welcome messages, roles, community tools and a visual message editor, all set up from a web dashboard that says what each setting does in plain words.

It's an open alternative to closed bots like MEE6, Dyno and Carl-bot: you can read exactly what Sparko does with your members' data, and run your own copy.

## Features

| Area                    | What it does                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Message Studio**      | Build embeds and Components V2 messages in a live preview: buttons, menus, galleries, variables, templates and JSON import. |
| **Tickets**             | A panel members open private ticket threads from, with an inbox, claiming, priority, staff notes and transcripts.           |
| **Welcome messages**    | Join, leave and boost messages, in a channel or by DM, from Studio templates.                                               |
| **Reaction roles**      | Members pick roles with buttons, menus or reactions.                                                                        |
| **Automatic roles**     | Roles on join, timed roles, and rules based on account age, badges and boosting.                                            |
| **Suggestions**         | `/suggest` with votes, statuses, staff reasons and DMs to the author.                                                       |
| **Questions & answers** | `/question` posts each question with a thread; staff answer with a button and the thread closes when it's answered.         |
| **Starboard**           | Messages with enough stars are reposted to a highlights channel.                                                            |
| **Polls**               | Button or menu votes with live result bars, anonymous and multiple-choice polls, and scheduling.                            |
| **Events & RSVP**       | Events with Going / Maybe / Can't go, capacity and a waitlist, reminder DMs, repeats and Discord event sync.                |
| **Birthdays**           | Members save their birthday; Sparko posts a message and gives a role on the day.                                            |
| **Temporary voice**     | Join-to-create rooms with a control panel and `/voice`: lock, hide, rename, limit, trust, block, transfer and claim.        |
| **Invite tracking**     | Who invited whom, a leaderboard, reward roles and join/leave messages.                                                      |

## How it's built

A TypeScript monorepo (pnpm workspaces), with no Docker, Postgres or Redis to run:

| Folder           | What's in it                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- |
| `apps/bot`       | The Discord bot (discord.js). It applies saved settings, handles commands, buttons and events.  |
| `apps/server`    | The API for the dashboard, Discord sign-in, and the built website.                              |
| `apps/web`       | The website and dashboard (React 19, Vite, React Query).                                        |
| `packages/core`  | What both share: one SQLite database (`node:sqlite`), each module's settings, checks and logic. |
| `design-system/` | Sparko's design tokens, components, icons and UI kits.                                          |
| `infra/`         | Scripts that set up and update the production server.                                           |

The dashboard saves a setting, the API stores it and queues a job, and the bot applies it in Discord and reports back. See [`docs/backend.md`](docs/backend.md) and [`docs/frontend.md`](docs/frontend.md).

## Getting started

Node 24 and pnpm 11 are required.

```sh
pnpm install
pnpm dev        # the website and dashboard with sample data, at http://localhost:5173
```

To run against Discord, create an app at [discord.com/developers](https://discord.com/developers), then start the website and bot with pm2. They read their settings from an env file (`SPARKO_ENV_FILE`, by default `/opt/sparko/shared/.env.production`), never from this repository:

```sh
DISCORD_BOT_TOKEN=…
DISCORD_CLIENT_ID=…
DISCORD_CLIENT_SECRET=…
PUBLIC_APP_URL=http://localhost:8080
```

```sh
pnpm build
pm2 start ecosystem.config.cjs
```

Running it on a server, with HTTPS through Cloudflare, is covered step by step in [`docs/hosting.md`](docs/hosting.md).

## Checks

Every pull request runs the same checks as CI:

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

## Security

Secrets (the bot token, OAuth secret and so on) live only in the server's env file. Discord access tokens are encrypted before they're stored, and the website's contact details are filled in at build time from the same env file. If you find a security problem, please report it privately through the support server linked on the website rather than in a public issue.

## License

Sparko is released under the [MIT License](LICENSE). Third-party assets, such as the animated icons in `design-system/assets/icons`, keep their own licenses.
