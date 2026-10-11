/**
 * The world: everything the simulation knows, as plain data (DESIGN.md section 12).
 *
 * M0 holds the plate and a worm's body at rest. Neurons arrive in M1,
 * mechanics in M2.
 */
import { restingBody, type Body } from './body';
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
  };
}

/** Advances the world by one step (1 ms of worm time). */
export function step(world: World): void {
  world.step += 1;
}
