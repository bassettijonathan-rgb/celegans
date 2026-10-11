/**
 * The motor system's link between cells and body (DESIGN.md sections 4.4, 5
 * and 6.4): muscle cells turn their calcium into contraction, and motor
 * neurons feel the bending of the body near them (proprioception).
 *
 * Nothing here makes a rhythm. Whether the body undulates is up to the wiring,
 * the fitted strengths (M3b) and the switchable rhythm mechanisms (D8).
 */
import { NODES, SEGMENT_LENGTH, BODY_LENGTH } from './body';
import { NEURON_COUNT, connectome, type Cell } from './connectome';
import { MUSCLE_COUNT } from './muscles';
import type { Network } from './neurons';

/**
 * Where a neuron's soma sits along the body, as a fraction from nose (0) to
 * tail (1), from its VirtualWorm position. The nose and tail tips lie a little
 * beyond the first and last somata (25 and 30 µm, as in the brain view).
 * VirtualWorm's body is about 0.8 mm long; only the fraction is used.
 */
const somaYs = connectome.cells.slice(0, NEURON_COUNT).map((c) => c.soma![1]);
const NOSE_Y = Math.min(...somaYs) - 25;
const TAIL_Y = Math.max(...somaYs) + 30;
export function bodyFraction(cell: Cell): number {
  if (!cell.soma) throw new Error(`${cell.name} has no soma position`);
  return (cell.soma[1] - NOSE_Y) / (TAIL_Y - NOSE_Y);
}

/**
 * Muscle calcium follows the cell's drive (its graded "release") with time
 * constant MUSCLE_TAU, and contraction is that calcium (0 to 1). 50 ms is a
 * guess of the right order for body-wall muscle calcium transients; it is
 * not from a measurement and M3b may fit it.
 */
export const MUSCLE_TAU = 50;

/** Advances each muscle's activation (calcium) towards its drive over dt ms. */
export function stepMuscleCalcium(net: Network, v: Float64Array, activation: Float64Array, dt: number): void {
  const k = 1 - Math.exp(-dt / MUSCLE_TAU);
  const beta = net.params.beta;
  for (let m = 0; m < MUSCLE_COUNT; m++) {
    const i = NEURON_COUNT + m;
    const drive = 1 / (1 + Math.exp(-beta * (v[i]! - net.vTh[i]!)));
    activation[m] = activation[m]! + k * (drive - activation[m]!);
  }
}

/**
 * One class of stretch-sensitive neurons (DESIGN.md section 4.4). Each cell
 * gets a current `gain · side · κL` where κ is the body's curvature at its
 * soma position shifted by `offset` (a fraction of the body; positive is
 * towards the tail) and side is +1 for dorsal cells, −1 for ventral, so a
 * positive gain excites a cell when its own side is bent concave.
 * Wen et al. 2012 ≈ found B-type motor neurons sense bending next to them;
 * which side (anterior or posterior) and how strongly are left to the fit.
 */
export interface Proprioceptor {
  /** Anatomical class, e.g. 'VB'. */
  cls: string;
  /** pA per unit of κ·L (body lengths of curvature). */
  gain: number;
  offset: number;
}

/**
 * The classes DESIGN.md section 4.4 names. Gains are 0 (off) until fitted:
 * nothing here is measured yet.
 */
export const DEFAULT_PROPRIOCEPTION: Proprioceptor[] = [
  { cls: 'DB', gain: 0, offset: 0 },
  { cls: 'VB', gain: 0, offset: 0 },
  { cls: 'DA', gain: 0, offset: 0 },
  { cls: 'VA', gain: 0, offset: 0 },
  { cls: 'SMD', gain: 0, offset: 0 },
];

/** Which side a cell is on: +1 dorsal, −1 ventral, from its name (DB, SMDD… dorsal; VB, SMDV… ventral). */
export function cellSide(cell: Cell): number {
  if (/^(D[ABD]\d|SMDD|RMDD|SMBD|RMED)/.test(cell.name)) return 1;
  if (/^(V[ABD]\d|SMDV|RMDV|SMBV|RMEV)/.test(cell.name)) return -1;
  return 0;
}

/** The sensing cells, resolved once: cell index, side, node index read, gain. */
export interface ProprioMap {
  cell: Int32Array;
  side: Float64Array;
  node: Int32Array;
  gain: Float64Array;
}

export function buildProprioception(receptors: Proprioceptor[]): ProprioMap {
  const cell: number[] = [];
  const side: number[] = [];
  const node: number[] = [];
  const gain: number[] = [];
  for (const r of receptors) {
    for (let i = 0; i < NEURON_COUNT; i++) {
      const c = connectome.cells[i]!;
      if (c.class !== r.cls) continue;
      const sd = cellSide(c);
      if (sd === 0) throw new Error(`${c.name}: no dorsal or ventral side`);
      const u = Math.min(1, Math.max(0, bodyFraction(c) + r.offset));
      // Turning angles live on interior nodes only.
      node.push(Math.min(NODES - 2, Math.max(1, Math.round(u * (NODES - 1)))));
      cell.push(i);
      side.push(sd);
      gain.push(r.gain);
    }
  }
  return {
    cell: Int32Array.from(cell),
    side: Float64Array.from(side),
    node: Int32Array.from(node),
    gain: Float64Array.from(gain),
  };
}

/**
 * Sets the proprioceptive current of every sensing cell from the body's
 * turning angles (radians per node), clearing `sense` for all other cells.
 */
export function senseProprioception(map: ProprioMap, turning: Float64Array, sense: Float64Array): void {
  sense.fill(0);
  for (let k = 0; k < map.cell.length; k++) {
    const kappaL = (turning[map.node[k]!]! / SEGMENT_LENGTH) * BODY_LENGTH;
    sense[map.cell[k]!] = sense[map.cell[k]!]! + map.gain[k]! * map.side[k]! * kappaL;
  }
}
