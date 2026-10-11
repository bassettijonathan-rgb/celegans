/**
 * One touch trial on agar (DESIGN.md section 9, V2a/V2b/V4a): the worm
 * crawls for a while, is touched once, and its speed and command
 * interneurons are compared before and after.
 */
import { NODES } from '../../src/sim/body';
import { NEURON_COUNT, cellIndex, connectome } from '../../src/sim/connectome';
import { GaitRecorder, type Gait } from '../../src/sim/gait';
import { createWorld, setMedium, step, touchBody, type Brain, type World } from '../../src/sim/world';

/** Crawling time before the touch, and the windows compared (ms). */
export const SETTLE_MS = 3000;
export const BEFORE_MS = 2000;
export const AFTER_MS = 4000;
/** The worm should be crawling forward again over the last RECOVERY_MS (guess: reversals last a few seconds). */
export const RECOVERY_MS = 1000;
/** Backing up means moving tail first at least this fast over WINDOW_MS (mm/s). */
export const REVERSE_SPEED = 0.02;
export const WINDOW_MS = 500;

export interface TouchResult {
  /** Mean speed towards the head, mm/s, before the touch and over its first 1.5 s. */
  before: number;
  after: number;
  /** Whether the worm backed up within the first second, and when (ms after the touch). */
  reversed: boolean;
  latency: number;
  /** Mean voltage of AVA (L and R) and AVB, before and over the first 1.5 s after, mV. */
  avaBefore: number;
  avaAfter: number;
  avbBefore: number;
  avbAfter: number;
}

/** Every neuron of the given classes, by connectome index. */
export function cellsOfClasses(classes: readonly string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < NEURON_COUNT; i++) if (classes.includes(connectome.cells[i]!.class)) out.push(i);
  return out;
}

function centroid(w: World): [number, number] {
  let x = 0;
  let y = 0;
  for (let i = 0; i < NODES; i++) {
    x += w.body.x[i]!;
    y += w.body.y[i]!;
  }
  return [x / NODES, y / NODES];
}

/** A crawling worm ready to be touched, with its state over the BEFORE_MS before. */
export interface Settled {
  world: World;
  speed: number;
  ava: number;
  avb: number;
}

const AVA = () => [cellIndex('AVAL'), cellIndex('AVAR')];
const AVB = () => [cellIndex('AVBL'), cellIndex('AVBR')];

/**
 * Runs `ms` steps, recording velocity towards the head (µm/ms = mm/s) and
 * the mean AVA and AVB voltages each step. `onStep(k)` runs before step k.
 */
function record(w: World, b: Brain, ms: number, onStep?: (k: number) => void, gait?: GaitRecorder) {
  const ava = AVA();
  const avb = AVB();
  const mean = (cells: number[]) => cells.reduce((s, c) => s + w.neurons.v[c]!, 0) / cells.length;
  const vel: number[] = [];
  const va: number[] = [];
  const vb: number[] = [];
  let last = centroid(w);
  for (let k = 0; k < ms; k++) {
    onStep?.(k);
    step(w, b);
    const c = centroid(w);
    const hx = w.body.x[0]! - c[0];
    const hy = w.body.y[0]! - c[1];
    const h = Math.hypot(hx, hy) || 1;
    vel.push(((c[0] - last[0]) * hx + (c[1] - last[1]) * hy) / h);
    va.push(mean(ava));
    vb.push(mean(avb));
    last = c;
    if (gait && k % gait.every === 0) gait.sample(w.body.x, w.body.y);
  }
  return { vel, va, vb };
}

const avg = (xs: number[], from = 0, to = xs.length) => xs.slice(from, to).reduce((s, v) => s + v, 0) / (to - from);

/** Lets a worm crawl on agar for SETTLE_MS, then records BEFORE_MS. */
export function settle(b: Brain, seed: number): Settled {
  const w = createWorld(seed, b);
  setMedium(w, 1);
  for (let k = 0; k < SETTLE_MS; k++) step(w, b);
  const r = record(w, b, BEFORE_MS);
  return { world: w, speed: avg(r.vel), ava: avg(r.va), avb: avg(r.vb) };
}

/**
 * Crawls on agar for `transientMs`, then measures the gait over `measureMs`
 * (as `gaitIn` does) while recording the last BEFORE_MS for a touch trial.
 */
export function settleWithGait(b: Brain, seed: number, transientMs: number, measureMs: number): Settled & { gait: Gait } {
  const w = createWorld(seed, b);
  setMedium(w, 1);
  for (let k = 0; k < transientMs; k++) step(w, b);
  const rec = new GaitRecorder(10);
  const r = record(w, b, measureMs, undefined, rec);
  const from = measureMs - BEFORE_MS;
  return { world: w, speed: avg(r.vel, from), ava: avg(r.va, from), avb: avg(r.vb, from), gait: rec.result() };
}

export type TouchTrial = TouchResult & {
  /** Slowest WINDOW_MS speed in the first second after the touch, mm/s. */
  minSpeed: number;
  /** Mean speed over the last RECOVERY_MS. */
  recovered: number;
  /** Velocity towards the head each ms after the touch. */
  vel: number[];
};

/**
 * Touches a copy of a settled worm at body fraction `at` (null: a sham
 * trial, no touch) and records AFTER_MS. With a sham trial's velocities,
 * `minSpeed` and `reversed` compare against it, so the head's sweep, which
 * moves the centroid back and forth during every undulation, cancels out.
 */
export function touchFrom(s: Settled, b: Brain, at: number | null, sham?: number[]): TouchTrial {
  const w = structuredClone(s.world);
  const r = record(w, b, AFTER_MS, (k) => k === 0 && at !== null && touchBody(w, at));
  const rel = sham ? r.vel.map((v, k) => v - sham[k]! + s.speed) : r.vel;
  let latency = -1;
  let minSpeed = Infinity;
  for (let k = 0; k + WINDOW_MS <= 1000 + WINDOW_MS; k += 50) {
    const v = avg(rel, k, k + WINDOW_MS);
    minSpeed = Math.min(minSpeed, v);
    if (latency < 0 && v < -REVERSE_SPEED) latency = k;
  }
  const early = 1500;
  return {
    before: s.speed,
    after: avg(r.vel, 0, early),
    reversed: latency >= 0,
    latency,
    avaBefore: s.ava,
    avaAfter: avg(r.va, 0, early),
    avbBefore: s.avb,
    avbAfter: avg(r.vb, 0, early),
    minSpeed,
    recovered: avg(r.vel, AFTER_MS - RECOVERY_MS),
    vel: r.vel,
  };
}

/** A touch trial compared against a sham trial from the same moment. */
export function touchTrial(b: Brain, at: number, seed: number): TouchTrial {
  const s = settle(b, seed);
  return touchFrom(s, b, at, touchFrom(s, b, null).vel);
}
