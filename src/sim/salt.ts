/**
 * Salt on the plate and the two salt-sensing neurons (DESIGN.md section 8.3).
 *
 * The field: the chemotaxis assays spot a drop of concentrated NaCl on the
 * agar hours before the worms go on (Bargmann & Horvitz 1991 ≈;
 * Pierce-Shimomura et al. 1999 ≈: 10 µl of 2.5 M, 12 to 16 h before). The
 * salt spreads by diffusion through a thin agar layer, so each spot is the
 * exact solution of 2D diffusion from a point:
 *
 *     C(r, t) = N / (4π D t h) · exp(−r² / (4 D t))
 *
 * for N µmol placed t ms ago in agar h µm thick. Spots add up. The plate's
 * wall is ignored (no reflection): with the gradient spanning centimetres
 * this overstates the loss at the rim, a small error near the edge only.
 * Plain data: the world keeps the list of spots, and the field is computed
 * where it is needed (at the nose), so nothing is gridded.
 *
 * The sensors: ASEL is excited by rising salt and ASER by falling salt
 * (Suzuki et al. 2008 ≈), and both adapt: they report the recent change in
 * concentration at the nose, not its level. Each ASE cell keeps an adapted
 * concentration that follows the real one with time constant ADAPT_MS; the
 * stimulus is the log ratio of the two (a relative change, so the same step
 * counts the same at any level, as in Weber's law). The channel is a
 * conductance to the excitatory reversal, like touch and stretch.
 */
import { cellIndex } from './connectome';

/** Diffusion coefficient of NaCl in agar, µm²/ms (1.5 × 10⁻⁹ m²/s in water; agar about the same for small ions, ≈). */
export const SALT_D = 1.5;
/** Agar thickness, µm (≈ 10 ml in a 9 cm dish). */
export const AGAR_THICKNESS = 1600;
/** Conversion: 1 µmol per µm³ is 10¹² mM. */
const MM_PER_UMOL_UM3 = 1e12;

/** A salt spot: where, how much (µmol) and when it was placed (world step; may be negative, i.e. before the worm went on). */
export interface SaltSpot {
  x: number;
  y: number;
  umol: number;
  placed: number;
}

/** Salt concentration (mM) at (x, y) at world step `now`. */
export function saltAt(spots: readonly SaltSpot[], x: number, y: number, now: number): number {
  let c = 0;
  for (const s of spots) {
    const t = now - s.placed;
    if (t <= 0) continue;
    const r2 = (x - s.x) ** 2 + (y - s.y) ** 2;
    const fourDt = 4 * SALT_D * t;
    c += ((s.umol * MM_PER_UMOL_UM3) / (Math.PI * fourDt * AGAR_THICKNESS)) * Math.exp(-r2 / fourDt);
  }
  return c;
}

/** How fast the ASE cells adapt to a new salt level, ms (guess, labelled; Suzuki 2008 ≈ show responses lasting seconds). */
export const ADAPT_MS = 10_000;
/** Salt level below which changes stop mattering, mM (guess: keeps the log ratio finite on bare agar). */
export const SALT_FLOOR = 1;
/** Log ratio of concentration to adapted concentration at which the channel is fully open (guess: a 10% change). */
export const SALT_SATURATION = 0.1;
/** Fully open salt channel conductance, nS (guess, the same scale as the touch channel). */
export const SALT_CONDUCTANCE = 1;

/** The two salt sensors, in this order: ASEL (rising salt), ASER (falling salt). */
export const ASE = [cellIndex('ASEL'), cellIndex('ASER')] as const;

/**
 * Updates the adapted concentrations (`adapted`, one per ASE cell) for the
 * concentration `c` at the nose over `dt` ms, and adds the open salt
 * channels to `sense` (signed nS, positive excitatory).
 */
export function senseSalt(c: number, adapted: Float64Array, dt: number, sense: Float64Array): void {
  for (let k = 0; k < ASE.length; k++) {
    const d = Math.log((c + SALT_FLOOR) / (adapted[k]! + SALT_FLOOR));
    const drive = k === 0 ? d : -d;
    const open = Math.min(1, Math.max(0, drive / SALT_SATURATION));
    sense[ASE[k]!] = sense[ASE[k]!]! + SALT_CONDUCTANCE * open;
    adapted[k] = c + (adapted[k]! - c) * Math.exp(-dt / ADAPT_MS);
  }
}
