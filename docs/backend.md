# Backend

The backend is being rebuilt in stages on top of the new dashboard. Everything runs in two pm2 processes and one database file; there's no Docker, Postgres or Redis.

| Part     | Where           | What it does                                                                                        |
| -------- | --------------- | --------------------------------------------------------------------------------------------------- |
| Database | `packages/core` | One SQLite file (Node's built-in `node:sqlite`), shared by both processes. Migrations run on start. |
| API      | `apps/server`   | Discord sign-in, the dashboard's `/api/v1/…` routes, and the website itself.                        |
| Bot      | `apps/bot`      | Discord gateway: keeps the server list current, reports its latency, applies saved changes.         |

## How a saved change reaches Discord

1. The dashboard saves (for example `PUT /api/v1/servers/:id/modules/levels`).
2. The API stores the setting and a version, writes the activity log, and adds a **job**.
3. The bot checks for jobs every second, applies each one in Discord, and marks it done or records what went wrong in plain words.
4. The dashboard waits on `GET …/modules/:id/apply` and shows Live or the problem. If the bot is offline it says the change is saved and applies when the bot is back.

## Stages

| Stage | What                                                                                                                                              | State   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| B1    | Database, sign-ins that survive restarts, overview, setup checklist, health, every module's on/off, channels and permission checks, the job queue | This PR |
| B2    | Welcome: settings, templates and versions saved; the bot greets new members                                                                       | Next    |
| B3    | Tickets: the panel is posted, tickets open as private threads, staff work them from the dashboard                                                 | Later   |
| B4    | Message Studio: publish and edit messages, templates, versions, Components V2, editing in the preview                                             | Later   |

Modules without their own settings page yet can be switched on and off; what they do in Discord is built as each area's pages are.

## Data and backups

- The file is `.data/sparko.db` in the app folder (or `DATABASE_PATH`). It's ignored by git, so updates keep it.
- Back it up with `sqlite3 /opt/sparko/app/.data/sparko.db ".backup /opt/sparko/shared/sparko-backup.db"`, or stop both processes and copy the file.
- Sign-ins are stored hashed, with the Discord access token encrypted using the app's client secret. Changing the secret signs everyone out.
