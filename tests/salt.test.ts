import { describe, expect, it } from 'vitest';
import { NEURON_COUNT } from '../src/sim/connectome';
import { hashState } from '../src/sim/hash';
import { ADAPT_MS, AGAR_THICKNESS, ASE, SALT_CONDUCTANCE, SALT_D, saltAt, senseSalt, type SaltSpot } from '../src/sim/salt';
import { createWorld, placeSalt, saltAtNose, step } from '../src/sim/world';

const spot: SaltSpot = { x: 0, y: 0, umol: 25, placed: -14 * 3600_000 };

describe('salt field (DESIGN.md 8.3)', () => {
  it('conserves the salt placed: the field integrates to the amount', () => {
    // Σ C · area · thickness, in µmol (1 mM = 1e-12 µmol/µm³).
    const h = 500;
    let total = 0;
    for (let x = -60_000; x <= 60_000; x += h) for (let y = -60_000; y <= 60_000; y += h) total += saltAt([spot], x, y, 0) * h * h;
    expect((total * AGAR_THICKNESS) / 1e12).toBeCloseTo(25, 1);
  });

  it('obeys the diffusion equation dC/dt = D ∇²C', () => {
    const [x, y, t, d] = [3000, 1000, 0, 50];
    const c = (xx: number, yy: number, tt: number) => saltAt([spot], xx, yy, tt);
    const dcdt = (c(x, y, t + 1000) - c(x, y, t - 1000)) / 2000;
    const lap = (c(x + d, y, t) + c(x - d, y, t) + c(x, y + d, t) + c(x, y - d, t) - 4 * c(x, y, t)) / (d * d);
    expect(dcdt).toBeCloseTo(SALT_D * lap, 8);
  });

  it('gives tens of mM at a spot made as in the assays (10 µl of 2.5 M, 14 h before)', () => {
    const peak = saltAt([spot], 0, 0, 0);
    expect(peak).toBeGreaterThan(5);
    expect(peak).toBeLessThan(50);
    expect(saltAt([spot], 10_000, 0, 0)).toBeLessThan(peak);
  });

  it('adds spots and ignores one not yet placed', () => {
    const later = { ...spot, placed: 100 };
    expect(saltAt([spot, later], 0, 0, 0)).toBe(saltAt([spot], 0, 0, 0));
    expect(saltAt([spot, spot], 0, 0, 0)).toBeCloseTo(2 * saltAt([spot], 0, 0, 0), 12);
  });
});

describe('ASE salt sensing (Suzuki et al. 2008 ≈)', () => {
  const run = (from: number, to: number, ms: number) => {
    const adapted = Float64Array.of(from, from);
    const trace: [number, number][] = [];
    for (let t = 0; t < ms; t++) {
      const sense = new Float64Array(NEURON_COUNT);
      senseSalt(to, adapted, 1, sense);
      trace.push([sense[ASE[0]]!, sense[ASE[1]]!]);
    }
    return trace;
  };

  it('excites ASEL when salt rises and ASER when it falls, never both', () => {
    const up = run(10, 15, 10);
    expect(up[0]![0]).toBe(SALT_CONDUCTANCE);
    expect(up[0]![1]).toBe(0);
    const down = run(15, 10, 10);
    expect(down[0]![0]).toBe(0);
    expect(down[0]![1]).toBe(SALT_CONDUCTANCE);
  });

  it('adapts: a new steady level stops exciting it within a few adaptation times', () => {
    const up = run(10, 15, 6 * ADAPT_MS);
    expect(up.at(-1)![0]).toBeLessThan(0.02 * SALT_CONDUCTANCE);
    expect(up[Math.round(ADAPT_MS / 2)]![0]).toBeGreaterThan(0);
  });

  it('feels relative change: the same ratio excites equally at any level', () => {
    const low = run(20, 22, 2000);
    const high = run(200, 220, 2000);
    // Close, not equal: the floor matters a little at the lower level.
    expect(Math.abs(low[1000]![0] - high[1000]![0])).toBeLessThan(0.15 * SALT_CONDUCTANCE);
  });
});

describe('salt in the world', () => {
  it('starts the sensors adapted to the salt at the nose, and runs deterministically', () => {
    const make = () => {
      const w = createWorld(5);
      placeSalt(w, 2000, 0, 25, 14 * 3600_000);
      return w;
    };
    const a = make();
    expect(a.saltAdapted[0]).toBeCloseTo(saltAtNose(a), 12);
    const b = make();
    for (let k = 0; k < 300; k++) {
      step(a);
      step(b);
    }
    expect(hashState(a)).toBe(hashState(b));
    expect(() => placeSalt(a, 0, 0, -1)).toThrow();
  });
});
