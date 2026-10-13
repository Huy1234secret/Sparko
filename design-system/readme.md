# Sparko Design System

Sparko is an all-in-one Discord bot (moderation, AutoMod, welcome messages, auto-roles, tickets, logs) with a web dashboard. This system covers that dashboard: tokens, CSS components, specimen cards and an interactive UI kit. Dark is the default theme and light is a full peer. Both are built from the same semantic tokens.

## Files
- `styles.css`: the entry point. It `@import`s every token and component file. Link this one file.
- `sparko.bundle.css`: the same CSS in one file with no imports, so it loads faster. Regenerate it whenever a source file changes.
- `tokens/`: `colors.css` (both themes), `typography.css`, `spacing.css` (spacing, radius, tap sizes, layout), `effects.css` (motion, z-index), `base.css` (reset, focus, keyframes, reduced motion), `fonts.css`.
- `components/<family>/<family>.css` + `<family>.card.html`: the styles and a specimen card for each family. Every card shows dark and light, with a desktop column and a 390 px frame.
- `guidelines/*.html`: foundation cards (colour, type, spacing, radius, elevation, motion, focus, icons, tap targets, brand).
- `assets/icons/`: Lucide SVGs, `icons.css` and `sp-icon.js` (a `<sp-icon name="hash">` element that renders in shadow DOM, safe for React).
- `ui_kits/dashboard/Dashboard.dc.html`: the interactive dashboard (Overview, Moderation, Welcome, Auto-roles, Tickets, Logs). It accepts `?theme=light&page=welcome`. `Showcase.dc.html` shows it in dark and light at 1440 and 390.

## Theming
`:root` is dark. Put `data-theme="light"` (or `"dark"`) on `<html>` or on any subtree. Themes nest. Always use the semantic tokens (`--sp-surface`, `--sp-muted`, `--sp-brand-text`…), never raw hex values.

| token | dark | light | use |
|---|---|---|---|
| canvas | #111110 | #FFFCF3 | page |
| subtle | #171715 | #FAF8F0 | sidebar, card footers, table header |
| surface | #1C1C19 | #FFFFFF | cards, popovers |
| raised | #262620 | #F4F2E9 | inputs, hover, chips |
| line | #30302A | #E5E2D8 | dividers, card borders |
| line-strong | #6E6D62 | #8F8B7C | control borders (≥ 3:1) |
| text / muted | #FAFAF5 / #AAA99D | #1C1917 / #686459 | |
| brand | #FACC15 | #FACC15 | fills; hover #EAB308, press #CA8A04 |
| brand-text | #FACC15 | #866D09 | yellow text and links |
| brand-edge | #FACC15 | #A16207 | checked and selected outlines (yellow can't reach 3:1 on cream) |
| on-brand | #1C1917 | #1C1917 | **text on yellow is always ink, never white** |

The status colours (success, danger, warning, info) each come with a `-soft` tint and a `-line` border. Danger buttons use `--sp-danger-fill` (#D4372F dark / #B42F2A light) with white text, because the soft danger tone is too pale for a fill.

## Visual foundations
- **Mood:** warm, calm, confident. Near-blacks and creams with a yellow tint, never cold grey. Yellow is a spotlight: one primary action per view, Plus surfaces, the selected state.
- **Type:** Inter 400/500/600. H1 24/32, H2 18/26, H3 15/22, body 14/22, label 13/18, caption 12/16, stat 28/34 with tabular numbers. Headings use slight negative tracking. Monospace (SF Mono / Menlo) only for IDs, case numbers, request IDs and code.
- **Spacing:** a 4/8 px grid. Card padding 20, page gutter 32 (16 on mobile), section gap 24.
- **Radius:** 8 for chips, badges, tooltips and menu items. 10 for buttons, inputs and notices. 14 for cards, popovers, modals and drawers. Full for pills, switches and avatars.
- **Elevation:** borders come first. Cards are a 1 px `line` (plus a whisper-soft shadow in light). Only floating layers (popovers, toasts, modals) get `--sp-shadow-overlay`.
- **Texture:** `.sp-sparks` adds a dot field fading in from the top-right. Use it only on Plus surfaces and empty states.
- **Notices:** a tint, a 1 px tinted border and an icon. No coloured left-border stripes.
- **Motion:** 120 ms for hover and press, 160 ms for popovers and toasts, 200 ms for modals and drawers (the ceiling). Ease-out, small fades and slides, no bounce. `prefers-reduced-motion` drops everything to 1 ms. Skeletons are static (no shimmer).

## Accessibility rules
- WCAG 2.2 AA in both themes. Text pairs are listed in `guidelines/colors-text.html`. Control borders and focus indicators are ≥ 3:1.
- **Tap targets ≥ 44 px.** Controls are 44 px tall. Smaller visuals (36 px small buttons, chip remove buttons, segmented items) extend their hit area with `::after`.
- **Focus:** `--sp-ring` is a 1 px solid edge plus a 3 px halo at 40% (#FACC15 dark / #A16207 light). Filled buttons use `--sp-ring-offset`; tabs and lists use `--sp-ring-inset`. The focus ring is never removed without a replacement.
- Native inputs stay in the DOM (`.sp-choice-input` hides them visually). Use proper roles: `switch`, `tablist`, `listbox`, `menu`, `dialog` + `aria-modal`, `aria-busy` while loading, `aria-invalid` + an error message.

## State hooks
Each component has real pseudo-state styles (`:hover`, `:focus-visible`, `:active`, `:disabled`). Specimen cards force those states with `.is-hover`, `.is-focus` and `.is-active`. `.is-loading`, `.is-error` and `.is-disabled` are real states as well. Loading keeps the label (spinner + verb, e.g. "Saving…"). An error state on a button turns it into the retry action.

## Responsive
Components respond to their **container** (`container-type: inline-size`: `.sp-app`, `.sp-cq`, `.spec-frame`), not to the viewport.
- Under 900 px, tables stack into cards (cells need `data-label`; mark one cell `data-primary` and one `data-actions`).
- Under 640 px, modals become bottom sheets, drawers go full width, the save bar's buttons stretch, and breadcrumbs collapse to a back link.
- Under 800 px, the sidebar becomes a drawer opened from the top bar.

## Panel patterns (`components/panel/panel.css`)
Grouped, searchable sidebar (`.sp-sidebar--grouped`, `.sp-nav-group`), setup checklist (`.sp-steps`), health and list rows (`.sp-row`), activity feed (`.sp-feed`), honest sync status (`.sp-sync--unsaved|saving|applying|live|error|paused`, `.sp-pipeline`), module header (`.sp-module-head`), server picker cards, before/after diff (`.sp-diff`), and numbered fix-it steps (`.sp-howto`).

## Content
- Voice: plain, calm, specific. Address the user as "you" and refer to the bot as "Sparko". Use sentence case everywhere, including buttons.
- Buttons are verbs plus objects: "Ban member", "Save changes", "Try again". Avoid "OK" and "Submit".
- Errors say what happened and what to do next: "Sparko can't send messages in #rules." Show request IDs in mono for support.
- Discord nouns stay Discord's: server, channel, role, member, embed. Channels always carry `#` (or their channel-type icon), and roles always carry their colour dot.

## Iconography
Lucide only, stroke 2, sizes 14/16/18/20/24. In static HTML, inline the SVG with `class="sp-i"`. In live UI, use `<sp-icon class="sp-i" name="…">`. Icons are decorative (`aria-hidden`), so icon-only buttons need an `aria-label`. There are no emoji in the UI chrome; they only appear inside Discord message previews when the user's content contains them.

## Discord message preview
`.dc-*` mirrors Discord's message layout: 40 px avatar, a 16 px name with the APP tag, 4 px embed colour bar, 516 px max embed width, inline fields three to a row, 32 px buttons, 44 px select. It follows the surrounding theme using Discord's own dark and light palettes. It uses system fonts only and no Discord logos.
