import { describe, expect, it } from 'vitest';
import { BODY_LENGTH, NODES, SEGMENTS, SEGMENT_LENGTH } from '../src/sim/body';
import {
  AGAR,
  DEFAULT_ROD,
  RodWorkspace,
  WATER,
  addStiffness,
  dragFor,
  rodForces,
  stepRod,
  type Drag,
} from '../src/sim/mechanics';

/** A straight worm along +x with its nose at the origin. */
function straight(): { x: Float64Array; y: Float64Array } {
  return { x: Float64Array.from({ length: NODES }, (_, i) => i * SEGMENT_LENGTH), y: new Float64Array(NODES) };
}

/** Centroid of the body, each node weighted by the length it owns. */
function centroid(x: Float64Array): number {
  let s = 0;
  for (let i = 0; i < NODES; i++) s += x[i]! * (i === 0 || i === NODES - 1 ? 0.5 : 1);
  return s / SEGMENTS;
}

interface Wave {
  /** Bend amplitude: lateral amplitude × wavenumber (curvature amplitude ÷ wavenumber). */
  beta: number;
  /** Wavelength in body lengths. */
  lambda: number;
  /** Hz. */
  freq: number;
  standing?: boolean;
}

/**
 * Drives the rod with a prescribed curvature wave and returns the mean speed
 * of the centroid in the nose direction (−x), µm/ms, over the whole cycles
 * after the first (which lets the start-up transient pass).
 */
function swim(drag: Drag, w: Wave, cycles: number, dt = 1, track?: (x: Float64Array, y: Float64Array) => void): number {
  const { x, y } = straight();
  const th = new Float64Array(NODES);
  const ws = new RodWorkspace();
  const q = (2 * Math.PI) / (w.lambda * BODY_LENGTH);
  const omega = (2 * Math.PI * w.freq) / 1000;
  const perCycle = Math.round(1000 / Math.abs(w.freq) / dt);
  let start = 0;
  for (let k = 0; k < cycles * perCycle; k++) {
    if (k === perCycle) start = centroid(x);
    const t = (k + 1) * dt;
    for (let j = 1; j < NODES - 1; j++) {
      const s = j * SEGMENT_LENGTH;
      const shape = w.standing ? Math.sin(q * s) * Math.sin(omega * t) : Math.sin(q * s - omega * t);
      th[j] = w.beta * q * SEGMENT_LENGTH * shape;
    }
    stepRod(x, y, th, drag, DEFAULT_ROD, dt, ws);
    track?.(x, y);
  }
  return (start - centroid(x)) / ((cycles - 1) * perCycle * dt);
}

describe('the rod', () => {
  it('has the analytic stiffness matrix of its forces', () => {
    const x = Float64Array.from({ length: NODES }, (_, i) => 900 + i * SEGMENT_LENGTH * 0.95 + 15 * Math.sin(i * 0.4));
    const y = Float64Array.from({ length: NODES }, (_, i) => 30 * Math.cos(i * 0.3));
    const th = Float64Array.from({ length: NODES }, (_, i) => (i === 0 || i === NODES - 1 ? 0 : 0.1 * Math.sin(i)));
    const dim = 2 * NODES;
    const wall = 1500; // some nodes are outside it
    const k = new Float64Array(dim * dim);
    addStiffness(x, y, th, DEFAULT_ROD, k, wall);
    const f1 = [new Float64Array(NODES), new Float64Array(NODES)] as const;
    const f2 = [new Float64Array(NODES), new Float64Array(NODES)] as const;
    const h = 1e-5;
    let worst = 0;
    let scale = 0;
    for (let c = 0; c < dim; c++) {
      const arr = c % 2 ? y : x;
      const j = c >> 1;
      arr[j] = arr[j]! + h;
      rodForces(x, y, th, DEFAULT_ROD, f1[0], f1[1], wall);
      arr[j] = arr[j]! - 2 * h;
      rodForces(x, y, th, DEFAULT_ROD, f2[0], f2[1], wall);
      arr[j] = arr[j]! + h;
      for (let r = 0; r < dim; r++) {
        const fd = -(f1[r % 2]![r >> 1]! - f2[r % 2]![r >> 1]!) / (2 * h);
        worst = Math.max(worst, Math.abs(fd - k[r * dim + c]!));
        scale = Math.max(scale, Math.abs(fd));
      }
    }
    expect(worst / scale).toBeLessThan(1e-6);
  });

  it('relaxes passively without ever gaining energy, in water and on agar', () => {
    for (const drag of [WATER, AGAR]) {
      const x = new Float64Array(NODES);
      const y = new Float64Array(NODES);
      // A strong S bend (κ·L up to 8), released with the muscles off.
      let angle = 0;
      for (let i = 1; i < NODES; i++) {
        angle += (8 / BODY_LENGTH) * Math.sin((2 * Math.PI * i) / SEGMENTS) * SEGMENT_LENGTH;
        x[i] = x[i - 1]! + SEGMENT_LENGTH * Math.cos(angle);
        y[i] = y[i - 1]! + SEGMENT_LENGTH * Math.sin(angle);
      }
      const th = new Float64Array(NODES);
      const ws = new RodWorkspace();
      const first = stepRod(x, y, th, drag, DEFAULT_ROD, 1, ws);
      let last = first;
      for (let k = 0; k < 3000; k++) {
        const e = stepRod(x, y, th, drag, DEFAULT_ROD, 1, ws);
        expect(e).toBeLessThanOrEqual(last * (1 + 1e-9) + 1e-9);
        last = e;
      }
      expect(last).toBeLessThan(0.05 * first);
    }
  });

  it('keeps every segment within 0.1% of its length while swimming hard', () => {
    let worst = 0;
    swim(WATER, { beta: 1.2, lambda: 1.5, freq: 2 }, 2, 1, (x, y) => {
      for (let i = 1; i < NODES; i++) {
        const len = Math.hypot(x[i]! - x[i - 1]!, y[i]! - y[i - 1]!);
        worst = Math.max(worst, Math.abs(len / SEGMENT_LENGTH - 1));
      }
    });
    expect(worst).toBeLessThan(1e-3);
  });

  it('gives the step-size limit at the 1 ms step (two Newton iterations)', () => {
    const wave = { beta: 1, lambda: 1.5, freq: 2 };
    const coarse = swim(WATER, wave, 3, 1);
    const fine = swim(WATER, wave, 3, 0.1);
    expect(Math.abs(coarse / fine - 1)).toBeLessThan(0.005);
  });
});

describe('resistive force theory', () => {
  it('goes nowhere when drag is the same in every direction', () => {
    const iso = { ct: AGAR.ct, cn: AGAR.ct };
    const u = swim(iso, { beta: 0.6, lambda: 0.65, freq: 0.5 }, 3);
    expect(Math.abs(u)).toBeLessThan(1e-9);
  });

  it('goes nowhere with a reciprocal (standing-wave) stroke: the scallop theorem', () => {
    // Slow enough that the body follows the drive: on agar a body-sized bend
    // relaxes in ≈ 0.15 s, in water in ≈ 0.2 ms.
    for (const [drag, wave] of [
      [AGAR, { beta: 0.6, lambda: 0.65, freq: 0.1 }],
      [WATER, { beta: 1, lambda: 1.5, freq: 2 }],
    ] as const) {
      const forward = swim(drag, wave, 2);
      const flap = swim(drag, { ...wave, standing: true }, 2);
      expect(forward).toBeGreaterThan(0);
      expect(Math.abs(flap)).toBeLessThan(0.01 * forward);
    }
  });

  it('drifts when the drive is faster than the elastic body can follow (a flexible oar)', () => {
    // Bending modes relax at different rates, so a reciprocal drive gives a
    // body shape that is not reciprocal (Wiggins & Goldstein 1998).
    const slow = swim(AGAR, { beta: 0.6, lambda: 0.65, freq: 0.1, standing: true }, 2) / 0.1;
    const fast = swim(AGAR, { beta: 0.6, lambda: 0.65, freq: 0.5, standing: true }, 2) / 0.5;
    expect(Math.abs(fast)).toBeGreaterThan(5 * Math.abs(slow));
  });

  it('moves nose first when the wave runs from head to tail, in both media', () => {
    expect(swim(AGAR, { beta: 0.6, lambda: 0.65, freq: 0.5 }, 3)).toBeGreaterThan(0);
    expect(swim(WATER, { beta: 1, lambda: 1.5, freq: 2 }, 3)).toBeGreaterThan(0);
    // and tail first when it runs the other way (a reversal)
    expect(swim(AGAR, { beta: 0.6, lambda: 0.65, freq: -0.5 }, 3)).toBeLessThan(0);
  });

  /**
   * Gray & Hancock 1955 (and Taylor 1952): a long filament carrying a small
   * wave y = b sin(qx − ωt) swims at U = V · (K − 1) β²/2 to leading order,
   * where V = ω/q is the wave speed, β = bq and K = c_n/c_t. A finite body
   * also yaws and sways (recoil), which slows it a little, more so when K is
   * large.
   */
  it('matches Gray–Hancock at small amplitude, scaling as β²', () => {
    const lambda = 1 / 3;
    const freq = 1;
    const v = (lambda * BODY_LENGTH * freq) / 1000; // wave speed, µm/ms
    for (const [drag, tolerance] of [
      [WATER, 0.05],
      [AGAR, 0.15],
    ] as const) {
      const k = drag.cn / drag.ct;
      const beta = 0.03;
      const u = swim(drag, { beta, lambda, freq }, 3);
      const theory = (v * (k - 1) * beta * beta) / 2;
      expect(Math.abs(u / theory - 1)).toBeLessThan(tolerance);
      expect(u / theory).toBeLessThan(1);
      const half = swim(drag, { beta: beta / 2, lambda, freq }, 3);
      expect(u / half).toBeCloseTo(4, 1);
    }
  });
});

describe('media', () => {
  it('runs from water to agar, in log steps', () => {
    expect(dragFor(0)).toEqual(WATER);
    expect(dragFor(1).ct).toBeCloseTo(AGAR.ct, 12);
    expect(dragFor(1).cn).toBeCloseTo(AGAR.cn, 12);
    const mid = dragFor(0.5);
    expect(mid.ct).toBeCloseTo(Math.sqrt(WATER.ct * AGAR.ct), 12);
    expect(dragFor(-3)).toEqual(dragFor(0));
    expect(dragFor(7)).toEqual(dragFor(1));
  });

  it('crawls slower and swims faster in body lengths per cycle with a longer wave', () => {
    // Crawling slips far less than swimming: K ≈ 40 vs ≈ 1.6 (section 6.3).
    const crawl = swim(AGAR, { beta: 0.6, lambda: 0.65, freq: 0.5 }, 3);
    const swimU = swim(WATER, { beta: 1, lambda: 1.5, freq: 2 }, 3);
    const crawlSlip = crawl / ((0.65 * BODY_LENGTH * 0.5) / 1000);
    const swimSlip = swimU / ((1.5 * BODY_LENGTH * 2) / 1000);
    expect(crawlSlip).toBeGreaterThan(0.5);
    expect(swimSlip).toBeLessThan(0.2);
  });
});
