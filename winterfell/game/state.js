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

    // limited fire support
    this.charges = { mortar: 1, reserve: 1 };
  }

  get held() { return this.phase === 'won'; }
  get timeLeft() { return Math.max(0, this.waveDuration - this.time); }
}

// horde size cap per fidelity tier (live near/mid agents; far field is impostors)
export const HORDE_CAP = { low: 900, medium: 2200, high: 4000 };
