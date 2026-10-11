# Settings forms (overrides)

Applies to typed feature pages built on `ConfigForm`, ticket settings and the generic module page.

- Top card: feature title, one-sentence description, `configStatus` badge, missing prerequisites as a warning `Notice`, then the enable switch ("Modules stay off until you turn them on and save").
- Gateway-dependent features show `LiveEventsNotice` once, under the page heading, naming the events and any privileged intent.
- Group related fields in cards with an `h2`; put rarely changed fields in `Advanced`.
- Validate with the shared contract; server field errors land on the matching control and focus the first one; unmatched errors are listed under the error message.
- `SaveBar` stays sticky at the bottom; leaving with unsaved changes opens the `DraftGuard` dialog; a revision conflict shows `ConflictNotice`.
- Density: standard. Inputs are 44px high, two columns on wide screens, one column under 800px.
