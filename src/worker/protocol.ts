/** Messages between the page and the simulation worker (DESIGN.md section 12). */

export type ToWorker =
  | { type: 'start'; seed: number }
  /** Simulation speed: 0 pauses, 1 is real worm time. */
  | { type: 'speed'; value: number };

export type FromWorker =
  /** The plate; sent once at start. */
  | { type: 'plate'; radius: number; medium: number }
  /** The body's centreline (nose first, µm) and the current step. */
  | { type: 'tick'; step: number; x: Float64Array; y: Float64Array };
