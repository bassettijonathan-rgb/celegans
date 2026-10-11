/**
 * Validation V1 (DESIGN.md section 9) for the shipped gait fit: the worm
 * crawls on agar and swims in water on its own brain (V1a, V1b; fitted), and
 * its gait in between changes smoothly and monotonically (V1c; held out,
 * never in the fit's cost).
 */
import { describe, expect, it } from 'vitest';
import { appBrain } from '../../src/sim/fits';
import { MIN_AMPLITUDE, TARGETS, gaitIn } from '../../tools/fit/evaluate';

const inBand = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;

describe('V1 gait on the shipped fit', () => {
  it('V1a: crawls forward on agar at the measured frequency and wavelength', () => {
    const g = gaitIn(appBrain(), TARGETS.agar.mix, 1, 2000, 6000);
    expect(inBand(g.frequency, TARGETS.agar.frequency)).toBe(true);
    expect(inBand(g.wavelength, TARGETS.agar.wavelength)).toBe(true);
    expect(g.amplitude).toBeGreaterThanOrEqual(MIN_AMPLITUDE);
    expect(g.speed).toBeGreaterThan(0);
  }, 120_000);

  it('V1b: swims forward in water at the measured frequency and wavelength', () => {
    const g = gaitIn(appBrain(), TARGETS.water.mix, 1, 1000, 2000);
    expect(inBand(g.frequency, TARGETS.water.frequency)).toBe(true);
    expect(inBand(g.wavelength, TARGETS.water.wavelength)).toBe(true);
    expect(g.amplitude).toBeGreaterThanOrEqual(MIN_AMPLITUDE);
    expect(g.speed).toBeGreaterThan(0);
  }, 120_000);

  // Known failure (DESIGN.md 9.1): the wavelength jumps between 70% and 90% of the way to agar.
  // `it.fails` passes while V1c fails, so a fit that fixes it makes CI say so.
  it.fails('V1c (held out): frequency and wavelength fall steadily from water to agar', () => {
    const mixes = Array.from({ length: 11 }, (_, k) => k / 10);
    const gaits = mixes.map((mix) => gaitIn(appBrain(), mix, 1, 1000 + 1000 * mix, 3000 + 3000 * mix));
    for (let k = 1; k < gaits.length; k++) {
      // 5% slack for measurement noise between neighbouring media.
      expect(gaits[k]!.frequency).toBeLessThanOrEqual(gaits[k - 1]!.frequency * 1.05);
      expect(gaits[k]!.wavelength).toBeLessThanOrEqual(gaits[k - 1]!.wavelength * 1.05);
      expect(gaits[k]!.speed).toBeGreaterThan(0);
    }
  }, 600_000);
});
