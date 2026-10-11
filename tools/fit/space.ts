/**
 * The search space for the gait fit (DESIGN.md section 7.1): which numbers
 * are free, their ranges, and how a vector maps to a Fit.
 *
 * Only the motor circuit is fitted here; every other class pair keeps the
 * unfitted default. Class pairs with fewer than MIN_SECTIONS EM sections in
 * total share one default number per kind (chemical, gap).
 *
 * Starting point: from no proprioceptive feedback the body never moves and
 * the cost is flat, so the search starts from a hand probe that undulates
 * (DESIGN.md section 7.3): motor neuron → muscle junctions ×100, and B
 * cells inhibited by bending over the 15% of body just in front of them
 * (A cells and SMD start without feedback).
 * The fit is free to move every one of these.
 */
import { connectome } from '../../src/sim/connectome';
import { chemKey, fitClass, gapKey, type Fit } from '../../src/sim/fit';

export const MOTOR = ['DB', 'VB', 'DA', 'VA', 'DD', 'VD', 'AS', 'AVB', 'AVA', 'AVD', 'AVE', 'PVC', 'SMD', 'RMD', 'SMB', 'RME', 'BWM'];
export const PROPRIO = ['DB', 'VB', 'DA', 'VA', 'SMD'];
const MIN_SECTIONS = 10;

export interface Dim {
  name: string;
  centre: number;
  scale: number;
  lo: number;
  hi: number;
}

export interface Space {
  dims: Dim[];
  chemKeys: string[];
  gapKeys: string[];
  smallChem: string[];
  smallGap: string[];
  /** Classes whose stretch feedback is fitted; the others have none. */
  proprio: string[];
}

export function buildSpace(proprio: string[] = PROPRIO): Space {
  const inMotor = (i: number) => MOTOR.includes(fitClass(connectome.cells[i]!));
  const chem = new Map<string, number>();
  for (const e of connectome.chemical) {
    if (!inMotor(e.pre) || !inMotor(e.post)) continue;
    const k = chemKey(e.pre, e.post);
    chem.set(k, (chem.get(k) ?? 0) + e.size);
  }
  const gap = new Map<string, number>();
  for (const e of connectome.gap) {
    if (!inMotor(e.a) || !inMotor(e.b)) continue;
    const k = gapKey(e.a, e.b);
    gap.set(k, (gap.get(k) ?? 0) + e.size);
  }
  const sorted = (m: Map<string, number>) => [...m.keys()].sort();
  const chemKeys = sorted(chem).filter((k) => chem.get(k)! >= MIN_SECTIONS);
  const gapKeys = sorted(gap).filter((k) => gap.get(k)! >= MIN_SECTIONS);
  const smallChem = sorted(chem).filter((k) => chem.get(k)! < MIN_SECTIONS);
  const smallGap = sorted(gap).filter((k) => gap.get(k)! < MIN_SECTIONS);
  const START_NMJ = 2;
  const w = (name: string): Dim => ({ name, centre: /^chem:(DB|VB|DA|VA|DD|VD|AS)>BWM$/.test(name) ? START_NMJ : 0, scale: 0.5, lo: -2, hi: 3 });
  const dims: Dim[] = [
    ...chemKeys.map((k) => w(`chem:${k}`)),
    w('chem:small'),
    ...gapKeys.map((k) => w(`gap:${k}`)),
    w('gap:small'),
    ...MOTOR.filter((c) => c !== 'BWM').map((c) => ({ name: `bias:${c}`, centre: 0, scale: 0.3, lo: -3, hi: 3 })),
    ...proprio.flatMap((c) => [
      { name: `gain:${c}`, centre: c === 'DB' || c === 'VB' ? -3 : 0, scale: 2, lo: -30, hi: 30 },
      { name: `offset:${c}`, centre: -0.15, scale: 0.1, lo: -0.5, hi: 0.5 },
      { name: `extent:${c}`, centre: 0.15, scale: 0.1, lo: 0, hi: 0.6 },
    ]),
  ];
  return { dims, chemKeys, gapKeys, smallChem, smallGap, proprio };
}

/** Parameter value of dimension d for search coordinate x (unit-scaled, clamped to the range). */
export function value(d: Dim, x: number): number {
  return Math.min(d.hi, Math.max(d.lo, d.centre + d.scale * x));
}

export function toFit(space: Space, x: ArrayLike<number>, name: string): Fit {
  const fit: Fit = { name, chem: {}, gap: {}, bias: {}, proprio: [] };
  const v = new Map(space.dims.map((d, i) => [d.name, value(d, x[i]!)]));
  for (const k of space.chemKeys) fit.chem[k] = v.get(`chem:${k}`)!;
  for (const k of space.smallChem) fit.chem[k] = v.get('chem:small')!;
  for (const k of space.gapKeys) fit.gap[k] = v.get(`gap:${k}`)!;
  for (const k of space.smallGap) fit.gap[k] = v.get('gap:small')!;
  for (const c of MOTOR) if (c !== 'BWM') fit.bias[c] = v.get(`bias:${c}`)!;
  for (const c of space.proprio) {
    fit.proprio.push({ cls: c, gain: v.get(`gain:${c}`)!, offset: v.get(`offset:${c}`)!, extent: v.get(`extent:${c}`)! });
  }
  return fit;
}

/** Search coordinates of a fit (the inverse of toFit), to continue a search from it. */
export function fromFit(space: Space, fit: Fit): Float64Array {
  const v = new Map<string, number>();
  for (const k of space.chemKeys) v.set(`chem:${k}`, fit.chem[k] ?? 0);
  v.set('chem:small', space.smallChem.length ? (fit.chem[space.smallChem[0]!] ?? 0) : 0);
  for (const k of space.gapKeys) v.set(`gap:${k}`, fit.gap[k] ?? 0);
  v.set('gap:small', space.smallGap.length ? (fit.gap[space.smallGap[0]!] ?? 0) : 0);
  for (const [c, b] of Object.entries(fit.bias)) v.set(`bias:${c}`, b);
  for (const r of fit.proprio) {
    v.set(`gain:${r.cls}`, r.gain);
    v.set(`offset:${r.cls}`, r.offset);
    v.set(`extent:${r.cls}`, r.extent);
  }
  return Float64Array.from(space.dims, (d) => ((v.get(d.name) ?? d.centre) - d.centre) / d.scale);
}
