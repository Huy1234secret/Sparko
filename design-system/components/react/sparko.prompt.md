Sparko React components (components/react/sparko.jsx) — wrappers over the sp-* CSS. Requires styles.css (or sparko.bundle.css) and assets/icons/sp-icon.js on the page; mount inside an element with data-theme and a size container (.sp-cq / .sp-app).

Load: `<x-import component-from-global-scope="Sparko.Button" from="./components/react/sparko.jsx">Save</x-import>` or `<script type="text/babel" src="components/react/sparko.jsx">` then `window.Sparko.*`.

- Button variant primary|secondary|ghost|danger, size sm|lg, icon, iconOnly (+aria-label), loading (+loadingLabel), error (renders "Try again").
- Input/Textarea/Select/Field: label, hint, error (sets aria-invalid + message).
- Switch / Checkbox / RadioCards / Segmented / Tabs: controlled (value + onChange).
- ChannelPicker (channels with category/type/disabled) and RolePicker (multi, colour dots) are searchable comboboxes with ↑↓/Enter/Esc.
- Notice tone info|success|warning|danger; PlusBanner; PausedBanner (not dismissible).
- Card, Stat (trend up|down|flat, loading), EmptyState (error → retry pattern), Avatar, ServerIcon.
- Modal (bottom sheet <640px), Toast, SaveBar state dirty|saving|error|saved.
- DiscordPreview > DiscordMessage with embed {color, title, description, fields[inline], footer} and components rows of buttons or {select}.
Rules: one primary per view; text on yellow is ink; icons are Lucide names.
