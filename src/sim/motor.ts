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
import type { ProprioFit } from './fit';
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
 * constant MUSCLE_TAU, and contraction is that calcium (0 to 1). 100 ms is
 * the muscle time constant of Boyle, Berri & Cohen 2012 (checked in their
 * published code, `T_muscle = 0.1` s).
 */
export const MUSCLE_TAU = 100;

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
 * Stretch-sensitive neurons (DESIGN.md section 4.4). Each cell of a class in
 * the fit gets a signed conductance `gain · side · mean κL` (nS) over its
 * receptive field: positive opens a channel to the excitatory reversal,
 * negative one to the inhibitory reversal, so sensing can never push a cell
 * beyond the reversal potentials. The field runs from the soma position plus
 * `offset` to that plus `extent` (fractions of the body, positive towards the
 * tail; extent 0 reads one point). Side is +1
 * for dorsal cells and −1 for ventral, so a positive gain excites a cell when
 * its own side is bent concave. Wen et al. 2012 ≈ found B-type motor neurons
 * sense bending near them; Boyle, Berri & Cohen 2012 gave each B unit a field
 * reaching half a body length behind it. Gain, offset and extent are fitted.
 */

/** Which side a cell is on: +1 dorsal, −1 ventral, from its name (DB, SMDD… dorsal; VB, SMDV… ventral). */
export function cellSide(cell: Cell): number {
  if (/^(D[ABD]\d|SMDD|RMDD|SMBD|RMED)/.test(cell.name)) return 1;
  if (/^(V[ABD]\d|SMDV|RMDV|SMBV|RMEV)/.test(cell.name)) return -1;
  return 0;
}

/** The sensing cells, resolved once: cell index, side, the first and last node read, gain. */
export interface ProprioMap {
  cell: Int32Array;
  side: Float64Array;
  from: Int32Array;
  to: Int32Array;
  gain: Float64Array;
}

/** Interior node nearest to body fraction u (turning angles live on interior nodes only). */
function nodeAt(u: number): number {
  return Math.min(NODES - 2, Math.max(1, Math.round(Math.min(1, Math.max(0, u)) * (NODES - 1))));
}

export function buildProprioception(receptors: ProprioFit[]): ProprioMap {
  const cell: number[] = [];
  const side: number[] = [];
  const from: number[] = [];
  const to: number[] = [];
  const gain: number[] = [];
  for (const r of receptors) {
    if (r.gain === 0) continue;
    for (let i = 0; i < NEURON_COUNT; i++) {
      const c = connectome.cells[i]!;
      if (c.class !== r.cls) continue;
      const sd = cellSide(c);
      if (sd === 0) throw new Error(`${c.name}: no dorsal or ventral side`);
      const u = bodyFraction(c) + r.offset;
      const a = nodeAt(u);
      const b = nodeAt(u + Math.max(0, r.extent));
      cell.push(i);
      side.push(sd);
      from.push(Math.min(a, b));
      to.push(Math.max(a, b));
      gain.push(r.gain);
    }
  }
  return {
    cell: Int32Array.from(cell),
    side: Float64Array.from(side),
    from: Int32Array.from(from),
    to: Int32Array.from(to),
    gain: Float64Array.from(gain),
  };
}

/**
 * Sets the proprioceptive conductance of every sensing cell from the body's
 * turning angles (radians per node), clearing `sense` for all other cells.
 */
export function senseProprioception(map: ProprioMap, turning: Float64Array, sense: Float64Array): void {
  sense.fill(0);
  for (let k = 0; k < map.cell.length; k++) {
    let sum = 0;
    for (let j = map.from[k]!; j <= map.to[k]!; j++) sum += turning[j]!;
    const kappaL = (sum / (map.to[k]! - map.from[k]! + 1) / SEGMENT_LENGTH) * BODY_LENGTH;
    sense[map.cell[k]!] = sense[map.cell[k]!]! + map.gain[k]! * map.side[k]! * kappaL;
  }
}
