/**
 * The worm's body as a 2D rod seen from above, lying on its side
 * (DESIGN.md section 6.1). Lengths are in µm.
 *
 * The overdamped mechanics that move it are in mechanics.ts.
 */
import type { Rng } from './rng';

/** Length of a young adult hermaphrodite, ≈ 1 mm (DESIGN.md section 2). */
export const BODY_LENGTH = 1000;

/** Rod segments (DESIGN.md D9); the centreline has one more node than this. */
export const SEGMENTS = 48;
export const NODES = SEGMENTS + 1;
export const SEGMENT_LENGTH = BODY_LENGTH / SEGMENTS;

/** Half the largest body width, ≈ 40 µm (adult width ≈ 60–80 µm, DESIGN.md section 2). */
export const MAX_RADIUS = 40;

/**
 * Body radius at arc length fraction u (0 = nose, 1 = tail tip): a rounded
 * profile that tapers to both ends, the shape used by Niebur & Erdős 1991
 * and Boyle, Berri & Cohen 2012. `TIP` keeps the ends from shrinking to zero.
 */
const TIP = 0.04;
export function bodyRadius(u: number): number {
  const c = (u - 0.5) / (0.5 + TIP);
  return MAX_RADIUS * Math.sqrt(1 - c * c);
}

/** The centreline: node positions from nose (index 0) to tail. */
export interface Body {
  x: Float64Array;
  y: Float64Array;
}

/**
 * A resting posture like a worm just placed on a plate: a gentle travelling
 * wave of curvature along the body, random heading and phase, centred at
 * (cx, cy). Built segment by segment so every segment has the exact length.
 */
export function restingBody(rng: Rng, cx: number, cy: number): Body {
  const x = new Float64Array(NODES);
  const y = new Float64Array(NODES);
  const heading = rng.range(0, 2 * Math.PI);
  const phase = rng.range(0, 2 * Math.PI);
  // Curvature κ(u) = κ₀ sin(k u + φ). Crawling on agar has wavelength
  // ≈ 0.65 body lengths (Fang-Yen et al. 2010 ≈); κ₀·L = 5 is a modest bend.
  const k = (2 * Math.PI) / 0.65;
  const kappa0 = 5 / BODY_LENGTH;
  let angle = heading;
  for (let i = 1; i < NODES; i++) {
    const u = (i - 0.5) / SEGMENTS;
    angle += kappa0 * Math.sin(k * u + phase) * SEGMENT_LENGTH;
    x[i] = x[i - 1]! + SEGMENT_LENGTH * Math.cos(angle);
    y[i] = y[i - 1]! + SEGMENT_LENGTH * Math.sin(angle);
  }
  // Centre the body on (cx, cy).
  let mx = 0;
  let my = 0;
  for (let i = 0; i < NODES; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= NODES;
  my /= NODES;
  for (let i = 0; i < NODES; i++) {
    x[i] = x[i]! - mx + cx;
    y[i] = y[i]! - my + cy;
  }
  return { x, y };
}

/** Length of the centreline, summed over segments. */
export function centrelineLength(body: Body): number {
  let total = 0;
  for (let i = 1; i < body.x.length; i++) {
    total += Math.hypot(body.x[i]! - body.x[i - 1]!, body.y[i]! - body.y[i - 1]!);
  }
  return total;
}
