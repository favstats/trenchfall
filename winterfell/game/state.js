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
    this.supply = 115;
    this.supplyMax = 260;
    this.supplyRate = 4.2;
    this.costs = {
      trench: 42,
      wire: 28,
      sandbag: 32,
      nest: 74,
      tower: 88,
      pit: 36,
      floodlight: 58,
      ammo: 52,
      recruit: 65,
    };
    this.buildMode = null;     // null | field-work kind
    this.gateHp = 1;
    this.works = 0;
    this.possession = null;    // label of directly controlled soldier, if any
    this.recruits = 0;

    // limited fire support
    this.charges = { mortar: 1 };
  }

  get held() { return this.phase === 'won'; }
  get timeLeft() { return Math.max(0, this.waveDuration - this.time); }
}

// horde size cap per fidelity tier (live near/mid agents; far field is impostors)
export const HORDE_CAP = { low: 1600, medium: 4000, high: 6500 };
