/**
 * Fitted parameters (DESIGN.md section 7.1). A fit is plain data, saved as
 * JSON in src/data/fits/. Every number in it is fitted, never measured, and
 * is shown as such.
 *
 * Strength of a connection = synapse count × 10^w(class pair), so classes
 * (AVAL and AVAR together, all VB together) share one number, which builds
 * in left/right symmetry (D5). Class pairs not in the fit keep w = 0, the
 * unfitted default of 100 pS per synapse.
 */
import { NEURON_COUNT, connectome, type Cell } from './connectome';

/** One stretch-sensitive class: gain (pA per κ·L), start of its receptive field and its length (fractions of the body, positive towards the tail). */
export interface ProprioFit {
  cls: string;
  gain: number;
  offset: number;
  extent: number;
}

export interface Fit {
  /** Short name, e.g. 'gait-1'. */
  name: string;
  /** log10 strength scale per chemical class pair, keyed 'PRE>POST' (muscles are class 'BWM'). */
  chem: Record<string, number>;
  /** log10 strength scale per gap-junction class pair, keyed 'A~B' with A ≤ B. */
  gap: Record<string, number>;
  /** Tonic current per class, pA: the drive the class gets from cells outside the model (peptides, upstream inputs). */
  bias: Record<string, number>;
  proprio: ProprioFit[];
  /** What it was fitted to, its score, seed and date (DESIGN.md section 7.3). */
  meta?: Record<string, string | number>;
}

/** No fit: every class pair at the default strength, no bias, proprioception off. */
export const UNFITTED: Fit = {
  name: 'unfitted',
  chem: {},
  gap: {},
  bias: {},
  proprio: ['DB', 'VB', 'DA', 'VA', 'SMD'].map((cls) => ({ cls, gain: 0, offset: 0, extent: 0 })),
};

/** Class of a cell for fitting: its anatomical class, or 'BWM' for every body-wall muscle. */
export function fitClass(cell: Cell): string {
  return cell.kind === 'muscle' ? 'BWM' : cell.class;
}

const classes = connectome.cells.map(fitClass);

export function chemKey(pre: number, post: number): string {
  return `${classes[pre]}>${classes[post]}`;
}

export function gapKey(a: number, b: number): string {
  const [x, y] = [classes[a]!, classes[b]!].sort();
  return `${x}~${y}`;
}

/** Scale (not log) for a chemical edge under a fit. */
export function chemScale(fit: Fit, pre: number, post: number): number {
  return 10 ** (fit.chem[chemKey(pre, post)] ?? 0);
}

export function gapScale(fit: Fit, a: number, b: number): number {
  return 10 ** (fit.gap[gapKey(a, b)] ?? 0);
}

/** Bias current per cell (pA) under a fit. */
export function biasCurrents(fit: Fit): Float64Array {
  const out = new Float64Array(connectome.cells.length);
  for (let i = 0; i < NEURON_COUNT; i++) out[i] = fit.bias[classes[i]!] ?? 0;
  return out;
}
