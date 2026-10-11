/**
 * Body mechanics (DESIGN.md section 6): an overdamped 2D elastic rod moving
 * through agar or water by resistive force theory.
 *
 * Units: µm, ms, nN. A drag coefficient in nN·ms/µm² equals the same number
 * in Pa·s (kg m⁻¹ s⁻¹); a bending stiffness of 1 N·m² is 10²¹ nN·µm².
 *
 * At the worm's Reynolds number inertia is negligible, so there is no mass:
 * at every instant the drag on each node balances the elastic and muscle
 * forces on it,  D(x) ẋ = F(x).  The rod is stiff (a segment-sized bend
 * relaxes in microseconds in water), so each step is linearly implicit Euler:
 *
 *   (D/dt − J) Δx = F(x),   J = ∂F/∂x
 *
 * J = −K, where K is the stiffness matrix (the Hessian of the stored energy),
 * computed analytically. It is banded (a node feels only nodes up to two
 * away), and the banded system is solved with partial pivoting.
 */
import { NODES, SEGMENT_LENGTH } from './body';

/** Drag per unit length per unit speed, along (ct) and across (cn) the body, nN·ms/µm². */
export interface Drag {
  ct: number;
  cn: number;
}

/**
 * Water: Fang-Yen et al. 2010 ≈ (C_L ≈ 3.3, C_N ≈ 5.2 mPa·s for the adult;
 * slender-body theory gives K = C_N/C_L ≈ 1.5).
 */
export const WATER: Drag = { ct: 3.3e-3, cn: 5.2e-3 };

/**
 * Agar: the worm lies in a groove in the wet surface film and can hardly
 * slip sideways. Niebur & Erdős 1991 ≈, as used by Boyle, Berri & Cohen 2012
 * ≈ (C_L ≈ 3.2, C_N ≈ 128 kg m⁻¹ s⁻¹, K ≈ 40).
 */
export const AGAR: Drag = { ct: 3.2, cn: 128 };

/**
 * Drag between water (mix 0) and agar (mix 1), interpolated in log space, as
 * when the worm moves through gels of rising concentration (Berri et al.
 * 2009; Fang-Yen et al. 2010).
 */
export function dragFor(mix: number): Drag {
  if (!(mix > 0)) return { ...WATER };
  if (mix >= 1) return { ...AGAR };
  const m = mix;
  const lerpLog = (a: number, b: number) => Math.exp(Math.log(a) + m * (Math.log(b) - Math.log(a)));
  return { ct: lerpLog(WATER.ct, AGAR.ct), cn: lerpLog(WATER.cn, AGAR.cn) };
}

export interface RodParams {
  /** Bending stiffness, nN·µm² (≈ 1e-13 N·m²; published estimates range ~1e-14 to 3e-13, Fang-Yen 2010; Backholm et al. 2013). */
  kBend: number;
  /** Stretching stiffness of one segment, nN/µm. Not a measured value: stiff enough that segments stay within 0.1% of their length. */
  kStretch: number;
}

export const DEFAULT_ROD: RodParams = { kBend: 1e8, kStretch: 2e6 };

/**
 * The dish wall: a node whose centre is further than `wall` from the plate's
 * centre is pushed back by a stiff spring (same stiffness as a segment), so the
 * worm slides along the edge. Infinity means no wall.
 */
export interface StepOptions {
  wall?: number;
  /** Newton iterations per step (2 is enough; 1 is the plain linearized step, which is inaccurate in water). */
  iters?: number;
}

/**
 * Internal (elastic + active) forces plus the wall, and the stored energy,
 * for a body with preferred turning angles.
 */
export function rodForces(
  x: Float64Array,
  y: Float64Array,
  theta0: Float64Array,
  p: RodParams,
  fx: Float64Array,
  fy: Float64Array,
  wall = Infinity,
): number {
  const n = x.length;
  fx.fill(0);
  fy.fill(0);
  let energy = 0;
  // Stretching: each segment is a spring of rest length SEGMENT_LENGTH.
  for (let i = 0; i < n - 1; i++) {
    const ex = x[i + 1]! - x[i]!;
    const ey = y[i + 1]! - y[i]!;
    const len = Math.hypot(ex, ey);
    const stretch = len - SEGMENT_LENGTH;
    energy += 0.5 * p.kStretch * stretch * stretch;
    const f = (p.kStretch * stretch) / len;
    fx[i] = fx[i]! + f * ex;
    fy[i] = fy[i]! + f * ey;
    fx[i + 1] = fx[i + 1]! - f * ex;
    fy[i + 1] = fy[i + 1]! - f * ey;
  }
  // Bending: at interior node j the turning angle θ_j between segments j−1 and j
  // costs ½ (kBend / L) (θ_j − θ0_j)², a discrete ½ kBend κ² per unit length.
  const kb = p.kBend / SEGMENT_LENGTH;
  for (let j = 1; j < n - 1; j++) {
    const ax = x[j]! - x[j - 1]!;
    const ay = y[j]! - y[j - 1]!;
    const bx = x[j + 1]! - x[j]!;
    const by = y[j + 1]! - y[j]!;
    const theta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
    const d = theta - theta0[j]!;
    energy += 0.5 * kb * d * d;
    // θ = φ(b) − φ(a); ∂φ(e)/∂e = (−e_y, e_x) / |e|².
    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const gax = -ay / a2;
    const gay = ax / a2;
    const gbx = -by / b2;
    const gby = bx / b2;
    // ∂θ/∂x_{j−1} = +∂φ(a)/∂a ; ∂θ/∂x_j = −∂φ(a)/∂a − ∂φ(b)/∂b ; ∂θ/∂x_{j+1} = ∂φ(b)/∂b.
    const m = -kb * d;
    fx[j - 1] = fx[j - 1]! + m * gax;
    fy[j - 1] = fy[j - 1]! + m * gay;
    fx[j] = fx[j]! - m * (gax + gbx);
    fy[j] = fy[j]! - m * (gay + gby);
    fx[j + 1] = fx[j + 1]! + m * gbx;
    fy[j + 1] = fy[j + 1]! + m * gby;
  }
  if (wall < Infinity) {
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(x[i]!, y[i]!);
      if (r <= wall) continue;
      const over = r - wall;
      energy += 0.5 * p.kStretch * over * over;
      fx[i] = fx[i]! - (p.kStretch * over * x[i]!) / r;
      fy[i] = fy[i]! - (p.kStretch * over * y[i]!) / r;
    }
  }
  return energy;
}

/** Turning angle at each interior node (0 at the ends), radians. */
export function turningAngles(x: Float64Array, y: Float64Array, out: Float64Array): void {
  const n = x.length;
  out[0] = 0;
  out[n - 1] = 0;
  for (let j = 1; j < n - 1; j++) {
    const ax = x[j]! - x[j - 1]!;
    const ay = y[j]! - y[j - 1]!;
    const bx = x[j + 1]! - x[j]!;
    const by = y[j + 1]! - y[j]!;
    out[j] = Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
}

const DIM = 2 * NODES;
/** A node's force depends on nodes up to two away, so J has half-bandwidth 2·2 + 1 = 5 in coordinates. */
const HALF_BAND = 5;

/** Reusable buffers for `stepRod`, so a step allocates nothing. */
export class RodWorkspace {
  readonly fx = new Float64Array(NODES);
  readonly fy = new Float64Array(NODES);
  readonly a = new Float64Array(DIM * DIM);
  readonly rhs = new Float64Array(DIM);
  readonly x0 = new Float64Array(NODES);
  readonly y0 = new Float64Array(NODES);
  readonly dxx = new Float64Array(NODES);
  readonly dxy = new Float64Array(NODES);
  readonly dyy = new Float64Array(NODES);
}

/**
 * Advances the body by dt ms with backward Euler, D (x₁ − x₀)/dt = F(x₁),
 * solved by Newton steps (the drag directions are taken at x₀). One
 * linearized step is not enough in water: there the body relaxes within
 * ≈ 0.2 ms, so the elastic forces in one 1 ms step are far from linear and the
 * swimming speed came out 40% too high. Two Newton steps give the dt → 0
 * speed to four digits at dt = 1 ms (tests/mechanics.test.ts).
 * Returns the elastic energy at the start of the step. If the first Newton
 * step would move any node more than a fifth of a segment, the step is split
 * in two (recursively). The split depends only on the state, so it is
 * deterministic.
 */
export function stepRod(
  x: Float64Array,
  y: Float64Array,
  theta0: Float64Array,
  drag: Drag,
  p: RodParams,
  dt: number,
  ws: RodWorkspace,
  options: StepOptions = {},
  depth = 0,
): number {
  const n = NODES;
  const wall = options.wall ?? Infinity;
  const iters = options.iters ?? 2;
  const { fx, fy, a, rhs, x0, y0, dxx, dxy, dyy } = ws;
  const energy = rodForces(x, y, theta0, p, fx, fy, wall);
  x0.set(x);
  y0.set(y);
  // Drag tensor per node, D = cn I + (ct − cn) t tᵀ, from the tangent at the start of the step.
  for (let j = 0; j < n; j++) {
    const i0 = Math.max(0, j - 1);
    const i1 = Math.min(n - 1, j + 1);
    let tx = x[i1]! - x[i0]!;
    let ty = y[i1]! - y[i0]!;
    const tl = Math.hypot(tx, ty) || 1;
    tx /= tl;
    ty /= tl;
    // The end nodes own half a segment, the others a whole one.
    const len = j === 0 || j === n - 1 ? SEGMENT_LENGTH / 2 : SEGMENT_LENGTH;
    const ct = (drag.ct * len) / dt;
    const cn = (drag.cn * len) / dt;
    dxx[j] = cn + (ct - cn) * tx * tx;
    dxy[j] = (ct - cn) * tx * ty;
    dyy[j] = cn + (ct - cn) * ty * ty;
  }
  for (let it = 0; it < iters; it++) {
    if (it > 0) rodForces(x, y, theta0, p, fx, fy, wall);
    // Residual r = F(x) − D (x − x0)/dt; on the first iteration x = x0.
    for (let j = 0; j < n; j++) {
      const ux = x[j]! - x0[j]!;
      const uy = y[j]! - y0[j]!;
      rhs[2 * j] = fx[j]! - (dxx[j]! * ux + dxy[j]! * uy);
      rhs[2 * j + 1] = fy[j]! - (dxy[j]! * ux + dyy[j]! * uy);
    }
    // System matrix A = D/dt − J = D/dt + K, stored dense (98 × 98) but only touched inside the band.
    a.fill(0);
    for (let j = 0; j < n; j++) {
      const r = 2 * j;
      a[r * DIM + r] = dxx[j]!;
      a[r * DIM + r + 1] = dxy[j]!;
      a[(r + 1) * DIM + r] = dxy[j]!;
      a[(r + 1) * DIM + r + 1] = dyy[j]!;
    }
    addStiffness(x, y, theta0, p, a, wall);
    solveBanded(a, rhs, DIM, HALF_BAND);
    if (it === 0 && depth < 8) {
      let biggest = 0;
      for (let j = 0; j < n; j++) biggest = Math.max(biggest, Math.hypot(rhs[2 * j]!, rhs[2 * j + 1]!));
      if (biggest > SEGMENT_LENGTH / 5) {
        stepRod(x, y, theta0, drag, p, dt / 2, ws, options, depth + 1);
        stepRod(x, y, theta0, drag, p, dt / 2, ws, options, depth + 1);
        return energy;
      }
    }
    for (let j = 0; j < n; j++) {
      x[j] = x[j]! + rhs[2 * j]!;
      y[j] = y[j]! + rhs[2 * j + 1]!;
    }
  }
  return energy;
}

const gradScratch = new Float64Array(6);

/** Adds the 2×2 block m (xx, xy, yx, yy) times s to A at node rows i, node columns j. */
function addBlock(a: Float64Array, i: number, j: number, s: number, mxx: number, mxy: number, myx: number, myy: number): void {
  const r = 2 * i * DIM + 2 * j;
  a[r] = a[r]! + s * mxx;
  a[r + 1] = a[r + 1]! + s * mxy;
  a[r + DIM] = a[r + DIM]! + s * myx;
  a[r + DIM + 1] = a[r + DIM + 1]! + s * myy;
}

/**
 * Adds the stiffness matrix K (Hessian of the energy in `rodForces`) to A.
 * A spring of rest length L0 along e has Hessian k[(1 − L0/|e|) I + (L0/|e|) êêᵀ]
 * in e. A turning angle θ = φ(b) − φ(a) has gradient as in `rodForces` and
 * ∂²φ/∂e² = [[2xy, y² − x²], [y² − x², −2xy]] / |e|⁴, so the bending energy
 * ½ kb (θ − θ0)² has Hessian kb (∇θ ∇θᵀ + (θ − θ0) ∇²θ).
 */
export function addStiffness(
  x: Float64Array,
  y: Float64Array,
  theta0: Float64Array,
  p: RodParams,
  a: Float64Array,
  wall = Infinity,
): void {
  const n = x.length;
  for (let i = 0; i < n - 1; i++) {
    const ex = x[i + 1]! - x[i]!;
    const ey = y[i + 1]! - y[i]!;
    const len = Math.hypot(ex, ey);
    const q = SEGMENT_LENGTH / len;
    const ux = ex / len;
    const uy = ey / len;
    const kxx = p.kStretch * (1 - q + q * ux * ux);
    const kxy = p.kStretch * q * ux * uy;
    const kyy = p.kStretch * (1 - q + q * uy * uy);
    addBlock(a, i, i, 1, kxx, kxy, kxy, kyy);
    addBlock(a, i + 1, i + 1, 1, kxx, kxy, kxy, kyy);
    addBlock(a, i, i + 1, -1, kxx, kxy, kxy, kyy);
    addBlock(a, i + 1, i, -1, kxx, kxy, kxy, kyy);
  }
  const kb = p.kBend / SEGMENT_LENGTH;
  const g = gradScratch;
  for (let j = 1; j < n - 1; j++) {
    const ax = x[j]! - x[j - 1]!;
    const ay = y[j]! - y[j - 1]!;
    const bx = x[j + 1]! - x[j]!;
    const by = y[j + 1]! - y[j]!;
    const d = Math.atan2(ax * by - ay * bx, ax * bx + ay * by) - theta0[j]!;
    const a2 = ax * ax + ay * ay;
    const b2 = bx * bx + by * by;
    const gax = -ay / a2;
    const gay = ax / a2;
    const gbx = -by / b2;
    const gby = bx / b2;
    g[0] = gax;
    g[1] = gay;
    g[2] = -gax - gbx;
    g[3] = -gay - gby;
    g[4] = gbx;
    g[5] = gby;
    // kb ∇θ ∇θᵀ over the three nodes.
    for (let r = 0; r < 6; r++) {
      const row = 2 * (j - 1) + r;
      for (let c = 0; c < 6; c++) {
        const k = row * DIM + 2 * (j - 1) + c;
        a[k] = a[k]! + kb * g[r]! * g[c]!;
      }
    }
    // kb d ∇²θ: −∇²φ(a) on nodes (j−1, j) and +∇²φ(b) on nodes (j, j+1).
    const a4 = a2 * a2;
    const hxx = (2 * ax * ay) / a4;
    const hxy = (ay * ay - ax * ax) / a4;
    const hyy = -hxx;
    const s1 = -kb * d;
    addBlock(a, j - 1, j - 1, s1, hxx, hxy, hxy, hyy);
    addBlock(a, j, j, s1, hxx, hxy, hxy, hyy);
    addBlock(a, j - 1, j, -s1, hxx, hxy, hxy, hyy);
    addBlock(a, j, j - 1, -s1, hxx, hxy, hxy, hyy);
    const b4 = b2 * b2;
    const ixx = (2 * bx * by) / b4;
    const ixy = (by * by - bx * bx) / b4;
    const iyy = -ixx;
    const s2 = kb * d;
    addBlock(a, j, j, s2, ixx, ixy, ixy, iyy);
    addBlock(a, j + 1, j + 1, s2, ixx, ixy, ixy, iyy);
    addBlock(a, j, j + 1, -s2, ixx, ixy, ixy, iyy);
    addBlock(a, j + 1, j, -s2, ixx, ixy, ixy, iyy);
  }
  if (wall < Infinity) {
    for (let i = 0; i < n; i++) {
      const r = Math.hypot(x[i]!, y[i]!);
      if (r <= wall) continue;
      const q = wall / r;
      const ux = x[i]! / r;
      const uy = y[i]! / r;
      addBlock(a, i, i, p.kStretch, 1 - q + q * ux * ux, q * ux * uy, q * ux * uy, 1 - q + q * uy * uy);
    }
  }
}

/**
 * Solves A z = b in place (b becomes z) for a banded A with half-bandwidth kl,
 * by Gaussian elimination with partial pivoting. Row swaps widen the upper
 * band to 2·kl, so elimination works on that window.
 */
function solveBanded(a: Float64Array, b: Float64Array, n: number, kl: number): void {
  for (let k = 0; k < n; k++) {
    const last = Math.min(n - 1, k + kl);
    let piv = k;
    for (let i = k + 1; i <= last; i++) if (Math.abs(a[i * n + k]!) > Math.abs(a[piv * n + k]!)) piv = i;
    const right = Math.min(n - 1, k + 2 * kl);
    if (piv !== k) {
      for (let c = k; c <= right; c++) {
        const t = a[k * n + c]!;
        a[k * n + c] = a[piv * n + c]!;
        a[piv * n + c] = t;
      }
      const t = b[k]!;
      b[k] = b[piv]!;
      b[piv] = t;
    }
    const d = a[k * n + k]!;
    for (let i = k + 1; i <= last; i++) {
      const f = a[i * n + k]! / d;
      if (f === 0) continue;
      for (let c = k; c <= right; c++) a[i * n + c] = a[i * n + c]! - f * a[k * n + c]!;
      b[i] = b[i]! - f * b[k]!;
    }
  }
  for (let k = n - 1; k >= 0; k--) {
    let s = b[k]!;
    const right = Math.min(n - 1, k + 2 * kl);
    for (let c = k + 1; c <= right; c++) s -= a[k * n + c]! * b[c]!;
    b[k] = s / a[k * n + k]!;
  }
}
