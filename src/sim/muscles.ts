/**
 * Body-wall muscles as actuators (DESIGN.md section 6.4).
 *
 * 95 cells in four quadrants: dorsal-left and dorsal-right, ventral-left and
 * ventral-right. Each has 24 cells except ventral-left, where MVL24 does not
 * exist (Cook et al. 2019). In 2D, left and right muscles on the same side add
 * to the same bend.
 *
 * In M2 a muscle is an actuator: its activation (0 to 1) sets a preferred
 * curvature of the stretch of body it covers, and the elastic rod
 * (mechanics.ts) does the rest. The muscle cell's own voltage and calcium
 * arrive with the motor circuit in M3.
 */
import { BODY_LENGTH, NODES, SEGMENT_LENGTH } from './body';
import { NEURON_COUNT, connectome } from './connectome';

export const MUSCLE_COUNT = connectome.cells.length - NEURON_COUNT;

export interface Muscle {
  /** Index into `connectome.cells`. */
  cell: number;
  /** +1 dorsal, −1 ventral. */
  side: number;
  /** Arc length fraction (0 = nose, 1 = tail) of the middle of the muscle. */
  centre: number;
}

/**
 * Muscles run from just behind the nose to near the tail (WormAtlas, Altun &
 * Hall ≈): here the 24 positions of a quadrant are spread evenly over
 * 5–95% of the body. Not a measured map; each cell's real extent varies.
 */
const FIRST = 0.05;
const LAST = 0.95;
/** Spacing of neighbouring muscle positions in a quadrant, as a fraction of the body. */
export const MUSCLE_PITCH = (LAST - FIRST) / 24;

/**
 * Each cell is a spindle about twice the spacing long, so neighbours in a
 * quadrant overlap by half, like the two staggered rows of the real worm.
 * Its pull falls off linearly from its middle to its ends (a hat), so a row
 * of equally active muscles bends the body evenly.
 */
export const muscles: Muscle[] = connectome.cells.slice(NEURON_COUNT).map((c, i) => {
  if (c.kind !== 'muscle' || c.index === undefined) throw new Error(`Cell ${c.name} is not a numbered muscle`);
  return {
    cell: NEURON_COUNT + i,
    side: c.name.startsWith('MD') ? 1 : -1,
    centre: FIRST + (c.index - 0.5) * MUSCLE_PITCH,
  };
});

/** How much muscle m pulls at arc length fraction u (0 to 1). */
export function muscleWeight(m: Muscle, u: number): number {
  return Math.max(0, 1 - Math.abs(u - m.centre) / MUSCLE_PITCH);
}

/**
 * Largest active curvature, reached when one side is fully contracted and
 * the other relaxed: κ·L = 10. A guess, not a measurement: crawling bends
 * reach κ·L ≈ 5–8 and omega turns more (Stephens et al. 2008 ≈). M3 replaces
 * it with fitted muscle strengths.
 */
export const MAX_ACTIVE_CURVATURE = 10 / BODY_LENGTH;

/**
 * Weight of each muscle at each interior node, precomputed:
 * nodeWeights[j * MUSCLE_COUNT + m].
 */
const nodeWeights = (() => {
  const w = new Float64Array(NODES * MUSCLE_COUNT);
  for (let j = 1; j < NODES - 1; j++) {
    const u = j / (NODES - 1);
    for (let m = 0; m < MUSCLE_COUNT; m++) w[j * MUSCLE_COUNT + m] = muscleWeight(muscles[m]!, u);
  }
  return w;
})();

/**
 * Preferred turning angle at each node from the muscle activations. Dorsal
 * contraction bends the body towards its dorsal side, which is drawn on the
 * left of the direction of travel (counter-clockwise, positive angles).
 * Left and right muscles of a side each give half of that side's pull.
 */
export function activeTurning(activation: Float64Array, out: Float64Array): void {
  out[0] = 0;
  out[NODES - 1] = 0;
  for (let j = 1; j < NODES - 1; j++) {
    let pull = 0;
    for (let m = 0; m < MUSCLE_COUNT; m++) {
      const w = nodeWeights[j * MUSCLE_COUNT + m]!;
      if (w > 0) pull += 0.5 * muscles[m]!.side * w * activation[m]!;
    }
    out[j] = MAX_ACTIVE_CURVATURE * pull * SEGMENT_LENGTH;
  }
}
