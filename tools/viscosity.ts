/**
 * Held-out experiment V1c (DESIGN.md section 9): the gait across media
 * between water and agar. Fang-Yen et al. 2010 ≈ found frequency and
 * wavelength change smoothly and monotonically with viscosity; the fit only
 * ever saw the two ends, so the middle is a prediction.
 *
 * Usage: npm run viscosity -- path/to/fit.json [--seed 1] [--steps 10]
 */
import { readFileSync } from 'node:fs';
import type { Fit } from '../src/sim/fit';
import { buildBrain } from '../src/sim/world';
import { gaitIn } from './fit/evaluate';

const args = process.argv.slice(2);
const opt = (name: string, d: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : d;
};
const file = args.find((a) => a.endsWith('.json'));
if (!file) throw new Error('usage: viscosity <fit.json> [--seed N] [--steps N]');
const fit = JSON.parse(readFileSync(file, 'utf8')) as Fit;
const seed = opt('seed', 1);
const steps = opt('steps', 10);
const b = buildBrain(fit);

console.log('mix   f(Hz)  λ(L)   κL    v(mm/s) coh');
const rows: ({ mix: number } & ReturnType<typeof gaitIn>)[] = [];
for (let s = 0; s <= steps; s++) {
  const mix = s / steps;
  // Slower media need longer runs to see several cycles.
  const g = gaitIn(b, mix, seed, 1000 + 1000 * mix, 3000 + 3000 * mix);
  rows.push({ mix, ...g });
  console.log(
    `${mix.toFixed(2)}  ${g.frequency.toFixed(2).padStart(5)}  ${g.wavelength.toFixed(2).padStart(5)}  ${g.amplitude
      .toFixed(1)
      .padStart(4)}  ${g.speed.toFixed(3).padStart(7)} ${g.coherence.toFixed(2)}`,
  );
}
const monotone = (k: 'frequency' | 'wavelength') => rows.every((r, i) => i === 0 || r[k] <= rows[i - 1]![k] * 1.05);
console.log(`frequency falls monotonically: ${monotone('frequency')}; wavelength: ${monotone('wavelength')}`);
