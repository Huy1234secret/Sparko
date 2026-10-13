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
| F2    | Dashboard shell, server picker, overview, the shared module page, Welcome                                         | This PR                                                            |
| F3+   | Each dashboard area, member pages, account pages, owner console                                                   | Later                                                              |

Until the backend is reconnected, "Add to Discord", "Sign in" and checkout show a short explanation instead of leaving the site, and the Status page says it can't reach the service.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm build` run locally and in CI on every pull request.

## Dashboard (F2)

- **Data:** pages get data only through `apps/web/src/data` (React Query hooks over the `PanelApi` interface in `data/types.ts`). For now `data/mock.ts` provides sample servers and modules that behave like the service: short delays, saving then applying to Discord, a channel Sparko can't post in, a paused server and a Plus-only module. Reconnecting the backend means providing `PanelApi` over HTTP; the pages don't change. A bar on every dashboard page says it shows sample data.
- **Routes:** `/signin`, `/dashboard` (server picker), `/dashboard/:serverId` (overview) and `/dashboard/:serverId/:moduleId` (module page, tab in `?tab=`).
- **The shared module page** (`dashboard/modules/frame.tsx`) is used by every module:
  - a header with an on/off switch and an honest status (Off, Live, Unsaved changes, Saving…, Applying…, Couldn't apply, Paused);
  - the save progress (Saved → Applying to Discord → Live) and a save bar while there are unsaved changes;
  - Settings/Items/History tabs, a paused-server banner, and the Plus offer for Plus-only modules.
- **Welcome** is the first complete module. Modules without their own page yet use the shared layout with an honest empty state.
