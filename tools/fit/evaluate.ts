/**
 * The gait cost (DESIGN.md section 7.2, targets V1a and V1b; F = fitted).
 * V1c (intermediate viscosities) is held out: it never enters this cost.
 */
import { GaitRecorder, type Gait } from '../../src/sim/gait';
import type { Fit } from '../../src/sim/fit';
import { buildBrain, createWorld, setMedium, step, type Brain } from '../../src/sim/world';

/**
 * Targets from DESIGN.md section 9 (V1a, V1b), Fang-Yen et al. 2010 ≈:
 * crawling 0.3–0.6 Hz at 0.6–0.7 body lengths, swimming ≈ 1.5–2 Hz at ≈ 1.5.
 * Marked ≈: not yet checked against the paper (unreachable from the build
 * environment), so the bands are kept wide. The amplitude floor (κ·L ≥ 3)
 * only rules out barely visible wiggles; it is not a published number.
 */
export const TARGETS = {
  agar: { mix: 1, frequency: [0.3, 0.6], wavelength: [0.6, 0.7] },
  water: { mix: 0, frequency: [1.5, 2.0], wavelength: [1.3, 1.7] },
} as const;
export const MIN_AMPLITUDE = 3;

export function gaitIn(b: Brain, mix: number, seed: number, transientMs: number, measureMs: number): Gait {
  const w = createWorld(seed, b);
  setMedium(w, mix);
  const rec = new GaitRecorder(10);
  for (let k = 0; k < transientMs + measureMs; k++) {
    step(w, b);
    if (k >= transientMs && k % 10 === 0) rec.sample(w.body.x, w.body.y);
  }
  return rec.result();
}

/** Squared distance outside a band, in units of the band's width (0 inside). */
function band(v: number, [lo, hi]: readonly [number, number]): number {
  const w = hi - lo;
  if (v < lo) return ((lo - v) / w) ** 2;
  if (v > hi) return ((v - hi) / w) ** 2;
  return 0;
}

export function gaitCost(g: Gait, target: { frequency: readonly [number, number]; wavelength: readonly [number, number] }): number {
  if (![g.frequency, g.wavelength, g.amplitude, g.speed].every(Number.isFinite)) return 100;
  let c = 0;
  c += Math.max(0, MIN_AMPLITUDE - g.amplitude) ** 2;
  if (g.amplitude < 0.2) return 20 + c;
  c += band(g.frequency, target.frequency);
  c += band(g.wavelength, target.wavelength);
  c += 4 * (1 - g.coherence);
  if (g.speed <= 0) c += 4 + 100 * -g.speed;
  return c;
}

export interface Score {
  cost: number;
  agar: Gait;
  water: Gait;
}

export function score(fit: Fit, seed = 1): Score {
  const b = buildBrain(fit);
  const agar = gaitIn(b, TARGETS.agar.mix, seed, 2000, 6000);
  const water = gaitIn(b, TARGETS.water.mix, seed, 1000, 2000);
  return { cost: gaitCost(agar, TARGETS.agar) + gaitCost(water, TARGETS.water), agar, water };
}
