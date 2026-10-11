# Dashboard pages (overrides)

Applies to the server list, server overview, guided setup and the account area. Everything else follows `../MASTER.md`.

- **Server list**: group servers by what the admin can do next: _Ready to manage_ (open workspace), _Add Sparko to start_ (install link, permissions reviewed in Discord), _Member access_ (member profile, with the permission that management needs). Search appears only with more than six servers.
- **Overview**: the first card is the _Getting started_ checklist (bot connected, setup goal, tickets, panel published). Only the next unfinished step gets a primary button; finished steps say what is now true.
- **Guided setup**: a three-step progress list (`aria-current="step"`). The preview shows a per-feature table of changed settings in plain words; raw JSON sits in an `Advanced` disclosure. Success uses the `setup-success` animation and a primary "Continue to tickets" link.
- **Sign-in**: OAuth failures return to the sign-in gate with `?signin=cancelled|expired|failed` and a warning notice; no raw API errors.
