/**
 * The signal propagation experiment of Randi et al. 2023 in the model
 * (DESIGN.md 7.2, 9: V4b): light one neuron of an immobilised worm, record
 * every other neuron's response. Network only: the worms were immobilised,
 * so there is no body and no stretch feedback.
 */
import { readFileSync } from 'node:fs';
import { cellIndex } from '../../src/sim/connectome';
import { createNeuronState, stepNeurons, type Network } from '../../src/sim/neurons';

export type Strain = 'wt' | 'unc31';
export interface AtlasPair {
  stim: number;
  resp: number;
  /** Mean ΔF/F of the responder (null where the authors had none). */
  dFF: number | null;
  /** False discovery rate of the response (null: not computed). */
  q: number | null;
  n: number;
  heldOut: boolean;
}

let raw: { strains: Record<Strain, [string, string, number | null, number | null, number, number][]> } | undefined;
export function atlasPairs(strain: Strain, half: 'fit' | 'heldOut' | 'all'): AtlasPair[] {
  raw ??= JSON.parse(readFileSync(new URL('../../src/data/atlas.json', import.meta.url), 'utf8'));
  return raw!.strains[strain]
    .map(([s, r, dFF, q, n, h]) => ({ stim: cellIndex(s), resp: cellIndex(r), dFF, q, n, heldOut: h === 1 }))
    .filter((p) => half === 'all' || (half === 'heldOut') === p.heldOut);
}

/** Light-gated channel opened in the stimulated cell, nS (guess: enough to depolarise a cell by tens of mV, as the GUR-3/PRDX-2 light did in Randi 2023 ≈). */
export const STIM_NS = 2;
/** Light pulse length, ms (Randi 2023 ≈ used sub-second pulses). */
export const STIM_MS = 500;
/** Response window after light onset, ms. */
export const RESPONSE_MS = 2000;

/**
 * Response of every neuron to lighting `stim`: the mean voltage change over
 * RESPONSE_MS against the same network unlit (mV). `rest` is that unlit run's
 * mean voltages, from `unlit(net)`.
 */
export function respond(net: Network, stim: number, rest: Float64Array): Float64Array {
  const st = createNeuronState(net);
  const sum = new Float64Array(net.n);
  for (let k = 0; k < RESPONSE_MS; k++) {
    st.sense!.fill(0);
    if (k < STIM_MS) st.sense![stim] = STIM_NS;
    stepNeurons(net, st, 1);
    for (let i = 0; i < net.n; i++) sum[i] = sum[i]! + st.v[i]!;
  }
  return Float64Array.from(sum, (s, i) => s / RESPONSE_MS - rest[i]!);
}

export function unlit(net: Network): Float64Array {
  const st = createNeuronState(net);
  const sum = new Float64Array(net.n);
  for (let k = 0; k < RESPONSE_MS; k++) {
    st.sense!.fill(0);
    stepNeurons(net, st, 1);
    for (let i = 0; i < net.n; i++) sum[i] = sum[i]! + st.v[i]!;
  }
  return Float64Array.from(sum, (s) => s / RESPONSE_MS);
}

/** Model responses for every pair: ΔV of the responder when its partner is lit. */
export function modelResponses(net: Network, pairs: AtlasPair[]): number[] {
  const rest = unlit(net);
  const byStim = new Map<number, Float64Array>();
  for (const s of [...new Set(pairs.map((p) => p.stim))].sort((a, b) => a - b)) byStim.set(s, respond(net, s, rest));
  return pairs.map((p) => byStim.get(p.stim)![p.resp]!);
}

/** A response counts as present above this, mV (guess: about what GCaMP picks up from a graded cell). */
export const SEEN_MV = 1;

export interface AtlasScore {
  pairs: number;
  /** Pearson correlation of model ΔV with measured ΔF/F over pairs with a measured mean. */
  r: number;
  /** Of the significant responses (q < 0.05): share the model shows (|ΔV| > SEEN_MV) with the right sign. */
  hit: number;
  /** Of the clear non-responses (q > 0.5): share the model leaves quiet. */
  quiet: number;
}

export function scoreAtlas(model: number[], pairs: AtlasPair[]): AtlasScore {
  const xs: number[] = [];
  const ys: number[] = [];
  let sig = 0;
  let hits = 0;
  let non = 0;
  let quiet = 0;
  pairs.forEach((p, k) => {
    const m = model[k]!;
    if (p.dFF !== null) {
      xs.push(m);
      ys.push(p.dFF);
    }
    if (p.q !== null && p.dFF !== null && p.q < 0.05) {
      sig++;
      if (Math.abs(m) > SEEN_MV && Math.sign(m) === Math.sign(p.dFF)) hits++;
    }
    if (p.q !== null && p.q > 0.5) {
      non++;
      if (Math.abs(m) <= SEEN_MV) quiet++;
    }
  });
  return { pairs: pairs.length, r: pearson(xs, ys), hit: sig ? hits / sig : 0, quiet: non ? quiet / non : 0 };
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < n; k++) {
    sxy += (x[k]! - mx) * (y[k]! - my);
    sxx += (x[k]! - mx) ** 2;
    syy += (y[k]! - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}
