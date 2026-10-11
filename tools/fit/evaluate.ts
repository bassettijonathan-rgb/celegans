/**
 * The gait cost (DESIGN.md section 7.2, targets V1a and V1b; F = fitted).
 * V1c (intermediate viscosities) is held out: it never enters this cost.
 */
import { GaitRecorder, type Gait } from '../../src/sim/gait';
import type { Fit } from '../../src/sim/fit';
import { buildBrain, createWorld, setMedium, step, type Brain } from '../../src/sim/world';
import { settleWithGait, touchFrom, type TouchTrial } from './touchTrial';

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

/**
 * Touch targets (DESIGN.md section 9, all F): V2a, an anterior touch makes
 * the worm back up within a second (Chalfie et al. 1985 ≈), measured against
 * a sham trial from the same moment; V2b, a posterior
 * touch makes it go forward at least as fast (Chalfie 1985 ≈); V4a, AVA is up
 * and AVB down while it backs up (Kato et al. 2015 ≈); and it crawls forward
 * again a few seconds later. The ablations (V2d) are held out.
 */
export const TOUCH_AT = { anterior: 0.15, posterior: 0.85 } as const;
/** How fast the fit asks the worm to back up, mm/s (guess, about half its forward speed). */
export const TARGET_REVERSE = 0.08;

export function touchCost(a: TouchTrial, p: TouchTrial): number {
  let c = 0;
  // V2a: back up, at least TARGET_REVERSE at the fastest.
  if (a.minSpeed > -TARGET_REVERSE) c += 4 * ((a.minSpeed + TARGET_REVERSE) / TARGET_REVERSE) ** 2;
  // V4a: AVA up and AVB down after the anterior touch (per 5 mV short).
  c += Math.max(0, (a.avaBefore + 5 - a.avaAfter) / 5) ** 2;
  c += Math.max(0, (a.avbAfter - (a.avbBefore - 5)) / 5) ** 2;
  // Forward again by the end.
  c += Math.max(0, (0.05 - a.recovered) / 0.05) ** 2;
  // V2b: posterior touch, no slower than before, and never backwards.
  c += Math.max(0, (p.before - p.after) / Math.max(0.05, p.before)) ** 2;
  c += Math.max(0, (0 - p.minSpeed) / 0.05) ** 2;
  c += Math.max(0, (0.05 - p.recovered) / 0.05) ** 2;
  return c;
}

export interface TouchScore extends Score {
  anterior: TouchTrial;
  posterior: TouchTrial;
}

export function scoreTouch(fit: Fit, seed = 1): TouchScore {
  const b = buildBrain(fit);
  const s = settleWithGait(b, seed, 2000, 6000);
  const agar = s.gait;
  const water = gaitIn(b, TARGETS.water.mix, seed, 1000, 2000);
  const sham = touchFrom(s, b, null).vel;
  const anterior = touchFrom(s, b, TOUCH_AT.anterior, sham);
  const posterior = touchFrom(s, b, TOUCH_AT.posterior, sham);
  const cost = gaitCost(agar, TARGETS.agar) + gaitCost(water, TARGETS.water) + touchCost(anterior, posterior);
  return { cost, agar, water, anterior, posterior };
}
