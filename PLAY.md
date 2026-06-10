# TRENCHFALL

Two self-contained games, no build step, no install:

| File | What it is |
|---|---|
| `index.html` | **THE LONG ROAD**, the main game (campaign + The Bastion). Canonical file. |
| `skirmish.html` | **SKIRMISH**, the arcade wave-defense mode at the depot. |
| `index-classic.html` | The original pre-overhaul build, kept as a museum piece. |

## How to play
Double-click either HTML file. That's it. (Internet needed once for the three.js CDN + fonts.)

For the smoothest experience use Chrome/Edge/Safari on a machine with any discrete or Apple-silicon GPU.

## Why two files instead of a shared engine?
Single-file games are deliberately the distribution format here: they double-click locally,
upload as-is to itch.io / any static host, and embed anywhere. The two files share their
engine code verbatim; **`campaign.html` is the canonical game** going forward, and new
feature work lands there. `index.html` is a frozen arcade variant.

If this ever heads to Steam: wrap `campaign.html` with Tauri (tiny) or Electron (easy),
both of which take the file unchanged. At that point a `src/` split + bundler makes sense,
and the inline script is already structured in clean sections (engine / world / combat /
campaign) ready to be cut along those lines.

## Testing
Headless verification used throughout development (macOS):
```
"Google Chrome" --headless --use-angle=swiftshader --allow-file-access-from-files \
  --virtual-time-budget=20000 --screenshot=shot.png campaign.html
```
The games expose debug hooks on `window` (`startCampaign`, `CAMP`, `spawnZombie`,
`modifyTerrain`, ...) so an iframe harness can drive full gameplay flows headlessly.
