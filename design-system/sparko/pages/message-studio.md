# Message Studio (overrides)

- A sticky **status strip** sits under the mode switch: draft state (new / unsaved since version N / saved as version N), autosave, validation (count of problems linking to the list, or "Design is valid") and jump links to Blocks, Preview, Properties, Save & publish, Templates and Publications. On phones it is static so it never covers fields.
- Under the mode switch, one sentence explains Components V2 versus a traditional embed.
- Undo/redo buttons carry `title` and `aria-keyshortcuts`; Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) work outside text fields, which keep native undo.
- **Save & publish** is three numbered steps: save a version, choose where it goes, test then publish. Saving never posts to Discord; publishing is blocked while there are unsaved changes or validation problems.
- The Discord preview keeps Discord's own scale (minimum 11px) and its disclaimer that clients may render spacing differently.
