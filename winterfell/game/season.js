// season.js — the Long Night isn't always winter. A season is chosen at boot and
// recolours the ground, treeline, mountains, atmosphere and toggles snowfall.
export const SEASONS = {
  winter: { ground: 0xdfe7f1, kill: 0xb9c2cf, tree: 0x0e171c, cap: 0xe9f1fb, capWhite: true, snow: true,
    bg: 0x07101d, fog: 0x07101d, sun: 0xd4e4ff, sunI: 2.0, hemiSky: 0xaec7ea, hemiGnd: 0x070b10, hemiI: 0.55 },
  spring: { ground: 0x46562f, kill: 0x5b4a30, tree: 0x274e22, cap: 0x3a4e2c, capWhite: false, snow: false,
    bg: 0x0c1622, fog: 0x14222c, sun: 0xffe9c4, sunI: 1.95, hemiSky: 0x9fb6cc, hemiGnd: 0x16200f, hemiI: 0.72 },
  summer: { ground: 0x55632f, kill: 0x6a5736, tree: 0x1f3a16, cap: 0x33491f, capWhite: false, snow: false,
    bg: 0x0f1d28, fog: 0x1a2c30, sun: 0xfff1d0, sunI: 2.15, hemiSky: 0xa9c0cc, hemiGnd: 0x1b2612, hemiI: 0.8 },
  autumn: { ground: 0x6f5a32, kill: 0x5e4324, tree: 0x6a3a18, cap: 0x57391f, capWhite: false, snow: false,
    bg: 0x121620, fog: 0x231b16, sun: 0xffd49a, sunI: 1.95, hemiSky: 0xc6ad8a, hemiGnd: 0x20160a, hemiI: 0.7 },
};

let current = SEASONS.winter;
export function setSeason(name) {
  current = SEASONS[name] ? Object.assign({ name }, SEASONS[name]) : Object.assign({ name: 'winter' }, SEASONS.winter);
  return current;
}
export function season() { return current; }
// a deterministic-ish pick when none is forced
export function pickSeason() {
  const names = Object.keys(SEASONS);
  return names[(Math.random() * names.length) | 0];
}
