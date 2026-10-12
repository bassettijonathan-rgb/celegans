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
/**
 * Classes given a slow inward channel outside the gait task (DESIGN.md
 * section 4.5): the A and B motor neurons, and the head motor neurons SMD and
 * RMD (RMD has plateau potentials, Mellem et al. 2008 ≈).
 */
export const SLOW = ['DB', 'VB', 'DA', 'VA', 'SMD', 'RMD'];
// The touch task also gives the command interneurons one (M4b): a touch lasts
// 100 ms but a reversal seconds, and the graded network forgets within
// milliseconds. AVA and AVB switch between long-lasting high and low states in
// whole-brain imaging (Kato et al. 2015 ≈; modelled as bistable by Roberts et al. 2016 ≈).
/**
 * The touch circuit added for M4 (Chalfie et al. 1985 ≈; DESIGN.md 5.1, 8.2):
 * the six touch receptors, DVA and LUA (PLM's partners) and RIM (coupled to
 * AVA during reversals, Kato et al. 2015 ≈).
 */
export const TOUCH = ['ALM', 'AVM', 'PLM', 'PVM', 'DVA', 'LUA', 'RIM'];
/** The six gentle-touch receptor neurons' classes. */
const RECEPTORS = ['ALM', 'AVM', 'PLM', 'PVM'];
export type Task = 'gait' | 'bio' | 'steer' | 'touch';
/**
 * Command interneurons: hubs with hundreds of inputs from outside the motor
 * and touch circuits. With every synapse at the same default strength, those
 * inputs swamp the few from the touch receptors. The touch fit therefore
 * scales each hub's outside inputs together, one number per hub and kind.
 */
export const COMMAND = ['AVA', 'AVB', 'AVD', 'AVE', 'PVC'];
export const CIRCUIT: Record<Task, string[]> = { gait: MOTOR, bio: MOTOR, steer: MOTOR, touch: [...MOTOR, ...TOUCH] };
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
  /** Per command class: its chemical and gap class pairs from outside the circuit (touch task only). */
  otherChem: Map<string, string[]>;
  otherGap: Map<string, string[]>;
  /** Classes whose stretch feedback is fitted; the others have none. */
  proprio: string[];
  slow: string[];
  /** Circuit class pairs with ambiguous edges whose excitatory share is fitted. */
  mixKeys: string[];
  /** Resting release every candidate is built with (DESIGN.md 4.2; not fitted). Absent: 0.5. */
  restRelease?: number;
  /** What is fitted: the gait alone, or the gait and the touch responses. */
  task: Task;
}

export function buildSpace(proprio: string[] = PROPRIO, task: Task = 'gait', restRelease?: number): Space {
  const slow = task === 'gait' ? [] : task === 'touch' ? [...SLOW, ...COMMAND] : SLOW;
  const circuit = CIRCUIT[task];
  const inMotor = (i: number) => circuit.includes(fitClass(connectome.cells[i]!));
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
  // Small class pairs share one strength, except a touch receptor's own
  // outputs: the touch pathway (ALM, AVM → AVD; Chalfie et al. 1985 ≈) runs
  // through few synapses, and pooled with every other small pair it could not
  // be scaled at all.
  const own = (k: string) => RECEPTORS.some((r) => k.startsWith(`${r}>`) || k.startsWith(`${r}~`) || k.endsWith(`~${r}`));
  const big = (m: Map<string, number>, k: string) => m.get(k)! >= MIN_SECTIONS || (task === 'touch' && own(k));
  const chemKeys = sorted(chem).filter((k) => big(chem, k));
  const gapKeys = sorted(gap).filter((k) => big(gap, k));
  const smallChem = sorted(chem).filter((k) => !big(chem, k));
  const smallGap = sorted(gap).filter((k) => !big(gap, k));
  // Ambiguous signs (DESIGN.md 3.2) are fitted per class pair outside the gait task.
  const ambiguous = new Set<string>();
  for (const e of connectome.chemical) if (e.sign === 0 && inMotor(e.pre) && inMotor(e.post)) ambiguous.add(chemKey(e.pre, e.post));
  const mixKeys = task === 'gait' ? [] : chemKeys.filter((k) => ambiguous.has(k));
  const otherChem = new Map<string, string[]>();
  const otherGap = new Map<string, string[]>();
  if (task !== 'gait') {
    const add = (m: Map<string, string[]>, cmd: string, k: string) => {
      const list = m.get(cmd) ?? [];
      if (!list.includes(k)) list.push(k);
      m.set(cmd, list);
    };
    for (const e of connectome.chemical) {
      const post = fitClass(connectome.cells[e.post]!);
      if (COMMAND.includes(post) && !inMotor(e.pre)) add(otherChem, post, chemKey(e.pre, e.post));
    }
    for (const e of connectome.gap) {
      const a = fitClass(connectome.cells[e.a]!);
      const b = fitClass(connectome.cells[e.b]!);
      if (COMMAND.includes(a) && !inMotor(e.b)) add(otherGap, a, gapKey(e.a, e.b));
      else if (COMMAND.includes(b) && !inMotor(e.a)) add(otherGap, b, gapKey(e.a, e.b));
    }
    for (const m of [otherChem, otherGap]) for (const list of m.values()) list.sort();
  }
  const START_NMJ = 2;
  const w = (name: string): Dim => ({ name, centre: /^chem:(DB|VB|DA|VA|DD|VD|AS)>BWM$/.test(name) ? START_NMJ : 0, scale: 0.5, lo: -2, hi: 3 });
  const dims: Dim[] = [
    ...chemKeys.map((k) => w(`chem:${k}`)),
    w('chem:small'),
    ...gapKeys.map((k) => w(`gap:${k}`)),
    w('gap:small'),
    ...COMMAND.filter((c) => otherChem.has(c)).map((c) => w(`chem:other>${c}`)),
    ...COMMAND.filter((c) => otherGap.has(c)).map((c) => w(`gap:other~${c}`)),
    ...circuit.filter((c) => c !== 'BWM').map((c) => ({ name: `bias:${c}`, centre: 0, scale: 0.3, lo: -3, hi: 3 })),
    ...proprio.flatMap((c) => [
      { name: `gain:${c}`, centre: c === 'DB' || c === 'VB' ? -3 : 0, scale: 2, lo: -30, hi: 30 },
      { name: `offset:${c}`, ...offsetRange(c, task) },
      { name: `extent:${c}`, centre: 0.15, scale: 0.1, lo: 0, hi: 0.6 },
    ]),
    ...mixKeys.map((k) => ({ name: `mix:${k}`, centre: 0.5, scale: 0.2, lo: 0, hi: 1 })),
    ...slow.flatMap((c) => [
      { name: `slowg:${c}`, centre: 2, scale: 1, lo: 0, hi: 10 },
      { name: `slowhalf:${c}`, centre: 0, scale: 3, lo: -20, hi: 20 },
      { name: `slowtau:${c}`, centre: 50, scale: 30, lo: 5, hi: 500 },
    ]),
  ];
  return { dims, chemKeys, gapKeys, mixKeys, smallChem, smallGap, otherChem, otherGap, proprio, slow, task, ...(restRelease === undefined ? {} : { restRelease }) };
}

/**
 * Where a stretch-sensing class may read the body. For the gait task
 * anywhere within half a body length. Otherwise the fit follows
 * the biology (Wen et al. 2012; Xu et al. 2018 ≈): B cells, which drive
 * forward crawling, read the bend ahead of them (towards the head; toFit also
 * stops the field at the soma); A cells, which drive backing up, read the bend
 * behind them.
 */
/**
 * How far ahead of its soma a B cell's field must start (body fraction): a
 * fit left free to read at the soma itself settled there, which is not
 * the anterior sensing of Wen et al. 2012 ≈.
 */
const B_LEAD = 0.05;

function offsetRange(c: string, task: Task): { centre: number; scale: number; lo: number; hi: number } {
  if (task !== 'gait' && (c === 'DB' || c === 'VB')) return { centre: -0.15, scale: 0.1, lo: -0.5, hi: -B_LEAD };
  if (task !== 'gait' && (c === 'DA' || c === 'VA')) return { centre: 0.05, scale: 0.1, lo: 0, hi: 0.5 };
  return { centre: -0.15, scale: 0.1, lo: -0.5, hi: 0.5 };
}

/** Parameter value of dimension d for search coordinate x (unit-scaled, clamped to the range). */
export function value(d: Dim, x: number): number {
  return Math.min(d.hi, Math.max(d.lo, d.centre + d.scale * x));
}

export function toFit(space: Space, x: ArrayLike<number>, name: string): Fit {
  const fit: Fit = { name, chem: {}, gap: {}, bias: {}, proprio: [], ...(space.restRelease === undefined ? {} : { restRelease: space.restRelease }) };
  const v = new Map(space.dims.map((d, i) => [d.name, value(d, x[i]!)]));
  for (const k of space.chemKeys) fit.chem[k] = v.get(`chem:${k}`)!;
  for (const k of space.smallChem) fit.chem[k] = v.get('chem:small')!;
  for (const k of space.gapKeys) fit.gap[k] = v.get(`gap:${k}`)!;
  for (const k of space.smallGap) fit.gap[k] = v.get('gap:small')!;
  for (const [c, keys] of space.otherChem) for (const k of keys) fit.chem[k] = v.get(`chem:other>${c}`)!;
  for (const [c, keys] of space.otherGap) for (const k of keys) fit.gap[k] = v.get(`gap:other~${c}`)!;
  for (const c of CIRCUIT[space.task]) if (c !== 'BWM') fit.bias[c] = v.get(`bias:${c}`)!;
  for (const c of space.proprio) {
    const offset = v.get(`offset:${c}`)!;
    let extent = v.get(`extent:${c}`)!;
    // Outside the gait task a B cell's whole field lies ahead of it (offsetRange).
    if (space.task !== 'gait' && (c === 'DB' || c === 'VB')) extent = Math.min(extent, -offset);
    fit.proprio.push({ cls: c, gain: v.get(`gain:${c}`)!, offset, extent });
  }
  if (space.mixKeys.length) fit.mix = Object.fromEntries(space.mixKeys.map((k) => [k, v.get(`mix:${k}`)!]));
  if (space.slow.length) {
    fit.slow = space.slow.map((c) => ({ cls: c, g: v.get(`slowg:${c}`)!, half: v.get(`slowhalf:${c}`)!, tau: v.get(`slowtau:${c}`)! }));
  }
  return fit;
}

/**
 * The shared value of a pooled dimension in a saved fit: the most common
 * value among its keys. A fit from a smaller circuit pools different keys, so
 * the first key alone may be one it fitted on its own.
 */
function pooled(values: (number | undefined)[]): number {
  const counts = new Map<number, number>();
  for (const x of values) if (x !== undefined) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = 0;
  let most = 0;
  for (const [x, c] of [...counts].sort((a, b) => a[0] - b[0])) if (c > most) [best, most] = [x, c];
  return best;
}

/** Search coordinates of a fit (the inverse of toFit), to continue a search from it. */
export function fromFit(space: Space, fit: Fit): Float64Array {
  const v = new Map<string, number>();
  for (const k of space.chemKeys) v.set(`chem:${k}`, fit.chem[k] ?? 0);
  v.set('chem:small', pooled(space.smallChem.map((k) => fit.chem[k])));
  for (const k of space.gapKeys) v.set(`gap:${k}`, fit.gap[k] ?? 0);
  v.set('gap:small', pooled(space.smallGap.map((k) => fit.gap[k])));
  for (const [c, keys] of space.otherChem) v.set(`chem:other>${c}`, fit.chem[keys[0]!] ?? 0);
  for (const [c, keys] of space.otherGap) v.set(`gap:other~${c}`, fit.gap[keys[0]!] ?? 0);
  for (const [c, b] of Object.entries(fit.bias)) v.set(`bias:${c}`, b);
  for (const r of fit.proprio) {
    v.set(`gain:${r.cls}`, r.gain);
    v.set(`offset:${r.cls}`, r.offset);
    v.set(`extent:${r.cls}`, r.extent);
  }
  for (const [k, m] of Object.entries(fit.mix ?? {})) v.set(`mix:${k}`, m);
  for (const r of fit.slow ?? []) {
    v.set(`slowg:${r.cls}`, r.g);
    v.set(`slowhalf:${r.cls}`, r.half);
    v.set(`slowtau:${r.cls}`, r.tau);
  }
  return Float64Array.from(space.dims, (d) => ((v.get(d.name) ?? d.centre) - d.centre) / d.scale);
}
