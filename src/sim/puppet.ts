/**
 * Puppet mode (DESIGN.md section 12, M2): the lab drives the muscles with a
 * prescribed travelling wave instead of the brain. It tests the body and the
 * media on their own; it is not behaviour, and M3 replaces it with the motor
 * circuit.
 */
import { MUSCLE_COUNT, muscles } from './muscles';

export interface Puppet {
  on: boolean;
  /** Undulations per second. */
  frequency: number;
  /** Wavelength in body lengths. */
  wavelength: number;
  /** 0 to 1: how far each side's activation swings around half. */
  amplitude: number;
  /** Phase of the wave at the nose, radians; advanced every step so a change of frequency never jumps. */
  phase: number;
}

/**
 * The gait to drive in a medium from water (mix 0) to agar (mix 1), read off
 * the real worm's gait so the puppet looks plausible: swimming ≈ 2 Hz with a
 * wavelength ≈ 1.5 body lengths, crawling ≈ 0.5 Hz with ≈ 0.65 (Fang-Yen et
 * al. 2010 ≈; Berri et al. 2009 ≈). Frequency is interpolated in log space
 * and wavelength linearly, as the medium itself is. No test depends on these.
 */
export function puppetGait(mix: number): { frequency: number; wavelength: number; amplitude: number } {
  const m = Math.min(1, Math.max(0, mix));
  return {
    frequency: Math.exp(Math.log(2) + m * (Math.log(0.5) - Math.log(2))),
    wavelength: 1.5 + m * (0.65 - 1.5),
    amplitude: 0.42 + m * (0.58 - 0.42),
  };
}

export function createPuppet(mix: number): Puppet {
  return { on: false, ...puppetGait(mix), phase: 0 };
}

/**
 * Sets each muscle's activation from the wave at its position and advances
 * the phase by dt ms. Dorsal and ventral are in antiphase; the crest moves
 * from head to tail, which pushes the worm forward.
 */
export function drivePuppet(p: Puppet, activation: Float64Array, dt: number): void {
  p.phase = (p.phase + (2 * Math.PI * p.frequency * dt) / 1000) % (2 * Math.PI);
  for (let m = 0; m < MUSCLE_COUNT; m++) {
    const mu = muscles[m]!;
    const wave = Math.sin((2 * Math.PI * mu.centre) / p.wavelength - p.phase);
    activation[m] = 0.5 * (1 + mu.side * p.amplitude * wave);
  }
}
