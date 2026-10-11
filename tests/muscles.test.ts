import { describe, expect, it } from 'vitest';
import { MAX_RADIUS, NODES, SEGMENT_LENGTH } from '../src/sim/body';
import { connectome } from '../src/sim/connectome';
import { MAX_ACTIVE_CURVATURE, MUSCLE_COUNT, activeTurning, muscles } from '../src/sim/muscles';
import { Medium } from '../src/sim/plate';
import { drivePuppet, createPuppet } from '../src/sim/puppet';
import { createWorld, setMedium, setPuppet, step, type World } from '../src/sim/world';
import { expectDeterministic } from './helpers';

const name = (m: number) => connectome.cells[muscles[m]!.cell]!.name;
const node = (u: number) => Math.round(u * (NODES - 1));

function activate(pick: (m: number) => boolean): Float64Array {
  return Float64Array.from({ length: MUSCLE_COUNT }, (_, m) => (pick(m) ? 1 : 0));
}

function turning(activation: Float64Array): Float64Array {
  const out = new Float64Array(NODES);
  activeTurning(activation, out);
  return out;
}

describe('the body-wall muscles', () => {
  it('are 95 cells in four quadrants, with no MVL24', () => {
    expect(MUSCLE_COUNT).toBe(95);
    const count = (prefix: string) => muscles.filter((_, m) => name(m).startsWith(prefix)).length;
    expect([count('MDL'), count('MDR'), count('MVL'), count('MVR')]).toEqual([24, 24, 23, 24]);
    expect(muscles.some((_, m) => name(m) === 'MVL24')).toBe(false);
  });

  it('run from behind the nose to near the tail, in order', () => {
    for (let m = 0; m < MUSCLE_COUNT; m++) {
      expect(muscles[m]!.centre).toBeGreaterThan(0.05);
      expect(muscles[m]!.centre).toBeLessThan(0.95);
    }
    const mdl = muscles.filter((_, m) => name(m).startsWith('MDL')).map((mu) => mu.centre);
    expect(mdl).toEqual([...mdl].sort((a, b) => a - b));
  });

  it('bend the body dorsally when the dorsal side contracts, evenly along its length', () => {
    const th = turning(activate((m) => muscles[m]!.side > 0));
    for (const u of [0.2, 0.5, 0.8]) {
      expect(th[node(u)]! / SEGMENT_LENGTH).toBeCloseTo(MAX_ACTIVE_CURVATURE, 12);
    }
    // No body-wall muscle at the very tip of the nose.
    expect(th[0]).toBe(0);
    expect(th[1]).toBe(0);
  });

  it('bend ventrally when the ventral side contracts', () => {
    const th = turning(activate((m) => muscles[m]!.side < 0));
    expect(th[node(0.5)]! / SEGMENT_LENGTH).toBeCloseTo(-MAX_ACTIVE_CURVATURE, 12);
  });

  it('add left and right on the same side (each gives half)', () => {
    const left = turning(activate((m) => name(m).startsWith('MDL')));
    const both = turning(activate((m) => name(m).startsWith('MD')));
    expect(left[node(0.5)]! / both[node(0.5)]!).toBeCloseTo(0.5, 12);
  });

  it('cancel when both sides contract together', () => {
    const th = turning(activate(() => true));
    expect(Math.abs(th[node(0.5)]!)).toBeLessThan(1e-15);
  });

  it('bend only near a single contracting cell', () => {
    const m = muscles.findIndex((_, i) => name(i) === 'MDL12');
    const th = turning(activate((i) => i === m));
    const centre = muscles[m]!.centre;
    for (let j = 0; j < NODES; j++) {
      const near = Math.abs(j / (NODES - 1) - centre) < 0.04;
      if (!near) expect(th[j]).toBe(0);
    }
    expect(th[node(centre)]).toBeGreaterThan(0);
  });
});

describe('the puppet', () => {
  it('drives dorsal and ventral in antiphase with a wave running head to tail', () => {
    const p = createPuppet(1);
    const a = new Float64Array(MUSCLE_COUNT);
    drivePuppet(p, a, 1);
    const mdl = (k: number) => muscles.findIndex((_, i) => name(i) === `MDL${String(k).padStart(2, '0')}`);
    const mvl = (k: number) => muscles.findIndex((_, i) => name(i) === `MVL${String(k).padStart(2, '0')}`);
    expect(a[mdl(10)]! + a[mvl(10)]!).toBeCloseTo(1, 12);
    // A little later, the activation seen at muscle 10 has moved to muscle 11.
    const before = a[mdl(10)]!;
    const pitch = muscles[mdl(11)]!.centre - muscles[mdl(10)]!.centre;
    const delay = ((pitch / p.wavelength) * 1000) / p.frequency;
    const later = new Float64Array(MUSCLE_COUNT);
    drivePuppet(p, later, delay);
    expect(later[mdl(11)]).toBeCloseTo(before, 9);
  });
});

/** Mean centroid velocity along the line from tail to nose at the start, µm/s. */
function headwardSpeed(w: World, seconds: number): number {
  const n = NODES - 1;
  const hx = w.body.x[0]! - w.body.x[n]!;
  const hy = w.body.y[0]! - w.body.y[n]!;
  const len = Math.hypot(hx, hy);
  const mean = () => [w.body.x.reduce((s, v) => s + v, 0) / NODES, w.body.y.reduce((s, v) => s + v, 0) / NODES];
  const [x0, y0] = mean();
  for (let k = 0; k < seconds * 1000; k++) step(w);
  const [x1, y1] = mean();
  return (((x1! - x0!) * hx + (y1! - y0!) * hy) / len) / seconds;
}

describe('a puppet worm on the plate', () => {
  it('crawls forward on agar and swims forward in water', () => {
    const crawl = createWorld(4);
    setPuppet(crawl, true);
    expect(headwardSpeed(crawl, 4)).toBeGreaterThan(100);
    const swim = createWorld(4);
    setMedium(swim, 0);
    setPuppet(swim, true);
    expect(headwardSpeed(swim, 1)).toBeGreaterThan(50);
  });

  it('relaxes when the puppet stops', () => {
    const w = createWorld(2);
    setPuppet(w, true);
    for (let k = 0; k < 1000; k++) step(w);
    setPuppet(w, false);
    expect([...w.muscles].every((a) => a === 0)).toBe(true);
    const x = w.body.x.slice();
    for (let k = 0; k < 5000; k++) step(w);
    let moved = 0;
    const x2 = w.body.x.slice();
    for (let k = 0; k < 1000; k++) step(w);
    for (let i = 0; i < NODES; i++) moved = Math.max(moved, Math.abs(w.body.x[i]! - x2[i]!));
    expect(moved).toBeLessThan(5);
    expect(x).not.toEqual(x2);
  });

  it('stays inside the dish', () => {
    const w = createWorld(5);
    setMedium(w, 0);
    setPuppet(w, true);
    // Put the worm near the wall, facing it.
    const wall = w.plateRadius - MAX_RADIUS;
    const n = NODES - 1;
    const turn = -Math.atan2(w.body.y[0]! - w.body.y[n]!, w.body.x[0]! - w.body.x[n]!);
    const [c, s] = [Math.cos(turn), Math.sin(turn)];
    const xs = w.body.x.map((x, i) => c * x - s * w.body.y[i]!);
    const ys = w.body.y.map((y, i) => s * w.body.x[i]! + c * y);
    const shift = wall - 300 - Math.max(...xs);
    for (let i = 0; i < NODES; i++) [w.body.x[i], w.body.y[i]] = [xs[i]! + shift, ys[i]!];
    let closest = Infinity;
    for (let k = 0; k < 10000; k++) {
      step(w);
      for (let i = 0; i < NODES; i++) {
        const r = Math.hypot(w.body.x[i]!, w.body.y[i]!);
        expect(r).toBeLessThan(wall + 1);
        closest = Math.min(closest, wall - r);
      }
    }
    expect(closest).toBeLessThan(5);
  }, 30000);

  it('switches media and gait together', () => {
    const w = createWorld(1);
    setMedium(w, 0.2);
    expect(w.medium).toBe(Medium.water);
    expect(w.puppet.frequency).toBeGreaterThan(1);
    setMedium(w, 0.9);
    expect(w.medium).toBe(Medium.agar);
    expect(w.puppet.frequency).toBeLessThan(1);
    setMedium(w, 4);
    expect(w.mix).toBe(1);
    expect(() => setMedium(w, NaN)).toThrow();
  });

  it('is deterministic', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed);
      setPuppet(w, true);
      for (let k = 0; k < 600; k++) {
        if (k === 300) setMedium(w, 0.3);
        step(w);
      }
      return w;
    });
  });
});
