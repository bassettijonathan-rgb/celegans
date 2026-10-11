/**
 * The worm's outline from its centreline: each node pushed out by the body
 * radius on both sides, down one side and back up the other.
 */
import { bodyRadius } from '../sim/body';

/** Returns a closed polygon as [x0, y0, x1, y1, …] in µm. */
export function wormOutline(x: ArrayLike<number>, y: ArrayLike<number>): number[] {
  const n = x.length;
  const left: number[] = [];
  const right: number[] = [];
  for (let i = 0; i < n; i++) {
    // Tangent from the neighbouring nodes (one-sided at the ends).
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    const tx = x[b]! - x[a]!;
    const ty = y[b]! - y[a]!;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const r = bodyRadius(i / (n - 1));
    left.push(x[i]! + nx * r, y[i]! + ny * r);
    right.push(x[i]! - nx * r, y[i]! - ny * r);
  }
  const out = left;
  for (let i = n - 1; i >= 0; i--) out.push(right[2 * i]!, right[2 * i + 1]!);
  return out;
}
