/**
 * Salt steering check (DESIGN.md sections 8.3 and 9, V3): put a crawling
 * worm beside a salt spot, once with the salt to its left and once (a copy
 * of the same worm) to its right, and see whether it turns towards it.
 * Without salt sensing the two runs are mirror images of nothing and turn
 * the same, so any difference is the salt.
 *
 * Usage: npm run chemotaxis [-- --fit path.json] [--seeds 5] [--seconds 60] [--mm 3] [--kill ASE]
 */
import { readFileSync } from 'node:fs';
import { GAIT_FIT } from '../src/sim/fits';
import type { Fit } from '../src/sim/fit';
import { buildBrain } from '../src/sim/world';
import { cellsOfClasses } from './fit/touchTrial';
import { saltTrial } from './fit/saltTrial';

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const fit: Fit = arg('fit') ? (JSON.parse(readFileSync(arg('fit')!, 'utf8')) as Fit) : GAIT_FIT;
const seeds = Number(arg('seeds') ?? 5);
const seconds = Number(arg('seconds') ?? 60);
const mm = Number(arg('mm') ?? 3);
const kill = arg('kill')?.split(',') ?? [];
const b = buildBrain(fit, cellsOfClasses(kill));
console.log(kill.length ? `killed: ${kill.join(' ')}` : 'intact');
let sum = 0;
for (let seed = 1; seed <= seeds; seed++) {
  const t = saltTrial(b, seed, seconds * 1000, mm * 1000);
  sum += t.towards;
  console.log(
    `seed ${seed}: salt left turns ${t.left.toFixed(2)} rad, right ${t.right.toFixed(2)} rad; towards salt ${t.towards.toFixed(2)} rad; ` +
      `closer by ${(t.closer / 1000).toFixed(2)} mm; nose salt ${t.c0.toFixed(1)} mM`,
  );
}
console.log(`mean turn towards salt ${(sum / seeds).toFixed(2)} rad`);
