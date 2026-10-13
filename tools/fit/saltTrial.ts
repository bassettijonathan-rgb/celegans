/**
 * Salt steering trial (DESIGN.md 8.3, V3): a settled crawling worm, copied,
 * with a salt spot placed beside it to the left in one copy and to the right
 * in the other, spotted as in the plate assays (10 µl of 2.5 M, 14 h before;
 * Pierce-Shimomura et al. 1999 ≈). Measures how far each copy turns.
 */
import { NODES } from '../../src/sim/body';
import { createWorld, placeSalt, saltAtNose, setMedium, step, type Brain, type World } from '../../src/sim/world';

/** The assays' salt spot: µmol, and how long before the worm it was spotted (ms). */
export const ASSAY_SPOT = { umol: 25, ageMs: 14 * 3600_000 } as const;

function centroid(w: World): [number, number] {
  let x = 0;
  let y = 0;
  for (let i = 0; i < NODES; i++) {
    x += w.body.x[i]!;
    y += w.body.y[i]!;
  }
  return [x / NODES, y / NODES];
}

export interface SaltTrial {
  /** Turn (radians, counter-clockwise positive) with the salt on the left, and on the right. */
  left: number;
  right: number;
  /** Mean turn towards the salt: (left − right) / 2. */
  towards: number;
  /** How much closer to the spot the worm ended, µm (mean of both copies). */
  closer: number;
  /** Salt at the nose at the start, mM. */
  c0: number;
}

/** Signed angle from direction a to direction b, radians in (−π, π]. */
function angle(a: [number, number], b: [number, number]): number {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
}

/**
 * Settles a worm for SETTLE_MS, takes its direction of travel over the last
 * HEADING_MS, then runs both copies `ms` with the spot `distance` µm to its
 * side; the final direction is its travel over the last HEADING_MS.
 */
const SETTLE_MS = 4000;
const HEADING_MS = 4000;
export function saltTrial(b: Brain, seed: number, ms: number, distance: number): SaltTrial {
  const w = createWorld(seed, b);
  setMedium(w, 1);
  for (let k = 0; k < SETTLE_MS - HEADING_MS; k++) step(w, b);
  const p0 = centroid(w);
  for (let k = 0; k < HEADING_MS; k++) step(w, b);
  const p1 = centroid(w);
  const d0: [number, number] = [p1[0] - p0[0], p1[1] - p0[1]];
  const n = Math.hypot(...d0) || 1;
  const left: [number, number] = [-d0[1] / n, d0[0] / n];
  const run = (side: 1 | -1) => {
    const c = structuredClone(w);
    const spot: [number, number] = [p1[0] + side * distance * left[0], p1[1] + side * distance * left[1]];
    placeSalt(c, spot[0], spot[1], ASSAY_SPOT.umol, ASSAY_SPOT.ageMs);
    const c0 = saltAtNose(c);
    for (let k = 0; k < ms - HEADING_MS; k++) step(c, b);
    const q0 = centroid(c);
    for (let k = 0; k < HEADING_MS; k++) step(c, b);
    const q1 = centroid(c);
    const turn = angle(d0, [q1[0] - q0[0], q1[1] - q0[1]]);
    const closer = Math.hypot(p1[0] - spot[0], p1[1] - spot[1]) - Math.hypot(q1[0] - spot[0], q1[1] - spot[1]);
    return { turn, closer, c0 };
  };
  const l = run(1);
  const r = run(-1);
  return { left: l.turn, right: r.turn, towards: (l.turn - r.turn) / 2, closer: (l.closer + r.closer) / 2, c0: l.c0 };
}
