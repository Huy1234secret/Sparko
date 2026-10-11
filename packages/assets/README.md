# Sparko owned animation and media library

Fifteen original icons share Sparko yellow (`#FACC15`), geometric forms and a
consistent rounded outline. The four-point smiling spark is Sparko's mascot.
Both website themes have self-contained SVG and geometry-only Lottie JSON.
Discord variants are actual PNG files; the mascot and setup-success also have
actual animated GIFs. The files were authored from new geometry; no CoinSprite
source or third-party artwork is used. Artwork is dedicated under CC0-1.0;
see [LICENSE.assets](./LICENSE.assets).

```tsx
import { AnimatedIcon, getDiscordMedia } from '@sparko/assets';

// A decorative icon beside a label; hover plays once.
<AnimatedIcon name="ticket" size={32} />;
// An intentionally animated hero mascot, bounded to two total plays.
<AnimatedIcon
  name="spark"
  label="Sparko mascot"
  size={96}
  state="active"
  iterations={2}
/>;
// A setup confirmation, animated once where motion is permitted.
<AnimatedIcon name="setup-success" label="Setup complete" state="success" />;
```

`motion` supports `system`, `on` and `off`; OS reduced motion always takes
precedence. `theme` supports `light`, `dark`, and `system`. States are `idle`,
`hover`, `focus`, `active`, `success`, `error`, and `disabled`; controlled states
can be passed from an owning button. Decorative icons have no accessible name;
meaningful standalone icons require a `label`. The wrapper adds no tab stop.
The user motion and theme preferences are application settings passed as props.

Static SVG is available immediately. The JSON and single selected
`lottie-react` player runtime load only after an icon becomes visible and an
interaction or explicit state requests animation. Playback pauses offscreen
and when the document is hidden, and resumes from the paused position. Total
plays are clamped to three. The component removes observers/listeners on
unmount; the player destroys its own animation on unmount. Invalid animation,
import or render failure keeps the static fallback and never blocks controls.

`assetRegistry` records version, ownership, canonical dimensions, byte size,
Unicode fallback, state segments and each export's exact MIME, bytes, dimensions
and URL. Use `getDiscordMedia(id, true)` to select a GIF where supplied, otherwise
a PNG. These are **media attachments**, not Discord emoji IDs. A deployed
Discord adapter must load the exported file or its published HTTPS URL and
attach it as media. Unicode fallback is suitable in a button emoji object
`{ name: getAsset(id).unicodeFallback }`. An application/custom emoji requires
an actual uploaded Discord snowflake ID and a separately validated SDK object.
Discord does not execute the website JSON animation.

## Validation and regeneration

The owned animation profile is deliberately limited to shape layers, no
external or embedded media, no fonts, no expressions, at most 16 KiB per JSON,
24 layers, 60 fps and three seconds. JSON import policy rejects scripts,
unsafe links and prototype keys. This profile validator is not a general
trusted-media upload service; API upload checks must still run separately.

```sh
pnpm --filter @sparko/assets typecheck
pnpm exec vitest run packages/assets/src/registry.test.ts
# Inspect the real library, including exported Discord media:
pnpm --filter @sparko/assets dev:gallery
# In a second terminal, using an installed Playwright browser:
node packages/assets/tools/verify-browser.mjs
# Or use a local Chromium executable:
SPARKO_BROWSER_PATH=/usr/bin/chromium node packages/assets/tools/verify-browser.mjs
# Optional deterministic regeneration (Python 3 and Pillow needed):
python3 packages/assets/tools/generate.py
```

Package compatibility was checked against the official npm metadata and
[the lottie-react repository](https://github.com/Gamote/lottie-react) on
11 October 2026. Version 3.1.2 supports React 18.2/19 and uses the v3 named
`LottieLight`, `src`, `lottieRef`, and `subscriptions` API. The wrapper disables
expressions and uses the small shape-only build. The direct documentation
site returned HTTP 403 in the build environment; the official repository
README and published TypeScript declarations were checked instead.

Verified locally: package typecheck, lint and 17 Vitest checks passed. A real
Chromium run rendered all 15 JSON animations in both themes without browser
errors, confirmed idle icons keep their static fallback without loading a
player, and confirmed reduced motion removes animation even with the explicit
`on` preference. PNG signatures/dimensions and GIF headers/dimensions/looping
extensions passed; actual GIF frame counts were also decoded with Pillow.
