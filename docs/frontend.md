# Frontend rebuild

The website is being rebuilt from the design system in `design-system/` (made in Claude Design). The frontend comes first; the backend (sign-in, bot, payments) is reconnected afterwards.

## How it fits together

- **`design-system/`** is the source of truth for the look: colour tokens for both themes, `sp-*` component CSS, the `<sp-icon>` element and the UI kits. Change the design there, and every page that uses it follows.
- **`apps/web/src/styles.css`** loads the design system, except its Google Fonts import. Inter is served from the site itself, so visitors' browsers never contact Google.
- **`apps/web/src/ui/`** has typed React versions of the design system's components (buttons, inputs, notices, modals, toasts, save bar, Discord previews). Pages use these, so a change to one component changes it everywhere.
- **`apps/web/src/content/`** holds the module catalogue, commands, prices and legal facts the pages read.

## Stages

| Stage | What                                                                                                              | State                                                              |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| F1    | Project setup, components, public site (home, features, pricing, commands, docs, status, support, privacy, terms) | Merged ([PR #18](https://github.com/Huy1234secret/Sparko/pull/18)) |
| F2    | Dashboard shell, server picker, overview, the shared module page, Welcome                                         | Merged ([PR #19](https://github.com/Huy1234secret/Sparko/pull/19)) |
| F3a   | Support and Messages: Tickets (inbox, one ticket, panel settings) and Message Studio                              | This PR                                                            |
| F3+   | The other dashboard areas, member pages, account pages, owner console                                             | Later                                                              |

Until the backend is reconnected, "Add to Discord", "Sign in" and checkout show a short explanation instead of leaving the site, and the Status page says it can't reach the service.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm build` run locally and in CI on every pull request.

## Dashboard (F2)

- **Data:** pages get data only through `apps/web/src/data` (React Query hooks over the `PanelApi` interface in `data/types.ts`). For now `data/mock.ts` provides sample servers and modules that behave like the service: short delays, saving then applying to Discord, a channel Sparko can't post in, a paused server and a Plus-only module. Reconnecting the backend means providing `PanelApi` over HTTP; the pages don't change. A bar on every dashboard page says it shows sample data.
- **Routes:** `/signin`, `/dashboard` (server picker), `/dashboard/:serverId` (overview), `/dashboard/:serverId/:moduleId` (module page, tab in `?tab=`) and `/dashboard/:serverId/tickets/:ticketNumber` (one ticket).
- **The shared module page** (`dashboard/modules/frame.tsx`) is used by every module:
  - a header with an on/off switch and an honest status (Off, Live, Unsaved changes, Saving…, Applying…, Couldn't apply, Paused);
  - the save progress (Saved → Applying to Discord → Live) and a save bar while there are unsaved changes;
  - Settings/Items/History tabs, a paused-server banner, and the Plus offer for Plus-only modules.
- **Welcome** is the first complete module. Modules without their own page yet use the shared layout with an honest empty state.

## Support and Messages (F3a)

- **Tickets:** the Inbox tab lists tickets by Needs a reply, Assigned to me, All open and Closed, with search; members waiting over an hour and higher priorities come first. Opening a ticket shows the thread with replies and staff notes, priority, assigning (with Take over), closing with a reason, reopening and the people involved. Settings edits the ticket panel (channel, message, up to 5 buttons with their opening question, staff roles, auto-close) with a preview where each button shows its opener.
- **Message Studio:** the editor builds a message with text, an embed (author, title, description, colour, image, footer, thumbnail, timestamp, up to 25 fields) and up to 5 link buttons, with a desktop or phone preview and the 6,000-character embed limit. It checks links, colours and fields before publishing. Templates can be used, duplicated, saved and deleted; every publish is kept under Versions.
- **Shared pieces** in `dashboard/modules/parts.tsx` keep modules consistent: `ChannelPicker` (every channel dropdown), `ColourChoice` (every embed colour) and `VersionHistory` (every History tab). Changing one changes it everywhere.
