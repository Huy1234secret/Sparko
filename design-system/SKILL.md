---
name: sparko-design
description: Design and build Sparko (Discord bot + web dashboard) interfaces — dark-first, warm near-black/cream surfaces, #FACC15 yellow accent with ink text, Inter, Lucide icons, AA in both themes.
---

# Using the Sparko design system

1. Read `readme.md` first: tokens, theming, a11y rules, content voice.
2. Link `styles.css` (or `sparko.bundle.css` for faster single-request loads) and, for live UI, `assets/icons/sp-icon.js`. Copy them into the target project rather than hot-linking.
3. Compose from the `sp-*` classes. Open the matching `components/<family>/<family>.card.html` to see exact markup for every state; copy its structure.
4. Wrap layouts that must reflow in a size container (`.sp-app` or `.sp-cq`). Tables, modals, drawers, save bar and breadcrumbs adapt at 640px; the shell at 860px.
5. Start from `ui_kits/dashboard/Dashboard.dc.html` for any dashboard screen — it already wires the shell, command palette (Ctrl/⌘K), pickers, save bar, toasts, modal and drawer.

## Non-negotiables
- Text on yellow is `--sp-on-brand` (#1C1917). Never white.
- Semantic tokens only; never cold greys or raw hex in components.
- ≥ 44px targets, visible `:focus-visible` ring, motion ≤ 200ms and off under reduced motion.
- One primary (yellow) button per view. Danger fill only for destructive confirms.
- Channels show `#`/type icon; roles show their colour dot; IDs in mono.
- Lucide icons only, stroke 2. No emoji in UI chrome.
