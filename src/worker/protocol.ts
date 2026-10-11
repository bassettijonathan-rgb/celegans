/** Messages between the page and the simulation worker (DESIGN.md section 12). */

export type ToWorker =
  | { type: 'start'; seed: number }
  /** Simulation speed: 0 pauses, 1 is real worm time. */
  | { type: 'speed'; value: number }
  /** Inject a steady current into a neuron (pA); 0 stops it. */
  | { type: 'inject'; neuron: number; pA: number }
  | { type: 'clear-injections' };

export type FromWorker =
  /** The plate and the neurons' resting voltages; sent once at start. */
  | { type: 'plate'; radius: number; medium: number; rest: Float64Array }
  /** The body's centreline (nose first, µm), every neuron's voltage (mV) and the step. */
  | { type: 'tick'; step: number; x: Float64Array; y: Float64Array; v: Float32Array; inject: Float32Array };
