/**
 * Graded-potential neurons (DESIGN.md section 4.2).
 *
 *   C dV_i/dt = −g_L (V_i − E_L) − Σ_j g_gap,ij (V_i − V_j)
 *               − Σ_j g_syn,ij s_j (V_i − E_ij) + I_ext,i + noise
 *   s_j = 1 / (1 + exp(−β (V_j − V_th,j)))
 *
 * Units: mV, ms, pF, nS, pA (pF·mV/ms = pA = nS·mV).
 *
 * Gap junctions make the system stiff (a well-coupled cell relaxes in well
 * under 1 ms), so each step is backward Euler in V with s taken from the
 * start of the step: a symmetric positive-definite linear system solved by
 * conjugate gradients. Stable at any step; first-order accurate.
 *
 * The cells known to spike or plateau (AWA, AVL, DVB, RMD; DESIGN.md
 * section 4.3) use this graded model until their conductance-based models
 * arrive.
 *
 * From M3 the network also holds the 95 body-wall muscle cells (after the
 * 302 neurons), with the same graded membrane for now: they receive the
 * neuromuscular junctions and their gap junctions, and their "release" is the
 * calcium drive that motor.ts turns into contraction. Muscle membranes with
 * calcium action potentials (Gao & Zhen 2011) replace this when the
 * conductance-based cells arrive.
 */
import { connectome } from './connectome';
import { UNFITTED, biasConductances, chemScale, gapScale, type Fit } from './fit';
import type { Rng } from './rng';

/**
 * Model parameters. Every value carries where it comes from. Values marked ≈
 * are from Kunert, Shlizerman & Kutz 2014 (who took them from Wicks, Roehrig
 * & Rankin 1996 and Varshney 2011) and still have to be checked against the
 * paper; strengths and ambiguous signs are fitted later (DESIGN.md section 7).
 */
export interface NeuronParams {
  /** Membrane capacitance, pF (Kunert 2014 ≈). */
  C: number;
  /** Leak conductance, nS (Kunert 2014 ≈: 10 pS). */
  gLeak: number;
  /** Leak reversal, mV (Kunert 2014 ≈). */
  eLeak: number;
  /** Conductance of one gap junction, nS (Kunert 2014 ≈: 100 pS). */
  gGapPerSynapse: number;
  /** Conductance of one chemical synapse, fully open, nS (Kunert 2014 ≈: 100 pS). */
  gSynPerSynapse: number;
  /** Excitatory and inhibitory reversal potentials, mV (Kunert 2014 ≈). */
  eExc: number;
  eInh: number;
  /** Slope of graded release, 1/mV (Wicks 1996; Kunert 2014 ≈). */
  beta: number;
  /**
   * Excitatory share for `ambiguous` edges, in [0, 1]: 0.5 puts their reversal
   * half way between eInh and eExc. A neutral default until fitted.
   */
  ambiguousMix: number;
  /** Standard deviation of the noise current, pA per √ms (channel noise; 0 = off). */
  noise: number;
}

export const DEFAULT_PARAMS: NeuronParams = {
  C: 1,
  gLeak: 0.01,
  eLeak: -35,
  gGapPerSynapse: 0.1,
  gSynPerSynapse: 0.1,
  eExc: 0,
  eInh: -48,
  beta: 0.125,
  ambiguousMix: 0.5,
  noise: 0,
};

/**
 * The network built from the connectome for given parameters: sparse
 * matrices as typed arrays. Derived data, rebuilt on load; not saved.
 */
export interface Network {
  n: number;
  params: NeuronParams;
  /** Incoming chemical synapses per post cell (CSR): pre index, conductance, reversal. */
  synStart: Int32Array;
  synPre: Int32Array;
  synG: Float64Array;
  synE: Float64Array;
  /** Gap junctions per cell (CSR, both directions): partner and conductance. */
  gapStart: Int32Array;
  gapOther: Int32Array;
  gapG: Float64Array;
  /** Release threshold per neuron: its voltage at equilibrium with every synapse half open (Kunert 2014). */
  vTh: Float64Array;
  /**
   * Tonic conductance per cell from a fit, nS, signed: positive to eExc,
   * negative to eInh (0 when unfitted). A conductance, not a current, so it
   * can never push a cell beyond the reversal potentials.
   */
  bias: Float64Array;
}

/**
 * Builds the network of all 302 neurons and 95 muscle cells from the
 * connectome, with strengths scaled and tonic currents set by a fit
 * (DESIGN.md section 7.1).
 */
export function buildNetwork(params: NeuronParams = DEFAULT_PARAMS, fit: Fit = UNFITTED): Network {
  const n = connectome.cells.length;
  const { chemical, gap, sectionsPerSynapse } = connectome;
  const net = networkFromEdges(
    n,
    chemical.map((e) => ({
      pre: e.pre,
      post: e.post,
      synapses: (e.size / sectionsPerSynapse.chemical) * chemScale(fit, e.pre, e.post),
      sign: e.sign,
    })),
    gap.map((e) => ({ a: e.a, b: e.b, synapses: (e.size / sectionsPerSynapse.gap) * gapScale(fit, e.a, e.b) })),
    params,
  );
  net.bias.set(biasConductances(fit));
  return net;
}

/**
 * Builds a network from explicit edges, with strengths in synapse counts.
 * `buildNetwork` uses it for the worm; tests use it for small circuits with
 * known answers.
 */
export function networkFromEdges(
  n: number,
  chemical: { pre: number; post: number; synapses: number; sign: number }[],
  gap: { a: number; b: number; synapses: number }[],
  params: NeuronParams = DEFAULT_PARAMS,
): Network {
  const eOf = (sign: number) =>
    sign > 0 ? params.eExc : sign < 0 ? params.eInh : params.eInh + params.ambiguousMix * (params.eExc - params.eInh);

  const syn = [...chemical].sort((a, b) => a.post - b.post || a.pre - b.pre);
  const synStart = new Int32Array(n + 1);
  for (const e of syn) synStart[e.post + 1]!++;
  for (let i = 0; i < n; i++) synStart[i + 1]! += synStart[i]!;
  const synPre = Int32Array.from(syn, (e) => e.pre);
  const synG = Float64Array.from(syn, (e) => params.gSynPerSynapse * e.synapses);
  const synE = Float64Array.from(syn, (e) => eOf(e.sign));

  const pairs: [number, number, number][] = [];
  for (const e of gap) {
    const g = params.gGapPerSynapse * e.synapses;
    pairs.push([e.a, e.b, g], [e.b, e.a, g]);
  }
  pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const gapStart = new Int32Array(n + 1);
  for (const [a] of pairs) gapStart[a + 1]!++;
  for (let i = 0; i < n; i++) gapStart[i + 1]! += gapStart[i]!;
  const gapOther = Int32Array.from(pairs, (p) => p[1]);
  const gapG = Float64Array.from(pairs, (p) => p[2]);

  const net: Network = {
    n,
    params,
    synStart,
    synPre,
    synG,
    synE,
    gapStart,
    gapOther,
    gapG,
    vTh: new Float64Array(n),
    bias: new Float64Array(n),
  };

  // Equilibrium with s = 1/2 everywhere: a linear system in V (no capacitance term).
  const half = new Float64Array(n).fill(0.5);
  const v = new Float64Array(n).fill(params.eLeak);
  solveImplicit(net, half, 0, v, (i) => params.gLeak * params.eLeak + halfDrive(net, i), v);
  net.vTh.set(v);
  return net;
}

function halfDrive(net: Network, i: number): number {
  let b = 0;
  for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) b += 0.5 * net.synG[k]! * net.synE[k]!;
  return b;
}

/** Graded transmitter release of every cell at voltages v (for a muscle: its calcium drive). */
export function release(net: Network, v: Float64Array, out: Float64Array): void {
  const beta = net.params.beta;
  for (let j = 0; j < net.n; j++) out[j] = 1 / (1 + Math.exp(-beta * (v[j]! - net.vTh[j]!)));
}

/** The neurons' state: plain data, saved with the world. */
export interface NeuronState {
  /** Membrane voltage per cell, mV. */
  v: Float64Array;
  /** Injected current per cell, pA (the lab bench's electrode or light). */
  inject: Float64Array;
  /**
   * Conductance of the cell's own sensory channels, nS, signed like `bias`
   * (proprioception; later touch and salt), set every step. Optional so small
   * test circuits can leave it out.
   */
  sense?: Float64Array;
}

export function createNeuronState(net: Network): NeuronState {
  // V = V_th everywhere is the network's resting state: every synapse is then
  // half open, which is exactly the equilibrium V_th was solved for.
  return { v: Float64Array.from(net.vTh), inject: new Float64Array(net.n), sense: new Float64Array(net.n) };
}

/**
 * Advances the neurons by dt ms. `rng` is needed only when noise is on.
 * `scratch` (length n) avoids allocating per step.
 */
export function stepNeurons(net: Network, state: NeuronState, dt: number, rng?: Rng, scratch?: Float64Array): void {
  const { params, n } = net;
  const s = scratch ?? new Float64Array(n);
  release(net, state.v, s);
  const v0 = state.v;
  const cdt = params.C / dt;
  const noiseScale = params.noise > 0 ? params.noise / Math.sqrt(dt) : 0;
  const noise = new Float64Array(n);
  if (noiseScale > 0) {
    if (!rng) throw new Error('noise needs an rng');
    for (let i = 0; i < n; i++) noise[i] = noiseScale * rng.normal();
  }
  // Tonic and sensory channels: signed conductances (positive to eExc, negative to eInh).
  const tonic = new Float64Array(n);
  for (let i = 0; i < n; i++) tonic[i] = Math.abs(net.bias[i]! + (state.sense?.[i] ?? 0));
  const rhs = (i: number) => {
    const g = net.bias[i]! + (state.sense?.[i] ?? 0);
    let b = cdt * v0[i]! + params.gLeak * params.eLeak + state.inject[i]! + noise[i]!;
    b += g > 0 ? g * params.eExc : -g * params.eInh;
    for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) b += net.synG[k]! * s[net.synPre[k]!]! * net.synE[k]!;
    return b;
  };
  const v = Float64Array.from(v0);
  solveImplicit(net, s, cdt, v, rhs, v, tonic);
  state.v.set(v);
}

/**
 * Solves A v = b with A = diag(cdt + g_L + Σ g_syn s) + gap Laplacian by
 * conjugate gradients, starting from `guess`. A is symmetric positive
 * definite, so CG converges; it runs to a relative residual of 1e-12.
 */
function solveImplicit(
  net: Network,
  s: Float64Array,
  cdt: number,
  guess: Float64Array,
  rhsOf: (i: number) => number,
  out: Float64Array,
  extra?: Float64Array,
): void {
  const { n, params } = net;
  const diag = new Float64Array(n);
  const b = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let d = cdt + params.gLeak + (extra?.[i] ?? 0);
    for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) d += net.synG[k]! * s[net.synPre[k]!]!;
    for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) d += net.gapG[k]!;
    diag[i] = d;
    b[i] = rhsOf(i);
  }
  const apply = (x: Float64Array, y: Float64Array) => {
    for (let i = 0; i < n; i++) {
      let acc = diag[i]! * x[i]!;
      for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) acc -= net.gapG[k]! * x[net.gapOther[k]!]!;
      y[i] = acc;
    }
  };
  const x = Float64Array.from(guess);
  const r = new Float64Array(n);
  const p = new Float64Array(n);
  const ap = new Float64Array(n);
  const z = new Float64Array(n);
  apply(x, ap);
  let bNorm = 0;
  for (let i = 0; i < n; i++) {
    r[i] = b[i]! - ap[i]!;
    z[i] = r[i]! / diag[i]!; // Jacobi preconditioner
    p[i] = z[i]!;
    bNorm += b[i]! * b[i]!;
  }
  let rz = dot(r, z);
  const tol = 1e-24 * Math.max(bNorm, 1e-30);
  for (let iter = 0; iter < 500 && dot(r, r) > tol; iter++) {
    apply(p, ap);
    const alpha = rz / dot(p, ap);
    for (let i = 0; i < n; i++) {
      x[i] = x[i]! + alpha * p[i]!;
      r[i] = r[i]! - alpha * ap[i]!;
      z[i] = r[i]! / diag[i]!;
    }
    const rzNew = dot(r, z);
    const beta = rzNew / rz;
    rz = rzNew;
    for (let i = 0; i < n; i++) p[i] = z[i]! + beta * p[i]!;
  }
  out.set(x);
}

function dot(a: Float64Array, b: Float64Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}
