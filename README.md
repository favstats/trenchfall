# THE LONG ROAD

A single-file browser game. No build, no install, no server code.

**Play:** open `index.html`, or visit the GitHub Pages URL once published.

## Modes
- **New Campaign**, escort the last convoy out of Greyfield across eight hundred
  kilometres of procedurally generated dead country. Companions with faces, names,
  and wishes; camps, heirlooms, dilemmas; permadeath; multiple endings.
- **The Bastion**, hold one wall against endless nights. Artillery, a command net,
  helicopter resupply, casualties you can still save.
- **Legacy** persists between every run, both modes feed it.

`skirmish.html` is the original wave-defense mode, kept playable.
`index-classic.html` is the first build, kept as a museum piece.

## Tech
Hand-rolled on three.js (CDN): GTAO, PMREM sky lighting, god rays, procedural
terrain/forests/cities, deformable ground, fully synthesized Web Audio.
Everything in one HTML file per mode.

## Hosting
Any static host works. For GitHub Pages: push this folder, then enable
Pages on the main branch root. The `.nojekyll` file is already in place.
