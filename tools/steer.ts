/**
 * Optogenetic steering check (DESIGN.md section 9.2): light AVA (or AVB) in
 * a crawling worm for 2 s and compare its speed with a sham trial, over
 * several seeds, plus the gait in each medium.
 *
 * Usage: npm run steer [-- --fit path.json] [--seeds 5] [--cells AVA] [--nS 2]
 */
import { readFileSync } from 'node:fs';
import { GAIT_FIT } from '../src/sim/fits';
import type { Fit } from '../src/sim/fit';
import { buildBrain } from '../src/sim/world';
import { cellsOfClasses, driveFrom, settleWithGait, touchFrom } from './fit/touchTrial';
import { TARGETS, gaitIn } from './fit/evaluate';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fit: Fit = arg('fit') ? (JSON.parse(readFileSync(arg('fit')!, 'utf8')) as Fit) : GAIT_FIT;
const seeds = Number(arg('seeds') ?? 5);
const classes = (arg('cells') ?? 'AVA').split(',');
const nS = Number(arg('nS') ?? 2);
const b = buildBrain(fit);
const fmt = (g: { frequency: number; wavelength: number; amplitude: number; speed: number }) =>
  `${g.frequency.toFixed(2)} Hz λ ${g.wavelength.toFixed(2)} κL ${g.amplitude.toFixed(1)} v ${g.speed.toFixed(3)}`;
for (let seed = 1; seed <= seeds; seed++) {
  const s = settleWithGait(b, seed, 2000, 6000);
  const water = gaitIn(b, TARGETS.water.mix, seed, 1000, 2000);
  const sham = touchFrom(s, b, null).vel;
  const light: Record<number, number> = {};
  for (const c of cellsOfClasses(classes)) light[c] = nS;
  const t = driveFrom(s, b, light, sham);
  console.log(
    `seed ${seed}: agar ${fmt(s.gait)} | water ${fmt(water)} | ${classes.join('+')} lit ${nS} nS: before ${t.before.toFixed(3)}, ` +
      `slowest ${t.minSpeed.toFixed(3)} mm/s, ${t.reversed ? `backs up after ${t.latency} ms` : 'no reversal'}, after light ${t.recovered.toFixed(3)}`,
  );
}
