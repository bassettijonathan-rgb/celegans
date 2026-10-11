/**
 * The brain view (DESIGN.md section 10): the worm in side view with every
 * neuron at its soma position, coloured by how far its voltage is from rest,
 * like a calcium-imaging video. Scene units are µm: x runs nose to tail,
 * y runs dorsal (up) to ventral (down). Reads snapshots only.
 */
import { Container, Graphics } from 'pixi.js';
import { bodyRadius } from '../sim/body';
import { NEURON_COUNT, connectome } from '../sim/connectome';

const OUTLINE = 0x8f8676;
const BODY = 0x23272e;
const EXC = 0x5fbf72;
const INH = 0xe0675a;
const AMB = 0x8a93a0;
const GAP = 0x6aa6e0;
const SOMA_R = 3.2;

/** Colour for a voltage change from rest: blue below, grey at rest, amber to white above. */
export function voltageColor(dv: number): number {
  const t = Math.max(-1, Math.min(1, dv / 10));
  const grey = [96, 104, 116];
  const cold = [70, 140, 235];
  const amber = [244, 166, 60];
  const pale = [255, 240, 190];
  const [from, to, k] = t < 0 ? [grey, cold, -t] : t <= 0.5 ? [grey, amber, 2 * t] : [amber, pale, 2 * t - 1];
  const mix = (i: number) => Math.round(from[i]! + (to[i]! - from[i]!) * k);
  return (mix(0) << 16) | (mix(1) << 8) | mix(2);
}

export class BrainView {
  readonly root = new Container();
  private readonly body = new Graphics();
  private readonly links = new Graphics();
  private readonly somata = new Graphics();
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly head: number;
  private readonly tail: number;
  selected = -1;

  constructor() {
    this.root.addChild(this.body, this.links, this.somata);
    const n = NEURON_COUNT;
    this.px = new Float64Array(n);
    this.py = new Float64Array(n);
    let head = Infinity;
    let tail = -Infinity;
    for (let i = 0; i < n; i++) {
      const soma = connectome.cells[i]!.soma!;
      this.px[i] = soma[1];
      this.py[i] = -soma[2];
      head = Math.min(head, soma[1]);
      tail = Math.max(tail, soma[1]);
    }
    this.head = head - 25;
    this.tail = tail + 30;
    this.drawBody();
  }

  /**
   * The body outline in side view. The VirtualWorm's body is gently bent, so
   * the outline follows the somata: its midline is the middle of the cells
   * found near each point along the body, and it is wide enough to hold them.
   */
  private drawBody(): void {
    const g = this.body;
    const len = this.tail - this.head;
    const steps = 80;
    const mid = new Float64Array(steps + 1);
    const half = new Float64Array(steps + 1);
    for (let k = 0; k <= steps; k++) {
      const x = this.head + (k / steps) * len;
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < NEURON_COUNT; i++) {
        if (Math.abs(this.px[i]! - x) > 45) continue;
        lo = Math.min(lo, this.py[i]!);
        hi = Math.max(hi, this.py[i]!);
      }
      mid[k] = lo < hi ? (lo + hi) / 2 : NaN;
      half[k] = lo < hi ? (hi - lo) / 2 : 0;
    }
    // Fill gaps with the nearest known midline, then smooth.
    for (let k = 0; k <= steps; k++) if (Number.isNaN(mid[k]!)) mid[k] = k > 0 ? mid[k - 1]! : 0;
    for (let k = steps; k >= 0; k--) if (Number.isNaN(mid[k]!)) mid[k] = mid[k + 1]!;
    const smooth = (a: Float64Array) =>
      Float64Array.from(a, (_, k) => {
        let sum = 0;
        let n = 0;
        for (let j = Math.max(0, k - 4); j <= Math.min(steps, k + 4); j++) {
          sum += a[j]!;
          n++;
        }
        return sum / n;
      });
    const m = smooth(mid);
    const h = smooth(half);
    const top: number[] = [];
    const bottom: number[] = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      const r = Math.max(bodyRadius(u), h[k]! + 8 * Math.sqrt(1 - (2 * u - 1) ** 2));
      top.push(this.head + u * len, m[k]! - r);
      bottom.push(this.head + u * len, m[k]! + r);
    }
    for (let k = bottom.length - 2; k >= 0; k -= 2) top.push(bottom[k]!, bottom[k + 1]!);
    g.poly(top).fill({ color: BODY }).stroke({ color: OUTLINE, width: 1.5, alpha: 0.6 });
    this.extent = { top: Math.min(...top.filter((_, i) => i % 2 === 1)), bottom: Math.max(...top.filter((_, i) => i % 2 === 1)) };
  }

  private extent = { top: -80, bottom: 80 };

  get bounds(): { x: number; y: number; width: number; height: number } {
    const { top, bottom } = this.extent;
    return { x: this.head - 20, y: top - 20, width: this.tail - this.head + 40, height: bottom - top + 40 };
  }

  /** The neuron nearest to (x, y) in scene units, within a few µm, or −1. */
  pick(x: number, y: number): number {
    let best = -1;
    let bestD = 7 * 7;
    for (let i = 0; i < NEURON_COUNT; i++) {
      const d = (this.px[i]! - x) ** 2 + (this.py[i]! - y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  update(v: Float32Array, rest: Float64Array, inject: Float32Array): void {
    const g = this.somata;
    g.clear();
    for (let i = 0; i < NEURON_COUNT; i++) {
      g.circle(this.px[i]!, this.py[i]!, SOMA_R).fill({ color: voltageColor(v[i]! - rest[i]!) });
    }
    for (let i = 0; i < NEURON_COUNT; i++) {
      if (inject[i] !== 0) g.circle(this.px[i]!, this.py[i]!, SOMA_R + 2.2).stroke({ color: 0xffffff, width: 1.2 });
    }
    if (this.selected >= 0) {
      g.circle(this.px[this.selected]!, this.py[this.selected]!, SOMA_R + 4).stroke({ color: 0xf2d16b, width: 1.5 });
    }
  }

  /** Draws the selected neuron's synapses (green excitatory, red inhibitory, grey unknown) and gap junctions (blue). */
  drawLinks(): void {
    const g = this.links;
    g.clear();
    const s = this.selected;
    if (s < 0) return;
    const line = (a: number, b: number, color: number, width: number) => {
      g.moveTo(this.px[a]!, this.py[a]!).lineTo(this.px[b]!, this.py[b]!).stroke({ color, width, alpha: 0.55 });
    };
    for (const e of connectome.chemical) {
      if (e.post >= NEURON_COUNT || (e.pre !== s && e.post !== s)) continue;
      const color = e.sign > 0 ? EXC : e.sign < 0 ? INH : AMB;
      line(e.pre, e.post, color, Math.min(3, 0.4 + e.size / 15));
    }
    for (const e of connectome.gap) {
      if (e.b >= NEURON_COUNT || (e.a !== s && e.b !== s)) continue;
      line(e.a, e.b, GAP, Math.min(3, 0.4 + e.size / 15));
    }
  }
}
