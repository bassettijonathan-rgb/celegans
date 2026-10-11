/**
 * Draws the plate and the worm (DESIGN.md section 10). Reads snapshots only.
 * Scene units are µm.
 */
import { Container, Graphics } from 'pixi.js';
import { bodyRadius } from '../sim/body';
import { Medium } from '../sim/plate';
import { wormOutline } from './wormShape';

const AGAR = 0xd9c79a;
const WATER = 0x9fc3d6;
const WORM_BODY = 0xf1ece0;
const WORM_EDGE = 0x8f8676;
const GUT = 0xb9a888;

export class PlateView {
  readonly root = new Container();
  private readonly plate = new Graphics();
  private readonly worm = new Graphics();
  private radius = 0;

  constructor() {
    this.root.addChild(this.plate, this.worm);
  }

  setPlate(radius: number, medium: number): void {
    this.radius = radius;
    const fill = medium === Medium.water ? WATER : AGAR;
    this.plate.clear();
    // Dish rim, then the medium with a faint lighter centre like a lit plate.
    this.plate.circle(0, 0, radius * 1.03).fill({ color: 0x2a2f36 });
    this.plate.circle(0, 0, radius).fill({ color: fill });
    for (let k = 1; k <= 6; k++) {
      this.plate.circle(0, 0, radius * (1 - k * 0.14)).fill({ color: 0xffffff, alpha: 0.025 });
    }
  }

  setWorm(x: Float64Array, y: Float64Array): void {
    const g = this.worm;
    g.clear();
    const n = x.length;
    // Round the nose and tail tips, then the body outline over them.
    g.circle(x[0]!, y[0]!, bodyRadius(0)).circle(x[n - 1]!, y[n - 1]!, bodyRadius(1));
    g.fill({ color: WORM_BODY, alpha: 0.82 }).stroke({ color: WORM_EDGE, width: 2.5, alpha: 0.9 });
    g.poly(wormOutline(x, y)).fill({ color: WORM_BODY }).stroke({ color: WORM_EDGE, width: 2.5, alpha: 0.9 });
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
