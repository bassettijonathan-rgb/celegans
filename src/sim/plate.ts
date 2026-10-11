/**
 * The plate the worm lives on (DESIGN.md sections 6.3 and 10).
 *
 * Lengths are in µm. The plate is a disc of agar, or of buffer when the
 * worm is put in water to swim.
 */

/** What the worm moves through. Saved: append-only, never reorder or reuse a value. */
export const Medium = {
  agar: 0,
  water: 1,
} as const;
export type Medium = (typeof Medium)[keyof typeof Medium];

export const MEDIUM_NAMES: Record<Medium, string> = {
  [Medium.agar]: 'agar',
  [Medium.water]: 'water',
};

/**
 * Radius of the plate. A 20 mm disc keeps the worm easy to find; the
 * chemotaxis assay plates of M5 (Bargmann & Horvitz 1991 used standard
 * Petri dishes) will be set up at their real size there.
 */
export const PLATE_RADIUS = 10_000;
