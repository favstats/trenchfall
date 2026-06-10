# TRENCHFALL

Browser FPS trench defense, now structured as a small Vite/Three.js project.

## Development

```sh
npm install
npm run dev
```

Then open the localhost URL Vite prints.

## Build

```sh
npm run build
npm run preview
```

The production site is emitted to `dist/`.

## Modes
- **New Campaign**, escort the last convoy out of Greyfield across eight hundred
  kilometres of procedurally generated dead country. Companions with faces, names,
  and wishes; camps, heirlooms, dilemmas; permadeath; multiple endings.
- **The Bastion**, hold one wall against endless nights. Artillery, a command net,
  helicopter resupply, casualties you can still save.
- **Legacy** persists between every run, both modes feed it.

`campaign.html`, `skirmish.html`, and `index-classic.html` are preserved static legacy files.

## Project Layout

- `index.html` is the DOM shell.
- `src/main.js` contains the game runtime.
- `src/styles/trenchfall.css` contains the game UI and HUD styling.
- `src/audio/sfxManifest.js` maps logical SFX banks to audio assets.
- `public/audio/kenney/` contains a curated CC0 Kenney audio subset.

## Audio

Gunshots remain synthesized because they fit the game well. Footsteps, UI actions,
reload handling, knife sounds, physical impacts, digging, and build sounds use decoded
Web Audio buffers from the Kenney CC0 packs in `public/audio/kenney/`.

## Hosting
Run `npm run build` and host the `dist/` folder on any static host. For GitHub Pages,
publish `dist/` rather than the repository root.
