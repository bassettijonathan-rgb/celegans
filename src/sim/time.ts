/**
 * Simulated time (DESIGN.md section 2).
 *
 * One step is 1 ms of worm time, the neural step. Cells that need finer
 * steps (spiking neurons, muscle) will substep inside one step from M1.
 */

/** Simulation steps per second of worm time. */
export const STEPS_PER_SECOND = 1000;

/** Formats a step count as worm time, e.g. "1 min 05.2 s". */
export function formatWormTime(step: number): string {
  const tenths = Math.floor(step / (STEPS_PER_SECOND / 10));
  const totalSeconds = Math.floor(tenths / 10);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m} min ${String(s).padStart(2, '0')}.${tenths % 10} s`;
}
