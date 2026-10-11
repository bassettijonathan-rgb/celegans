/**
 * Headless runner: runs a plate in Node and prints a summary.
 *
 *   npm run sim -- --seed 42 --seconds 10 [--puppet] [--medium 0..1]
 *
 * --puppet drives the muscles with the prescribed wave; --medium runs from
 * water (0) to agar (1, the default).
 */
import { centrelineLength } from '../src/sim/body';
import { NEURON_COUNT, connectome } from '../src/sim/connectome';
import { hashHex, hashState } from '../src/sim/hash';
import { MEDIUM_NAMES } from '../src/sim/plate';
import { STEPS_PER_SECOND, formatWormTime } from '../src/sim/time';
import { createWorld, setMedium, setPuppet, step } from '../src/sim/world';

function parseArgs(argv: string[]): { seed: number; seconds: number; puppet: boolean; mix: number } {
  let seed = 42;
  let seconds = 10;
  let puppet = false;
  let mix = 1;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--puppet') {
      puppet = true;
      continue;
    }
    if (flag === '--medium') {
      mix = Number(argv[++i]);
      if (!(mix >= 0 && mix <= 1)) throw new Error('--medium needs a number from 0 (water) to 1 (agar)');
      continue;
    }
    const value = Number(argv[++i]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`${flag} needs a whole number`);
    if (flag === '--seed') seed = value;
    else if (flag === '--seconds') seconds = value;
    else throw new Error(`Unknown argument: ${flag}`);
  }
  return { seed, seconds, puppet, mix };
}

const { seed, seconds, puppet, mix } = parseArgs(process.argv.slice(2));
const world = createWorld(seed);
setMedium(world, mix);
setPuppet(world, puppet);
const centre = () => {
  let x = 0;
  let y = 0;
  for (let i = 0; i < world.body.x.length; i++) {
    x += world.body.x[i]!;
    y += world.body.y[i]!;
  }
  return [x / world.body.x.length, y / world.body.y.length] as const;
};
const [x0, y0] = centre();
for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) step(world);
const [x1, y1] = centre();
const travelled = Math.hypot(x1 - x0, y1 - y0);

const head = `(${world.body.x[0]!.toFixed(0)}, ${world.body.y[0]!.toFixed(0)}) µm`;

console.log(`celegans headless run`);
console.log(`seed         ${seed}`);
console.log(`worm time    ${formatWormTime(world.step)}`);
console.log(`medium       ${MEDIUM_NAMES[world.medium]} (${(world.mix * 100).toFixed(0)}% of the way from water to agar)`);
console.log(`puppet       ${world.puppet.on ? `on, ${world.puppet.frequency.toFixed(2)} Hz, wavelength ${world.puppet.wavelength.toFixed(2)} body lengths` : 'off'}`);
console.log(`travelled    ${travelled.toFixed(0)} µm (${seconds > 0 ? (travelled / seconds / 1000).toFixed(3) : '0'} mm/s)`);
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
