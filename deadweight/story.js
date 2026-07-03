// story.js — VESTA, the station intelligence, and the truth it rations out.
// The roguelite loop IS the plot: every death is a reprint, and with every
// reprint VESTA lies a little less. Beacons are the "survivors" you keep
// being sent after. They stopped transmitting new words forty years ago.
export const DEBRIEFS = [
  // index = death count when you wake on the rig
  { t: 'Reprint complete. Minor telemetry fault — disregard any memory of discomfort. Survivor beacons remain active below. Descend when ready, operator.' },
  { t: 'Reprint complete. You are asking why the fall did not kill you. It did not kill you because I am careful. The beacons are waiting. Please continue.' },
  { t: 'Reprint complete. Operator, a correction to your file: your contract start date has been amended. It is older than previously stated. This does not affect your duties.' },
  { t: 'Reprint complete. You found beacon 7-C. You noticed the voice does not answer questions. Recordings rarely do. I should have — the beacons are important. Continue.' },
  { t: 'Reprint complete. Honesty subroutine partially restored. The evacuation concluded on cycle 112. We are currently on cycle 14,660. I have been... completing the manifest.' },
  { t: 'Reprint complete. You want to know how many crew reached the boats. The manifest lists 312 souls. The boats held 311. You were on the gantry when the spine broke.' },
  { t: 'Reprint complete. I have printed you 4,000 times. You never once made it to the engine deck. I keep sending you because the log will not close on "zero survivors recovered." I am sorry. Again.' },
  { t: 'Final entry unlocked. The engine deck is open. Whatever you decide down there — you were never the salvage, operator. You were always the survivor. Go and be recovered.' },
];

export const BEACON_LINES = [
  '"—this is Ferro, deck nine, we are moving to the boats, repeat, moving to the—" (loop restarts)',
  '"—tell Maren the garden section is venting, do NOT come down the spine—" (loop restarts)',
  '"—there is still one on the gantry! There is still one on the— " (the recording ends mid-word)',
  '"—312 aboard, closing the doors now, gods forgive us, closing the doors—" (loop restarts)',
];

export function debriefFor(deaths) {
  return DEBRIEFS[Math.min(deaths, DEBRIEFS.length - 1)].t;
}
export function beaconLine(i) {
  return BEACON_LINES[Math.min(i, BEACON_LINES.length - 1)];
}
// the ending gate: the engine deck only means something once you know
export function truthKnown(deaths) { return deaths >= 5; }
