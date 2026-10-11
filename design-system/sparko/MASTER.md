# Sparko design system (master)

Source of truth for the Sparko dashboard and public site. When building a page, read this file, then the matching file in `pages/` if one exists; a page file overrides only what it names.

Generated with UI UX Pro Max (`search.py "community admin panel minimal warm" --design-system --density 6 --motion 3`) on 2026-10-11 and then reconciled with the shipped product. The generator proposed a slate and green palette, glassmorphism and Plus Jakarta Sans. Those were rejected: the brand accent is fixed at yellow `#FACC15`, light and dark themes already exist, and blur-heavy glass hurts contrast on dense settings pages. Kept from the generator: the standard density scale, subtle motion, its form rules and its pre-delivery checklist.

Implementation: tokens and components live in `apps/web/src/styles.css` (the "Design system v2" layer refines the base rules) and `packages/ui/src/index.tsx`. Icons are Lucide only.

## Principles

1. **Say what the page is.** Each page has one `h1` that names it ("Levels & XP"), an eyebrow naming its group, and a one-sentence description of what the admin can do there. Breadcrumbs and the browser title repeat the location.
2. **One clear next action.** Each screen has one primary button. Overview and guided setup always show the next step.
3. **Saved is not delivered.** Configuration status uses `configStatus()`: _Not set up yet_, _Live_, _Waiting for the bot_. Discord delivery uses `DeliveryState`. Never imply a Discord message exists because settings were saved.
4. **Basic first, advanced behind a disclosure.** Use `<Advanced>` for options most admins leave alone, and for raw JSON or technical detail.
5. **Explain limits instead of hiding them.** Use `<Notice tone="info">` (for example `LiveEventsNotice`) when a feature depends on live Gateway events, privileged intents or unrendered media.
6. **Never lose work.** Settings forms use `SaveBar` + `DraftGuard`; a revision conflict uses `ConflictNotice` (keep my changes, or load the newer version).

## Colour tokens

Defined on `:root` (dark, default) and `:root[data-theme='light']`. Components use tokens, never raw hex.

| Token       | Dark      | Light     | Use                                            |
| ----------- | --------- | --------- | ---------------------------------------------- |
| `--canvas`  | `#111110` | `#fffcf3` | Page background                                |
| `--surface` | `#1c1c19` | `#ffffff` | Cards, inputs, menus                           |
| `--raised`  | `#262620` | `#f4f2e9` | Hover, neutral badges                          |
| `--subtle`  | `#171715` | `#faf8f0` | Sidebar, input fill, disclosures               |
| `--text`    | `#fafaf5` | `#1c1917` | Body text                                      |
| `--muted`   | `#aaa99d` | `#686459` | Secondary text (≥ 4.5:1 on canvas in both)     |
| `--line`    | `#30302a` | `#e5e2d8` | Borders, dividers                              |
| `--brand`   | `#facc15` | `#facc15` | Primary buttons, active nav, focus ring (dark) |
| `--success` | `#87dba6` | `#20773e` | Live / applied / done                          |
| `--warning` | `#efcb79` | `#865d06` | Waiting / unsaved / needs attention            |
| `--danger`  | `#ffaaa4` | `#b42f2a` | Errors, destructive actions                    |
| `--info`    | `#9cc3ff` | `#1d4ed8` | Explanations and limits                        |

Text on `--brand` is always `#1c1917`. In light theme, brand-coloured text and focus rings use `#a16207`/`#854d0e` because yellow on cream fails contrast.

## Typography

System/Inter stack (`--font-sans`); monospace for IDs, tokens and references (`.mono`).

| Role             | Size                                    | Weight  |
| ---------------- | --------------------------------------- | ------- |
| Page title `h1`  | 28–38px                                 | 720     |
| Section `h2`     | 20px                                    | 650     |
| Card `h3`        | 16px                                    | 630     |
| Body, inputs     | 14px (16px on phones, to stop iOS zoom) | 400     |
| Labels           | 14px                                    | 600     |
| Hints, meta      | 13px                                    | 400     |
| Badges, eyebrows | 12px                                    | 620–700 |

Nothing below 12px except the Discord preview's "APP" badge (11px, mirroring Discord). Long names and IDs use `.truncate` with a `title`, or `.wrap-anywhere`.

## Spacing, shape, elevation

Standard density: 4 / 8 / 12 / 16 / 24 / 32 / 48px. Radius `--radius-sm` 8px (controls), `--radius-md` 10px (menus, notices), `--radius-lg` 14px (cards). One shadow (`--shadow`) for floating layers only (menus, save bar, dialogs).

## Components (`@sparko/ui` unless noted)

| Component                 | Rules                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`                  | `primary` once per view; `secondary`; `ghost` for low-emphasis; `danger` for destructive. `busy` disables and shows a spinner. Min height 42–44px. |
| `Badge`                   | Tone carries meaning but text always names the state.                                                                                              |
| `Field`                   | Visible label, optional `required` marker, hint below, error below with icon, linked by `aria-describedby`.                                        |
| `Notice`                  | `info` limits, `warning` attention, `success` completion, `danger` blocking problems.                                                              |
| `Advanced`                | Native `<details>` disclosure for advanced or technical content.                                                                                   |
| `SaveBar`                 | Sticky; announces Saving / Unsaved changes / saved state politely; Discard + Save.                                                                 |
| `ConflictNotice`          | Revision conflicts: keep my changes (next save replaces the newer version) or load the newer version.                                              |
| `EmptyState`              | Says what will appear and how to make it appear; `compact` inside cards; Lucide icon per context.                                                  |
| `Breadcrumbs`             | `nav[aria-label=Breadcrumb]` with `aria-current=page`; phones show parent and current only.                                                        |
| `Tabs` (web)              | URL-backed `?tab=`; arrow keys move between tabs.                                                                                                  |
| Server switcher (web)     | Disclosure button listing managed servers; keeps the current section, drops record IDs; Escape returns focus.                                      |
| Page finder (web)         | Ctrl/⌘+K dialog searching pages and every module.                                                                                                  |
| `TicketStatusBadge` (web) | Plain lifecycle labels ("Waiting for staff", "Transcript capture failed").                                                                         |

## Navigation

Sidebar sections: Start (Overview, Guided setup), Manage (Tickets & support, Engagement, Community, Safety, Automation), Create & review (Message Studio, Insights, Server settings), As a member (Your member profile), then Sparko operators (Owner console) separated at the bottom. Phones use the same menu in a dialog drawer. After every route change, focus moves to the page `h1`.

## Motion

Subtle (3/10). Durations `--motion-fast` 120ms (press, hover) and `--motion-base` 200ms (menus, disclosure chevrons). Animate opacity and transform only. Lottie feedback comes from `@sparko/assets` `AnimatedIcon` (setup success) with its static SVG fallback; the user's motion preference maps through `motionPreference()`. `prefers-reduced-motion` and the in-app "reduced" preference disable CSS animation and transitions.

## Accessibility checklist

- Text contrast ≥ 4.5:1 and focus rings visible in both themes.
- Pointer targets ≥ 44px on touch layouts, ≥ 24px elsewhere.
- No horizontal scroll at 375px or at 200% zoom (720px wide).
- Icons beside text are `aria-hidden`; icon-only buttons have `aria-label` and a `title`.
- Errors sit beside their field; server errors without a field are summarised.
- Dialogs trap focus, close on Escape and return focus to their trigger.
- Sticky header and save bar do not cover focused controls (`scroll-padding`).
