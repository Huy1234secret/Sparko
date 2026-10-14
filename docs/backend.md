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

| Stage | What                                                                                                                                              | State                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| B1    | Database, sign-ins that survive restarts, overview, setup checklist, health, every module's on/off, channels and permission checks, the job queue | Merged ([PR #25](https://github.com/Huy1234secret/Sparko/pull/25)) |
| B2    | Welcome: settings, templates and versions saved; the bot greets new members                                                                       | Next                                                               |
| B3    | Tickets: the panel is posted, tickets open as private threads, staff work them from the dashboard                                                 | Later                                                              |
| B4    | Message Studio: publish and edit messages, templates, versions, Components V2, editing in the preview                                             | Later                                                              |

Modules without their own settings page yet can be switched on and off; what they do in Discord is built as each area's pages are.

## Data and backups

- The file is `.data/sparko.db` in the app folder (or `DATABASE_PATH`). It's ignored by git, so updates keep it.
- Back it up with `sqlite3 /opt/sparko/app/.data/sparko.db ".backup /opt/sparko/shared/sparko-backup.db"`, or stop both processes and copy the file.
- Sign-ins are stored hashed, with the Discord access token encrypted using the app's client secret. Changing the secret signs everyone out.

## Welcome

- The dashboard reads and saves Welcome at `/api/v1/servers/:id/welcome`; settings are checked (delivery, channel, lengths, colour) and only known fields are stored.
- After a save the bot checks it can post in the chosen channel and explains what's missing if not. "Check again" re-queues the change (`POST …/modules/welcome/apply`).
- When someone joins, the bot sends the message with `{user}`, `{server}` and `{member_count}` filled in. Only the new member can be pinged. With "Welcome people who rejoin" off, people who joined before aren't greeted again.
- Discord only tells bots about new members with the **Server Members Intent** on (Developer Portal → your app → Bot → Privileged Gateway Intents). Without it the bot still runs, and saving Welcome says what to turn on.

## Tickets

- Saving Tickets (`PUT /api/v1/servers/:id/tickets`) checks the panel (channel, title, 1–5 buttons, staff role ids, auto-close) and queues a job; the bot posts the panel with its buttons, edits it in place on later saves, posts it again if someone deleted it, and removes it when Tickets is turned off.
- Pressing a button opens a private thread (`ticket-N`), adds the member, and posts the opener with the button's question, pinging the staff roles if that's on. With "one open ticket per member", a second press points to the open one.
- Messages typed in the thread are kept in the inbox (the member's first message becomes the ticket's subject). Staff can also reply from the dashboard (posted by Sparko as "**Name:** text"); staff notes stay in Sparko.
- Assigning, priority, closing (locks and archives the thread, optionally tells the member by DM), reopening and the HTML transcript all work from the dashboard. Tickets whose member stopped replying are warned two hours before the auto-close time and then closed.
- Staff with Discord's Manage Threads permission see every ticket thread; with "ping these roles" on, the roles are also mentioned (and added) in each new ticket.
- Ticket messages typed in Discord need the **Message Content Intent** (Developer Portal → Bot). Without it the inbox shows that Discord didn't share the text.

## Message Studio

- Two layouts: the **classic** message (text, one embed, link buttons) and **Components V2** (blocks: text with headings, text with an image or button beside it, image galleries, separators and link-button rows, optionally in a box with a coloured bar).
- Both are edited in the live preview: click text to change it in place; in Components V2, hover a block to move or remove it and use + to add blocks. Links and options for the selected block are in the side panel.
- Publishing (`PUT /api/v1/servers/:id/studio`) checks the message the way Discord would (lengths, https links, 6,000-character embeds, 4,000 characters of V2 text, 1–10 gallery images, up to 5 buttons) and queues a job. The bot posts it, then edits the same message on later publishes. Discord can't switch a posted message between layouts, so switching layout posts a new message.
- Mentions are shown but never ping anyone (`allowed_mentions` is empty).
- Templates (`/studio/templates`) are saved per server, up to 100 on Free and 500 on Plus, and can be sorted into folders (`/studio/folders`), 20 on Free and 100 on Plus. Folders can hold folders.
- Templates and folders share one order inside each folder. `POST /studio/library/move` with `{ kind, id, folderId, index }` puts an item at `index` among the other items in `folderId` (`null` is the top level); a folder can't move inside itself.
- `POST /studio/templates/:id/clone` puts the copy right after the original. Deleting a folder deletes everything in it and answers with how many templates and folders went.
- Every publish is kept as a version.
