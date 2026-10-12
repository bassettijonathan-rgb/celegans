/**
 * The fits shipped with the app (DESIGN.md section 7). Each is a set of
 * fitted guesses, never measurements: `meta` says what it was fitted to.
 * Regenerate with `npm run fit`; never edit the JSON by hand.
 */
import gait from '../data/fits/gait.json';
import type { Fit } from './fit';
import { buildBrain, type Brain } from './world';

/** Strengths fitted so the brain crawls on agar and swims in water (V1a, V1b) and backs up while AVA is lit (M4). */
export const GAIT_FIT: Fit = gait as Fit;

let gaitBrain: Brain | undefined;
/** The brain the app runs: the gait fit. Built once and shared. */
export function appBrain(): Brain {
  gaitBrain ??= buildBrain(GAIT_FIT);
  return gaitBrain;
}
