/**
 * Headless runner: runs a plate in Node and prints a summary.
 *
 *   npm run sim -- --seed 42 --seconds 10
 */
import { centrelineLength } from '../src/sim/body';
import { NEURON_COUNT, connectome } from '../src/sim/connectome';
import { hashHex, hashState } from '../src/sim/hash';
import { MEDIUM_NAMES } from '../src/sim/plate';
import { STEPS_PER_SECOND, formatWormTime } from '../src/sim/time';
import { createWorld, step } from '../src/sim/world';

function parseArgs(argv: string[]): { seed: number; seconds: number } {
  let seed = 42;
  let seconds = 10;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = Number(argv[++i]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a whole number`);
    if (flag === '--seed') seed = value;
    else if (flag === '--seconds') seconds = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { seed, seconds };
}

const { seed, seconds } = parseArgs(process.argv.slice(2));
const world = createWorld(seed);
for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) step(world);

const head = `(${world.body.x[0]!.toFixed(0)}, ${world.body.y[0]!.toFixed(0)}) µm`;

console.log(`celegans headless run`);
console.log(`seed         ${seed}`);
console.log(`worm time    ${formatWormTime(world.step)}`);
console.log(`medium       ${MEDIUM_NAMES[world.medium]}`);
console.log(`body length  ${centrelineLength(world.body).toFixed(1)} µm, nose at ${head}`);
let lo = Infinity;
let hi = -Infinity;
for (const v of world.neurons.v) {
  lo = Math.min(lo, v);
  hi = Math.max(hi, v);
}
console.log(`neurons      ${NEURON_COUNT}, ${connectome.chemical.length} chemical synapses, ${connectome.gap.length} gap junction pairs`);
console.log(`voltages     ${lo.toFixed(1)} to ${hi.toFixed(1)} mV`);
console.log(`state hash   ${hashHex(hashState(world))}`);
