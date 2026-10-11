/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 12).
 *
 * M1 adds the 302 neurons, wired from the connectome. The body still lies
 * still; mechanics arrive in M2.
 */
import { restingBody, type Body } from './body';
import { NEURON_COUNT } from './connectome';
import { buildNetwork, createNeuronState, stepNeurons, type Network, type NeuronState } from './neurons';
import { Medium, PLATE_RADIUS } from './plate';
import { Purpose, Rng } from './rng';

export interface World {
  seed: number;
  /** Steps since the plate was set up; one step is 1 ms of worm time. */
  step: number;
  /** State of the simulation's random stream (`Purpose.sim`). */
  rng: Uint32Array;
  medium: Medium;
  plateRadius: number;
  body: Body;
  neurons: NeuronState;
}

/** The network for the default parameters; derived from data, so built once and shared. */
let defaultNetwork: Network | undefined;
export function network(): Network {
  defaultNetwork ??= buildNetwork();
  return defaultNetwork;
}

export function createWorld(seed: number): World {
  const rng = new Rng(seed, Purpose.body);
  // Drop the worm somewhere in the middle third of the plate.
  const r = rng.range(0, PLATE_RADIUS / 3);
  const a = rng.range(0, 2 * Math.PI);
  return {
    seed,
    step: 0,
    rng: new Rng(seed, Purpose.sim).state,
    medium: Medium.agar,
    plateRadius: PLATE_RADIUS,
    body: restingBody(rng, r * Math.cos(a), r * Math.sin(a)),
    neurons: createNeuronState(network()),
  };
}

/** Advances the world by one step (1 ms of worm time). */
export function step(world: World): void {
  const net = network();
  if (net.params.noise > 0) {
    const rng = Rng.fromState(world.rng);
    stepNeurons(net, world.neurons, 1, rng);
    world.rng.set(rng.state);
  } else {
    stepNeurons(net, world.neurons, 1);
  }
  world.step += 1;
}

/** Lab bench: inject a steady current (pA) into a neuron, as with an electrode; 0 stops it. */
export function setInjection(world: World, neuron: number, pA: number): void {
  if (!Number.isInteger(neuron) || neuron < 0 || neuron >= NEURON_COUNT) throw new Error(`No neuron ${neuron}`);
  if (!Number.isFinite(pA)) throw new Error(`Bad current ${pA}`);
  world.neurons.inject[neuron] = pA;
}
