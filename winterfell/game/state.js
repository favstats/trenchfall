// state.js — scenario config, timers, tallies, win/lose flags. Plain data the
// other systems read and mutate. No three.js here.
export class GameState {
  constructor(fidelity = 'high') {
    this.fidelity = fidelity;
    this.time = 0;
    this.phase = 'battle';      // 'battle' | 'won' | 'lost'

    // tallies
    this.kills = 0;             // undead destroyed
    this.menLost = 0;          // British soldiers killed
    this.menRisen = 0;         // of those, how many rose against you
    this.menRemaining = 0;

    // wave / objective (slice 1: survive the assault)
    this.waveDuration = 150;    // seconds to hold
    this.hordeBroken = 60;     // win early if living horde falls below this

    // Dig-in command economy: trickle supply plus bounty for kills, spent on
    // trenches, wire, sandbags, and mustering fresh riflemen.
    this.supply = 185;
    this.supplyMax = 420;
    this.supplyRate = 5.4;
    this.costs = {
      trench: 42,
      wire: 28,
      sandbag: 32,
      nest: 74,
      tower: 88,
      pit: 36,
      floodlight: 58,
      ammo: 52,
      bunker: 110,
      brazier: 46,
      recruit: 65,
      barracks: 120,   // base: auto-musters squads
      depot: 95,       // base: boosts supply income
      lab: 130,        // base: generates research
    };
    this.buildMode = null;     // null | field-work kind
    this.gateHp = 1;
    this.works = 0;
    this.noise = 0;          // gunfire, explosions, and industry draw the dead
    this.threat = 0;         // wave pressure shown to the player
    this.engineersRepairing = 0;
    this.possession = null;    // label of directly controlled soldier, if any
    this.recruits = 0;

    // limited fire support
    this.charges = { mortar: 1 };
  }

  get held() { return this.phase === 'won'; }
  get timeLeft() { return Math.max(0, this.waveDuration - this.time); }
}

// horde size cap per fidelity tier (live near/mid agents; far field is impostors)
// live (detailed, instanced) cap per tier; the far impostor crowd still renders the
// distant mass, so the on-screen tide stays huge while we cut the heavy vertex load
export const HORDE_CAP = { low: 1400, medium: 2600, high: 4200 };
