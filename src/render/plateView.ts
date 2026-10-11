/**
 * Draws the plate and the worm (DESIGN.md section 10). Reads snapshots only.
 * Scene units are µm.
 */
import { Container, Graphics } from 'pixi.js';
import { bodyRadius } from '../sim/body';
import { MUSCLE_COUNT, muscleWeight, muscles } from '../sim/muscles';
import { wormOutline } from './wormShape';

const AGAR = 0xd9c79a;
const WATER = 0x9fc3d6;
const WORM_BODY = 0xf1ece0;
const WORM_EDGE = 0x8f8676;
const GUT = 0xb9a888;
const MUSCLE = 0xd8504a;

/** Blends two 0xRRGGBB colours, t = 0 gives a. */
function blend(a: number, b: number, t: number): number {
  const ch = (c: number, k: number) => (c >> k) & 0xff;
  const mix = (k: number) => Math.round(ch(a, k) + (ch(b, k) - ch(a, k)) * t) << k;
  return mix(16) | mix(8) | mix(0);
}

/** Each side's pull (0 to 1) at node i of n, from the muscle activations: dorsal first. */
export function sidePull(activation: ArrayLike<number>, i: number, n: number): [number, number] {
  const u = i / (n - 1);
  let dorsal = 0;
  let ventral = 0;
  for (let m = 0; m < MUSCLE_COUNT; m++) {
    const w = muscleWeight(muscles[m]!, u);
    if (w === 0) continue;
    if (muscles[m]!.side > 0) dorsal += 0.5 * w * activation[m]!;
    else ventral += 0.5 * w * activation[m]!;
  }
  return [dorsal, ventral];
}

export class PlateView {
  readonly root = new Container();
  private readonly plate = new Graphics();
  private readonly worm = new Graphics();
  private radius = 0;
  private mix = -1;

  constructor() {
    this.root.addChild(this.plate, this.worm);
  }

  /** Draws the dish; `mix` runs from water (0) to agar (1). Redraws only when something changed. */
  setPlate(radius: number, mix: number): void {
    if (radius === this.radius && mix === this.mix) return;
    this.radius = radius;
    this.mix = mix;
    const fill = blend(WATER, AGAR, mix);
    this.plate.clear();
    // Dish rim, then the medium with a faint lighter centre like a lit plate.
    this.plate.circle(0, 0, radius * 1.03).fill({ color: 0x2a2f36 });
    this.plate.circle(0, 0, radius).fill({ color: fill });
    for (let k = 1; k <= 6; k++) {
      this.plate.circle(0, 0, radius * (1 - k * 0.14)).fill({ color: 0xffffff, alpha: 0.025 });
    }
  }

  /** Draws the worm; muscles (0 to 1 each, connectome order) tint its dorsal and ventral sides. */
  setWorm(x: Float64Array, y: Float64Array, activation?: ArrayLike<number>): void {
    const g = this.worm;
    g.clear();
    const n = x.length;
    // Round the nose and tail tips, then the body outline over them.
    g.circle(x[0]!, y[0]!, bodyRadius(0)).circle(x[n - 1]!, y[n - 1]!, bodyRadius(1));
    g.fill({ color: WORM_BODY, alpha: 0.82 }).stroke({ color: WORM_EDGE, width: 2.5, alpha: 0.9 });
    g.poly(wormOutline(x, y)).fill({ color: WORM_BODY }).stroke({ color: WORM_EDGE, width: 2.5, alpha: 0.9 });
    if (activation) this.drawMuscles(x, y, activation);
    // The gut runs from behind the pharynx (≈ 15% of the length) to near the tail.
    const from = Math.round(n * 0.15);
    const to = Math.round(n * 0.9);
    g.moveTo(x[from]!, y[from]!);
    for (let i = from + 1; i <= to; i++) g.lineTo(x[i]!, y[i]!);
    g.stroke({ color: GUT, width: 22, alpha: 0.45, cap: 'round', join: 'round' });
    // Pharynx: a narrower tube in the head with the terminal bulb.
    g.moveTo(x[0]!, y[0]!);
    for (let i = 1; i <= from; i++) g.lineTo(x[i]!, y[i]!);
    g.stroke({ color: GUT, width: 9, alpha: 0.55, cap: 'round', join: 'round' });
    g.circle(x[from - 1]!, y[from - 1]!, 13).fill({ color: GUT, alpha: 0.6 });
  }

  /**
   * A band just inside the cuticle on each side, red where that side's
   * muscles pull. Dorsal is on the left of the nose-to-tail direction, as in
   * the mechanics (dorsal bends are positive turns).
   */
  private drawMuscles(x: Float64Array, y: Float64Array, activation: ArrayLike<number>): void {
    const g = this.worm;
    const n = x.length;
    const pulls = Array.from({ length: n }, (_, i) => sidePull(activation, i, n));
    const edge = (i: number, side: number, depth: number): [number, number] => {
      const a = Math.max(0, i - 1);
      const b = Math.min(n - 1, i + 1);
      const tx = x[b]! - x[a]!;
      const ty = y[b]! - y[a]!;
      const len = Math.hypot(tx, ty) || 1;
      const r = bodyRadius(i / (n - 1)) * depth * side;
      return [x[i]! - (ty / len) * r, y[i]! + (tx / len) * r];
    };
    for (const [side, k] of [
      [1, 0],
      [-1, 1],
    ] as const) {
      for (let i = 0; i < n - 1; i++) {
        const pull = 0.5 * (pulls[i]![k] + pulls[i + 1]![k]);
        if (pull < 0.02) continue;
        g.poly([...edge(i, side, 0.92), ...edge(i + 1, side, 0.92), ...edge(i + 1, side, 0.5), ...edge(i, side, 0.5)]);
        // Squared, so a side pulling harder than the other stands out.
        g.fill({ color: MUSCLE, alpha: 0.9 * Math.min(1, pull) ** 2 });
      }
    }
  }

  get bounds(): { x: number; y: number; width: number; height: number } {
    const r = this.radius * 1.05;
    return { x: -r, y: -r, width: 2 * r, height: 2 * r };
  }
}

/** The region around the worm, for "find the worm" (µm). */
export function wormBounds(x: Float64Array, y: Float64Array): { x: number; y: number; width: number; height: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < x.length; i++) {
    x0 = Math.min(x0, x[i]!);
    y0 = Math.min(y0, y[i]!);
    x1 = Math.max(x1, x[i]!);
    y1 = Math.max(y1, y[i]!);
  }
  const m = 250;
  return { x: x0 - m, y: y0 - m, width: x1 - x0 + 2 * m, height: y1 - y0 + 2 * m };
}
