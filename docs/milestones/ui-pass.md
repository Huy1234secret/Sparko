# UI/UX pass over M1–M3

A design pass over the merged identity, ticket, message and community features. It changes presentation, guidance and recovery, not business rules. The one behaviour change is in the API: a failed Discord sign-in now redirects to the sign-in page with a reason instead of returning a raw JSON error. The design system is recorded in `design-system/sparko/MASTER.md`, with page overrides in `design-system/sparko/pages/`.

## What changed

**Shared shell and components**

- Navigation is grouped into sections: Start, Manage, Create & review, As a member, and Sparko operators.
- A real server switcher keeps the current section and drops record IDs.
- Breadcrumbs, page-name headings and tab titles (`Page · Server · Sparko`) on every dashboard route.
- A Ctrl/⌘+K page finder covers every page and module.
- Focus moves to the new page's `h1` after navigation.
- New `@sparko/ui` components:
  - `Notice`, `Advanced` (disclosure), `Breadcrumbs`.
  - `SaveBar`, which announces Saving / Unsaved changes / saved state.
  - `ConflictNotice`, which offers "Keep my changes" (the next save replaces the newer revision) or "Load the newer version".
  - `configStatus()`: Not set up yet / Live / Waiting for the bot.
  - `Field` gained a required marker and an error icon.
  - `EmptyState` gained context icons and a compact variant.
- Readability:
  - Text that was 8–12px is now 12–14px; form controls are 16px on phones.
  - Touch targets are 44px.
  - Search fields have a visible focus ring; invalid inputs have a red border.
  - Long IDs and names wrap.
  - Light-theme brand text uses an accessible amber.

**M1 identity, setup and tickets**

- Sign-in explains cancelled, expired and failed Discord attempts.
- The server list groups servers by next action and says what each group means:
  - Ready to manage.
  - Add Sparko to start.
  - Member access, with the permission that managing needs.
- The overview starts with a getting-started checklist derived from real data:
  - Bot connected.
  - A setup goal applied.
  - Tickets enabled.
  - A delivered, non-test ticket panel.
- Guided setup:
  - A three-step progress list.
  - A plain-words table of changed settings per feature, with the raw JSON under "Technical details".
  - Lucide preset icons replace the text glyphs.
  - The existing `setup-success` animation, static under reduced motion.
- Ticket settings, inbox and detail:
  - Plain lifecycle labels ("Waiting for staff", "Transcript capture failed").
  - Status filters with counts.
  - Labelled rows on phones.
  - Next-step guidance on each ticket.
  - Claim/release/close confirmation.
  - A required closing reason with a character count.
- Transcript access and historical staff authorization are unchanged.

**M2 Message Studio**

- A status strip shows:
  - The draft state (new, unsaved since version N, or saved as version N of the design).
  - Whether autosave is on.
  - The validation count, linked to the list of problems.
  - Jump links to each Studio section.
- One sentence explains Components V2 versus traditional embeds.
- Undo/redo have tooltips and keyboard shortcuts; text fields keep native undo.
- Save & publish is three numbered steps. Saving still never posts to Discord.
- Discord preview text is never below 11px.

**M3 community**

- Every page heading names the feature.
- Gateway-dependent pages show one `LiveEventsNotice` naming the events and any privileged intent: levels, counting, welcome, leave/boost, automatic roles and starboard.
- Rank-card pages state that avatars and custom backgrounds are not drawn yet. The "Avatar shape" setting is now "Picture shape" and explains what it shapes.
- Counting's empty status links to its settings.
- The module catalogue has a distinct Lucide icon per module, live status badges and whole-card links.

## Evidence

Local, Node 24.19.0, PostgreSQL 16 and Redis 7 disposable services:

- `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm build` (including the prerender and browser-boundary checks) pass.
- `pnpm test`: 214 unit tests in 36 files.
- `pnpm test:integration`: 142 PostgreSQL tests in 13 files. This includes the replayed-OAuth and cancelled-sign-in redirects.
- `pnpm test:e2e`: 14 browser journeys. The new `tests/e2e/ui-navigation.spec.ts` covers:
  - A declined sign-in.
  - The keyboard finder with focus on the new page title.
  - Breadcrumb navigation, and a Studio deep link keeping focus on its section.
  - Unsaved-change protection and discard.
  - Server-switcher Escape and focus return.
  - No horizontal overflow at 375px and 720px (200% zoom of a 1440px window).
  - The M1 ticket journey and the M2/M3 journeys still pass with the new labels.

New unit coverage:

- `routeMeta`: breadcrumbs and titles.
- `AppShell`: sign-in notice, breadcrumbs, tab title, switcher behaviour, switch paths.
- The setup diff formatter.
- Ticket detail: next step, claim feedback, closing-reason validation.
- Studio draft states and keyboard undo/redo.
- Ticket-settings conflict recovery: keeping the draft re-saves against the newer revision.

Browser review used the real test API at 375, 390, 720, 768 and 1440px in light and dark themes, with reduced motion. An automated sweep of 20 dashboard routes found no horizontal overflow, text under 12px only in the Discord preview badge, and exactly one `h1` per page.

Representative screenshots are in `docs/screenshots/ui/`:

- Overview (light).
- Server list and levels on a phone (dark).
- Guided setup review.
- Server switcher.
- Page finder.
- Unsaved welcome settings.
- Ticket settings.
- Studio (light).
- Community catalogue.

## Remaining limits

- Live Discord behaviour is not verified: OAuth consent screens, Gateway events, rank-card avatars and backgrounds. The UI states these limits; it does not remove them.
- The overview's ticket-panel check looks for a delivered, non-test publication with a `ticket.create` control. It does not re-verify that the Discord message still exists. Publication reconciliation still owns that.
- The generic module page, used by modules that are not typed yet, has the new save bar and conflict recovery. Its layout is not redesigned, because M4 and later replace those pages with typed workspaces.
- The Vite main-chunk size warning predates this pass. The main chunk shrank from about 925 kB to 630 kB, but it is still above the 600 kB warning.
