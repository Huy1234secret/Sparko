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
- Edit message (`POST /api/v1/servers/:id/studio/edit` with `{ message, link }`) turns a message Sparko already sent into the template, given its Discord message link. The link must be for this server; the bot edits the message in place (it keeps its link) and its buttons and menus then do what the template's do. Discord only lets a bot edit its own messages, and a message can't switch between the classic and V2 layouts.
- Mentions are shown but never ping anyone (`allowed_mentions` is empty).
- Templates (`/studio/templates`) are saved per server, up to 100 on Free and 500 on Plus, and can be sorted into folders (`/studio/folders`), 20 on Free and 100 on Plus. Folders can hold folders.
- Templates and folders share one order inside each folder. `POST /studio/library/move` with `{ kind, id, folderId, index }` puts an item at `index` among the other items in `folderId` (`null` is the top level); a folder can't move inside itself.
- `POST /studio/templates/:id/clone` puts the copy right after the original. Deleting a folder deletes everything in it and answers with how many templates and folders went.
- A message holds up to 10 embeds; their text adds up to Discord's 6,000-character limit. Messages saved before this are read as one embed.
- `POST /studio/test` posts the message as a new message in its channel and keeps it as a version.
- `POST /studio/uploads` takes a PNG, JPEG, GIF or WebP picture of up to 5 MB as the request body and answers with a public link. The bytes decide the type. Files are kept in `MEDIA_DIR` (default: a `media` folder next to the database) and served at `/media/<name>` so Discord can load them.
- `GET /studio/emojis` lists the server's own emojis for the emoji picker.
- Messages have `components`: buttons and menus, laid out as Discord does (up to five buttons in a row, each menu on its own row, at most five rows). Older messages' link buttons are read as link buttons.
- An action button or a menu option runs its actions from top to bottom: **Send message** sends templates (in the channel, in the clicker's DMs, or as a reply only they see) and **Give or take role** changes the clicker's roles. Free servers send 1 template per action, Plus up to 10; the server refuses more.
- Every Studio message the bot posts that has buttons or menus is kept in `studio_posts`, so the bot can find what a click should do. Buttons and menus use custom ids `sp:b:<id>` and `sp:m:<id>`. The bot acknowledges each click straight away and tells the clicker privately if something didn't work, such as a role above Sparko's.
- Components V2 messages are one container: a colour bar, text (`{separator}` becomes a divider), a thumbnail beside the first stretch of text, and an image gallery of up to 10 pictures. `v2.place` says where each button, menu and the gallery sits: after a line of the text (`line: -1` is the top of the container), beside a line (buttons only; Discord shows it as a section with the button on it), or above or below the container. Messages saved with the older part order, or as separate blocks, are read into this shape.
- Text can hold variables in braces: `{user}`, `{user.name}`, `{user.id}`, `{server}`, `{server.members}`, `{channel}`, `{date}` and `{time}` (Discord timestamps, shown in each reader's own format). Sparko fills them when it sends: from the staff member who posted, or from the member who clicked a button. A variable with nothing to fill it is left as written.
- Every post is kept as a version.

## Suggestions

- Settings are saved at `/api/v1/servers/:id/suggestions` (`GET`, `PUT`). The check (`sgIssue` in `packages/core/src/suggestions.ts`) is shared by the dashboard, the API and the bot: channels, role lists, the account age (1d to 1y), auto-close (1mi to 1mt), the cooldown (1h to 1mt), statuses (6 on Free, 20 on Plus, names up to 25 characters, up to 5 actions each), auto-approve and auto-deny (0 to 10,000), lengths (up to 12,000) and the commands' names. Times are written with `mi`, `h`, `d`, `w`, `mt` (30 days) and `y`.
- The message is a Message Studio template (tagged **Suggestion** in Studio) with one embed or container, no pictures and no buttons or menus of its own; with no template picked Sparko uses its Suggestion card. Variables: `{user.suggestion}`, `{suggestion.title}`, `{suggestion.id}`, `{status}`, `{vote.ratio.amount}` (`` `100 | 120 - -20` ``), `{vote.ratio.percent}` (`` `35% | 65% - -15%` ``, adding up to 100), `{upvotes}`, `{downvotes}` and `{files}`. Pictures and videos people attach show in the message. A suggestion too long for one message carries on in more messages, each one embed or container.
- Saving queues a `suggestions` job: the bot checks it can post (and react, and open threads, where that's on) in the channels, and registers the server's own commands with the names picked in Commands (`PUT /applications/:app/guilds/:guild/commands`). Turning Suggestions off removes them.
- `/suggest` opens a form (a title, then one to three boxes for the text, as the longest length needs) and takes up to 3 files. Who can suggest, the blacklisted role, the account age (which the suggest roles can bypass), the cooldown, the pending limit, the lengths, duplicates and the storage limit are checked when it's sent; a refusal is only shown to the member and is logged.
- With a review channel, new suggestions go there first with **Post it** and **Reject** for staff who can approve. Rejecting asks for a reason and never posts it.
- Votes are reactions, buttons (`sg:up`, `sg:down`) or a menu (`sg:vote`), kept in `sg_votes`. Changing votes, voting on your own suggestion, auto-approve and auto-deny follow the settings; refused reactions are taken off. Message edits after votes are batched so a busy suggestion doesn't hit Discord's limits.
- `/suggestion-status`, `/suggestion-approve` and `/suggestion-deny` ask for a reason, then set the status, run its actions in order (approve, deny, close voting, DM the author with a template or Sparko's own message, give the blacklisted role) and add a box under the suggestion with who set it and why.
- If someone deletes a suggestion in Discord, the audit log says who (Sparko needs View Audit Log). Someone with a delete role (or Manage Server when none are picked) deletes it for good; anyone else, and Sparko posts it again with its votes and data.
- Auto-close is checked every minute. Closing greys out the vote buttons and locks the suggestion's thread.
- Storage: `GET …/suggestions/list?q=&status=` lists suggestions newest first; `DELETE …/suggestions/:number` removes one straight away and the bot takes its messages down. Each suggestion counts 4 KB of the server's storage (10 MB on Free, 100 MB on Plus).
- `POST …/suggestions/test` with `{ channel }` posts a made-up suggestion there with the saved message.

## Reaction roles: Sparko's template

The claim and remove messages can be **Sparko's template** (`sparko`) instead of a Studio template: "Added {role.selected.list}" and "Removed {role.removed.list}". It isn't one of the server's templates, so it doesn't count toward them, and the dashboard shows it without letting it be edited. `{role.selected.list}` and `{role.removed.list}` work in any response.

## Birthdays

- Settings are saved at `/api/v1/servers/:id/birthdays` (`GET`, `PUT`). The check (`bdIssue` in `packages/core/src/birthdays.ts`) is shared by the dashboard, the API and the bot: the channel, the hour (0 to 23), the server's time zone (any IANA zone the system knows), the birthday role (Sparko has to be able to give it), who can manage birthdays, the account age (1d to 1y), the time in the server (1h to 1y), the time between changes (1d to 1y), the four message templates and the command names. A group name a turned-on suggestion command already uses is refused.
- The messages are Message Studio templates (tagged **Birthday** in Studio): **Birthday** (one member), **Several birthdays** (everyone at once), **This month** and the **DM**. With none picked Sparko uses its own. Variables: `{birthday.users}` (mentions, "<@1>, <@2> and <@3>"), `{birthday.count}`, `{birthday.age}` (one birthday, when the year is saved and ages are shown), `{birthday.date}` ("14 March"), and for the monthly post `{month}` and `{birthday.list}` (one "@member — date" per line). Mentions ping only the members it's for, and only with "Ping the birthday members" on; the monthly post never pings.
- Saving queues a `birthdays` job: the bot registers the server's commands and checks it can post in the channel and give the role. Per-server commands from every module are registered together (`apps/bot/src/guild-commands.ts`), because Discord's `PUT /applications/:app/guilds/:guild/commands` replaces the whole list.
- `/birthday set` (day, month, optional year and time zone with suggestions as people type, and a member for staff), `/birthday remove`, `/birthday view`, `/birthday upcoming` (next 10) and `/birthday list` (a month). The group and each subcommand can be renamed, described or turned off. Members' own changes check the account age, the time in the server and the time between changes (a new time zone alone isn't a change); staff (Manage Server, or the roles in Who can manage birthdays) skip them. Years give ages of 13 to 120; 29 February needs a leap year when a year is given.
- The bot sweeps every minute (`bdSweep`): a birthday is due on its day, at or after the hour, in the server's time zone or, with "each member's own", in the member's saved zone. 29 February is celebrated on 28 February in other years. The year is marked in `birthdays.celebrated_year` before posting, so a birthday is never posted twice; if Discord fails for a moment the mark comes off to try again, but a refusal (no permission, no channel) is logged and not retried. Everyone due in the same sweep shares one post, or gets one each. The birthday role is given for 24 hours (`role_until`) and taken back by the sweep, even after the module is turned off; if Sparko can't take it back for a day it gives up and logs it. The monthly post goes out on the 1st at the hour in the server's time zone, once (`bd_state.monthly`).
- Members who leave are hidden (never celebrated; left out of lists and the monthly post while "Hide birthdays of members who left" is on), or deleted with "Forget members who leave". Rejoining brings a hidden birthday back.
- Storage: `GET …/birthdays/list?q=` lists birthdays in calendar order with the next 10 (`upcoming`); `GET …/birthdays/members?q=` finds server members by name or ID (Discord's member search); `PUT …/birthdays/members/:userId` with `{ day, month, year, timeZone }` adds or changes one as staff; `DELETE …/birthdays/members/:userId` removes one and queues `birthdays-role-off` if they have the role today. `POST …/birthdays/test` with `{ channel, kind }` posts a made-up birthday message with the saved template.
- Logs (`bd_log`, the last 500): set, changed, removed, celebrated, role given, role removed, monthly post, and failures.

## Questions & answers

- Settings are saved at `/api/v1/servers/:id/questions` (`GET`, `PUT`). The check (`qaIssue` in `packages/core/src/questions.ts`) is shared by the dashboard, the API and the bot: the questions channel, who can ask, the blacklist and ping roles, who can answer (empty means Manage Server), the details' lengths (up to 2,000), the cooldown (1mi to 1mt), open questions per member (1 to 3 on Free, up to 20 on Plus), categories (5 on Free, 25 on Plus, names up to 30 characters with an optional emoji), the thread's auto-archive (1 hour, 1 day, 3 days or 1 week), what happens after an answer (close now, close after 1mi to 1mt, or keep open), expiring unanswered questions (1h to 1y) and the command names. A command name another module already uses is refused.
- Three Message Studio templates (tagged **Q&A** in Studio): the question message and the answer message, each one embed or container without pictures, and the DM sent when a question is answered. With none picked Sparko uses its Question card, Answer card and its own DM. Variables: `{question.title}`, `{question.body}`, `{question.id}`, `{question.category}`, `{status}` (Open, Answered, Closed, Expired), `{answer}` (the first 1,000 characters on the question; all of it in the thread and the DM), `{answered.by}`, `{answered.by.name}`, `{asker}` (and `{user}`, both Anonymous when questions are), `{metoo.count}`, `{thread}` and `{files}`.
- Saving queues a `questions` job: the bot registers the server's commands and checks it can post, open and manage threads in the channel (and ping the role). Discord replaces a server's commands all at once, so `guildCommandBodies` in `packages/core/src/guild-commands.ts` gives every module's commands together (Suggestions and Questions & answers), and each module registers that whole list.
- One command, `/question`, with the parts `ask`, `answer`, `close`, `reopen` and `delete`, each renamable and able to be turned off. `ask` takes a category (autocompleted) and up to 3 files, and opens a form with a title and the details. Who can ask, the blacklist, the cooldown and the open limit are checked before the form opens and again when it's sent; refusals are logged. The staff parts autocomplete question numbers and titles.
- Sparko posts the question with a public thread (`#12 Title`) and adds the asker to it unless questions are anonymous. Under it are fixed buttons: **Answer** (`qa:answer`, staff; opens a form with the earlier answer), **Mark answered** (`qa:done`, the asker or staff) and, when on, **Me too** (`qa:metoo`, kept in `qa_metoo`, edits batched).
- Answering posts the answer template in the thread (editing the earlier answer when staff answer again; the log keeps both), adds the answer under the question with who wrote it (unless the template shows `{answer}` itself), turns the question's colour to its status's, and DMs the asker when that's on. Mark answered closes it without an answer. The thread then closes as set: closing locks and archives it. `/question reopen` opens it again and clears the shown answer.
- Every minute the bot closes threads whose time is up and marks questions unanswered for too long as Expired. Deleting the question message in Discord marks it **Deleted in Discord** and locks its thread; staff still see it in Storage.
- Storage: `GET …/questions/list?q=&status=` lists questions newest first; `DELETE …/questions/:number` removes one and the bot takes its message and thread down. Each question counts 4 KB of the server's storage (10 MB on Free, 100 MB on Plus).
- `POST …/questions/test` with `{ channel, which }` posts a made-up question (without its buttons or ping) or answer there with the saved templates.
