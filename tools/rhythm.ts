/**
 * Experiment V5 (DESIGN.md section 9, D8): where the rhythm comes from.
 * Runs the shipped gait fit with proprioception switched off, all at once
 * and class by class, on agar and in water, and reports the gait. A result,
 * not a pass/fail.
 *
 * Usage: npm run rhythm [-- --seed 1]
 */
import { GAIT_FIT } from '../src/sim/fits';
import type { Fit } from '../src/sim/fit';
import { buildBrain } from '../src/sim/world';
import { gaitIn } from './fit/evaluate';

const i = process.argv.indexOf('--seed');
const seed = i >= 0 ? Number(process.argv[i + 1]) : 1;
const variants: [string, Fit][] = [
  ['intact', GAIT_FIT],
  ['no proprioception', { ...GAIT_FIT, proprio: [] }],
  ...GAIT_FIT.proprio.map((r): [string, Fit] => [`no ${r.cls} stretch`, { ...GAIT_FIT, proprio: GAIT_FIT.proprio.filter((q) => q !== r) }]),
];
const fmt = (g: ReturnType<typeof gaitIn>) =>
  `${g.frequency.toFixed(2)} Hz λ ${g.wavelength.toFixed(2)} κL ${g.amplitude.toFixed(1)} v ${g.speed.toFixed(3)}`;
for (const [name, fit] of variants) {
  const b = buildBrain(fit);
  console.log(`${name.padEnd(20)} agar ${fmt(gaitIn(b, 1, seed, 2000, 6000))} | water ${fmt(gaitIn(b, 0, seed, 1000, 2000))}`);
}
