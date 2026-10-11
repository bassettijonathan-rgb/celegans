/**
 * Experiments V2a, V2b and V4a (DESIGN.md section 9): touch the crawling
 * worm near the head or the tail and watch its speed and its command
 * interneurons. With --kill, the same after laser ablation (V2d, held out).
 *
 * Usage: npm run touch [-- --fit path.json] [--kill ALM,AVM] [--seeds 5]
 */
import { readFileSync } from 'node:fs';
import { GAIT_FIT } from '../src/sim/fits';
import type { Fit } from '../src/sim/fit';
import { cellsOfClasses, touchTrial } from './fit/touchTrial';
import { buildBrain } from '../src/sim/world';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fit: Fit = arg('fit') ? (JSON.parse(readFileSync(arg('fit')!, 'utf8')) as Fit) : GAIT_FIT;
const kill = arg('kill')?.split(',') ?? [];
const seeds = Number(arg('seeds') ?? 3);
const b = buildBrain(fit, cellsOfClasses(kill));

console.log(kill.length ? `killed: ${kill.join(' ')}` : 'intact');
for (const [name, at] of [
  ['anterior touch (0.1)', 0.1],
  ['posterior touch (0.9)', 0.9],
] as const) {
  for (let seed = 1; seed <= seeds; seed++) {
    const t = touchTrial(b, at, seed);
    console.log(
      `${name} seed ${seed}: speed before ${t.before.toFixed(3)} after ${t.after.toFixed(3)} mm/s, ` +
        `reversed ${t.reversed ? `yes after ${t.latency} ms` : 'no'} | AVA ${t.avaBefore.toFixed(1)}→${t.avaAfter.toFixed(1)} mV, ` +
        `AVB ${t.avbBefore.toFixed(1)}→${t.avbAfter.toFixed(1)} mV`,
    );
  }
}
