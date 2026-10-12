/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 12).
 *
 * M1 added the 302 neurons, wired from the connectome. M2 added the body's
 * mechanics, the 95 muscles as actuators and the puppet drive. M3 makes the
 * muscles cells of the network: unless the puppet is on, the motor neurons
 * drive them through the real neuromuscular junctions, and motor neurons
 * feel the body's bending.
 */
import { MAX_RADIUS, NODES, restingBody, type Body } from './body';
import { NEURON_COUNT } from './connectome';
import { DEFAULT_ROD, RodWorkspace, dragFor, stepRod, turningAngles } from './mechanics';
import { UNFITTED, type Fit } from './fit';
import { buildProprioception, senseProprioception, stepMuscleCalcium, type ProprioMap } from './motor';
import { MUSCLE_COUNT, activeTurning } from './muscles';
import { DEFAULT_PARAMS, buildNetwork, createNeuronState, stepNeurons, type Network, type NeuronState } from './neurons';
import { Medium, PLATE_RADIUS } from './plate';
import { createPuppet, drivePuppet, puppetGait, type Puppet } from './puppet';
import { Purpose, Rng } from './rng';
import { senseTouch, TOUCH_MS, type Touch } from './touch';

export interface World {
  seed: number;
  /** Steps since the plate was set up; one step is 1 ms of worm time. */
  step: number;
  /** State of the simulation's random stream (`Purpose.sim`). */
  rng: Uint32Array;
  medium: Medium;
  /** Drag from water (0) to agar (1), the viscosity slider (DESIGN.md section 6.3). */
  mix: number;
  plateRadius: number;
  body: Body;
  neurons: NeuronState;
  /**
   * Activation (calcium) of each body-wall muscle, 0 to 1, in connectome order
   * (MDL01 first). At rest both sides sit at one half and cancel.
   */
  muscles: Float64Array;
  puppet: Puppet;
  /** The eyelash touch in progress, if any (DESIGN.md section 8.2). */
  touch: Touch | null;
  /** Cells killed by laser ablation, sorted; the brain must be built with the same list. */
  ablated: number[];
  /**
   * Optogenetics (DESIGN.md section 10): light-gated channel conductance per
   * neuron, nS, signed like `bias`: positive a channelrhodopsin (cation,
   * excitatory), negative a chloride pump or channel (inhibitory).
   */
  light: Float64Array;
}

/**
 * Everything derived from a fit: the network and the proprioceptive map.
 * Derived data, rebuilt on load; the world stores only which fit it uses.
 */
export interface Brain {
  fit: Fit;
  /** Ablated cells, sorted. */
  ablated: number[];
  net: Network;
  proprio: ProprioMap;
}

export function buildBrain(fit: Fit, ablated: readonly number[] = []): Brain {
  const dead = [...new Set(ablated)].sort((a, b) => a - b);
  const proprio = buildProprioception(fit.proprio);
  // Dead cells sense nothing.
  const keep = proprio.cell.reduce<number[]>((k, c, i) => (dead.includes(c) ? k : [...k, i]), []);
  return {
    fit,
    ablated: dead,
    net: buildNetwork(DEFAULT_PARAMS, fit, dead),
    proprio: {
      cell: Int32Array.from(keep, (i) => proprio.cell[i]!),
      side: Float64Array.from(keep, (i) => proprio.side[i]!),
      from: Int32Array.from(keep, (i) => proprio.from[i]!),
      to: Int32Array.from(keep, (i) => proprio.to[i]!),
      gain: Float64Array.from(keep, (i) => proprio.gain[i]!),
    },
  };
}

/** The brain the app uses; built once and shared. */
let defaultBrain: Brain | undefined;
export function brain(): Brain {
  defaultBrain ??= buildBrain(UNFITTED);
  return defaultBrain;
}

/** The default brain's network. */
export function network(): Network {
  return brain().net;
}

export function createWorld(seed: number, b: Brain = brain()): World {
  const rng = new Rng(seed, Purpose.body);
  // Drop the worm somewhere in the middle third of the plate.
  const r = rng.range(0, PLATE_RADIUS / 3);
  const a = rng.range(0, 2 * Math.PI);
  return {
    seed,
    step: 0,
    rng: new Rng(seed, Purpose.sim).state,
    medium: Medium.agar,
    mix: 1,
    plateRadius: PLATE_RADIUS,
    body: restingBody(rng, r * Math.cos(a), r * Math.sin(a)),
    neurons: createNeuronState(b.net),
    muscles: new Float64Array(MUSCLE_COUNT).fill(0.5),
    puppet: createPuppet(1),
    touch: null,
    ablated: [...b.ablated],
    light: new Float64Array(NEURON_COUNT),
  };
}

/** Scratch for the body step; derived each step, never part of the state. */
const workspace = new RodWorkspace();
const theta0 = new Float64Array(NODES);
const turning = new Float64Array(NODES);

/** Advances the world by one step (1 ms of worm time). */
export function step(world: World, b: Brain = brain()): void {
  const net = b.net;
  if (world.ablated.length !== b.ablated.length || world.ablated.some((c, i) => c !== b.ablated[i])) {
    throw new Error('the brain was built for different ablations than the world has');
  }
  turningAngles(world.body.x, world.body.y, turning);
  senseProprioception(b.proprio, turning, world.neurons.sense!);
  senseTouch(world.touch, world.step, world.neurons.sense!);
  for (let i = 0; i < NEURON_COUNT; i++) world.neurons.sense![i] = world.neurons.sense![i]! + world.light[i]!;
  for (const c of world.ablated) world.neurons.sense![c] = 0;
  if (world.touch && world.step >= world.touch.until) world.touch = null;
  if (net.params.noise > 0) {
    const rng = Rng.fromState(world.rng);
    stepNeurons(net, world.neurons, 1, rng);
    world.rng.set(rng.state);
  } else {
    stepNeurons(net, world.neurons, 1);
  }
  if (world.puppet.on) drivePuppet(world.puppet, world.muscles, 1);
  else stepMuscleCalcium(net, world.neurons.v, world.muscles, 1);
  activeTurning(world.muscles, theta0);
  stepRod(world.body.x, world.body.y, theta0, dragFor(world.mix), DEFAULT_ROD, 1, workspace, {
    wall: world.plateRadius - MAX_RADIUS,
  });
  world.step += 1;
}

/**
 * Lab bench: put the plate under a medium from water (0) to agar (1). The
 * plate counts as agar from half way. The puppet's gait follows the medium.
 */
export function setMedium(world: World, mix: number): void {
  if (!Number.isFinite(mix)) throw new Error(`Bad medium ${mix}`);
  world.mix = Math.min(1, Math.max(0, mix));
  world.medium = world.mix >= 0.5 ? Medium.agar : Medium.water;
  Object.assign(world.puppet, puppetGait(world.mix));
}

/** Lab bench: drive the muscles with the puppet wave, or hand them back to the motor neurons. */
export function setPuppet(world: World, on: boolean): void {
  world.puppet.on = on;
}

/** Lab bench: inject a steady current (pA) into a neuron, as with an electrode; 0 stops it. */
export function setInjection(world: World, neuron: number, pA: number): void {
  if (!Number.isInteger(neuron) || neuron < 0 || neuron >= NEURON_COUNT) throw new Error(`No neuron ${neuron}`);
  if (!Number.isFinite(pA)) throw new Error(`Bad current ${pA}`);
  world.neurons.inject[neuron] = pA;
}

/**
 * Lab bench: stroke the body with an eyelash at body fraction `at` (0 nose,
 * 1 tail). The touch receptors under that point open for TOUCH_MS.
 */
export function touchBody(world: World, at: number): void {
  if (!Number.isFinite(at) || at < 0 || at > 1) throw new Error(`Bad touch point ${at}`);
  world.touch = { at, until: world.step + TOUCH_MS };
}

/**
 * Lab bench: kill cells by laser (or bring them back). Returns the new sorted
 * list; build the brain again with it (`buildBrain(fit, world.ablated)`).
 * A killed cell keeps a voltage but has no synapses, gap junctions or senses.
 */
export function setAblated(world: World, cells: readonly number[]): number[] {
  for (const c of cells) if (!Number.isInteger(c) || c < 0 || c >= NEURON_COUNT) throw new Error(`No neuron ${c}`);
  world.ablated = [...new Set(cells)].sort((a, b) => a - b);
  return world.ablated;
}

/** Lab bench: shine light on a neuron carrying a light-gated channel of `nS` (signed; 0 switches it off). */
export function setLight(world: World, neuron: number, nS: number): void {
  if (!Number.isInteger(neuron) || neuron < 0 || neuron >= NEURON_COUNT) throw new Error(`No neuron ${neuron}`);
  if (!Number.isFinite(nS)) throw new Error(`Bad conductance ${nS}`);
  world.light[neuron] = nS;
}
