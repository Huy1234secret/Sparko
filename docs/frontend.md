# Frontend rebuild

The website is being rebuilt from the design system in `design-system/` (made in Claude Design). The frontend comes first; the backend (sign-in, bot, payments) is reconnected afterwards.

## How it fits together

- **`design-system/`** is the source of truth for the look: colour tokens for both themes, `sp-*` component CSS, the `<sp-icon>` element and the UI kits. Change the design there, and every page that uses it follows.
- **`apps/web/src/styles.css`** loads the design system, except its Google Fonts import. Inter is served from the site itself, so visitors' browsers never contact Google.
- **`apps/web/src/ui/`** has typed React versions of the design system's components (buttons, inputs, notices, modals, toasts, save bar, Discord previews). Pages use these, so a change to one component changes it everywhere.
- **`apps/web/src/content/`** holds the module catalogue, commands, prices and legal facts the pages read.

## Stages

| Stage | What                                                                                                              | State   |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ------- |
| F1    | Project setup, components, public site (home, features, pricing, commands, docs, status, support, privacy, terms) | This PR |
| F2    | Dashboard shell, server picker, overview, the shared module page                                                  | Next    |
| F3+   | Each dashboard area, member pages, account pages, owner console                                                   | Later   |

Until the backend is reconnected, "Add to Discord", "Sign in" and checkout show a short explanation instead of leaving the site, and the Status page says it can't reach the service.

## Checks

`pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm build` run locally and in CI on every pull request.
