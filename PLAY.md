# TRENCHFALL Quick Start

## Main Game

```sh
npm install
npm run dev
```

Before committing: `npm run check` (syntax + parser-verified load-order guard).

Open the localhost URL printed by Vite.

## Production Build

```sh
npm run build
npm run preview
```

Deploy the generated `dist/` folder.

## Legacy Files

`campaign.html`, `skirmish.html`, and `index-classic.html` are preserved static builds.
The current main game is `index.html` plus the modules under `src/`.
