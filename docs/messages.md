# Message documents and Discord output

`@sparko/messages` is browser-safe and owns `MessageDocumentSchema`, the pure compiler, protocol limits, action metadata, token definitions, modal form validation and mode conversion. Designs never contain issued Discord identities. Immutable template versions contain the portable design; the API persists controls and supplies `compileMessage(document, context, controlIds)` with a map of each design control key to `spk:ctl:<opaque identity>`.

```ts
import { compileMessage, defaultTicketDocument } from '@sparko/messages';

const payload = compileMessage(
  defaultTicketDocument,
  {},
  {
    'ticket:create': 'spk:ctl:example_persisted_identity',
  },
);
```

The example identity is illustrative. Production controls must resolve to actual persisted guild/publication/action snapshots and enforce current actor authorization, expiry, revocation and option membership. `getMessageActions` returns the action definitions to persist; `validateControlSubmission` rejects invented select values. `ACTION_REGISTRY` declares required capability, effect and retry semantics. Role toggles require saving desired state before delivering, and permission/hierarchy/resource checks belong to the API and bot.

V2 produces `flags: 32768` and component content, with no traditional content or embeds. Embed mode has no V2 flag and supports traditional content, embeds and five compatible action rows. The compiler validates strict shapes, allowed nesting, 40 nested components, 4,000 total text-display characters, unique control keys/custom IDs, five buttons or one select per row, section accessories, ten gallery items, 100-character custom IDs and 6,000 combined embed characters. Budgets apply after token expansion. Buttons use Discord's defined colors; yellow is a container/embed accent.

`visibility` describes the design's response policy. The response adapter applies ephemeral flags only to interaction responses; channel publications cannot become ephemeral. Deferrals use only allowed defer flags, and V2 is applied when editing the deferred response. V2 flags cannot be removed from existing messages. `modeChangeLossReport` requires a replacement on a mode change and identifies incompatible/flattened/omitted fields; `convertMessageMode` produces a new validated design for review, without posting it.

Tokens use `{{member.name}}` syntax, an explicit document allowlist and declared context. Unknown, forbidden and malformed tokens fail with field paths. Optional values have registry fallbacks; required context values fail when absent. Expanded values escape Discord markdown and mention syntax; all output disables automatic mention parsing. URLs cannot contain tokens. Media references accept public HTTPS or `attachment://filename`; no network fetching occurs in the compiler. The server separately verifies asset ownership, attachment exposure, provider permissions, uploaded byte limits and DNS/IP safety before fetching anything.

Modal forms use Label components around text inputs rather than deprecated ActionRow-wrapped inputs. Forms up to 25 fields split into steps of at most five; `compileFormStep` requires an issued actor-bound flow identity and `validateFormStepAnswers` validates only fields in that immutable step. The caller persists answers, actor binding, expiration, cancellation and rechecks authorization before final submission.

Application controls resolve a published immutable form version before opening the first modal. Choice fields use short opaque indices in Discord selects and persist the original labels in the flow snapshot. Each step and final submission recheck the actor, source control, current form version and eligibility. A restart does not lose progress. Explicit cancellation clears saved answers; dismissing the native first modal expires the flow after fifteen minutes. Republish, revoked controls, lost roles and expired flows cannot submit stale answers.

Templates have immutable numbered versions with optional names. Duplicate selects a version belonging to that template and creates a separate design. Restore appends a new version containing the selected snapshot; it never rewrites old versions or changes a publication. Studio previews history before loading it and retains the prior editor draft for review. Saving, testing, publishing and replacing remain separate operations.

Publication inventory reports business state and actual outbox delivery status separately, including sanitized delivery errors. Reconciliation observes the original message using its saved Discord ID or original send nonce/issued controls. Matching, missing, conflicting and unidentified outcomes remain distinct. Reconciliation never sends a replacement; republishing requires explicit replacement review. Channel permissions and custom emoji availability are checked against fresh Discord resources before delivery. An unavailable custom emoji uses its explicitly configured Unicode fallback or fails at the emoji field.

Website Lottie JSON belongs to `@sparko/assets`; Discord uses its supported PNG/GIF exports or valid emoji objects. Emoji names must be actual Unicode emoji, and custom emoji IDs must be lossless snowflakes. An inaccessible custom emoji needs its documented Unicode fallback at resource validation time.

`@sparko/rendering` exports `RankCardInputSchema`, `renderRankCard`, `rankCardHash` and `rankCardTextSummary`. The authoritative Sharp renderer accepts bounded static PNG/JPEG/WebP bytes, never URLs or untrusted SVG, and uses a bundled integrity-checked DejaVu Sans font (license in `packages/rendering/assets/FONT-LICENSE.txt`). Both web export and Discord attachment use the same renderer output. Cache identity includes validated inputs/privacy flags, media digests, renderer version and font hash. Rendered PNG and accessible summaries omit disabled rank/XP values. Input layout, accent/background, avatar shape and badges are customizable.

Protocol references: [components](https://docs.discord.com/developers/components/reference), [embed limits](https://docs.discord.com/developers/resources/message#embed-limits), [modal components](https://docs.discord.com/developers/components/using-modal-components), [interaction responses](https://docs.discord.com/developers/interactions/receiving-and-responding). Payload tests validate local output; live Discord posts require authorized credentials and are recorded separately.
