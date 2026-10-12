/**
 * Transmission calibration (DESIGN.md 7.4): fits the strength of every
 * chemical and gap class pair so that the network's response to lighting
 * one neuron matches the fitting half of Randi et al. 2023's signal
 * propagation atlas (unc-31 worms: no neuropeptides, so wired transmission
 * only). The held-out half (V4b) is never read here.
 *
 * Method: around the resting state the network is linear, dV/dt = J δV + δI,
 * so the steady response to lighting cell j is δV = −J⁻¹ e_j u_j, with
 * u_j = STIM_NS (E_exc − V_j). The loss compares those responses with the
 * measured ones and its gradient with respect to J is −M^T H M^T
 * (M = J⁻¹), which chains to each class pair's log strength. Adam steps
 * the log strengths; the resting state is re-solved every step. The full
 * nonlinear network is scored with the real experiment afterwards
 * (`npm run atlas`).
 *
 *   npx tsx tools/fit/atlasFit.ts [--steps 400] [--from fit.json] [--out fits/atlas-1.json]
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { connectome } from '../../src/sim/connectome';
import { UNFITTED, chemKey, gapKey, type Fit } from '../../src/sim/fit';
import { DEFAULT_PARAMS, buildNetwork, type Network } from '../../src/sim/neurons';
import { STIM_NS, atlasPairs, type AtlasPair } from './atlas';
import { maxInputConductance } from './evaluate';

/** mV of model response per unit ΔF/F (guess, labelled: a significant response, ΔF/F ≈ 0.25, read as ≈ 5 mV). */
export const MV_PER_DFF = 20;
/** Weight of the log-strength prior pulling each pair to the unfitted default. */
const PRIOR = Number(process.argv.includes('--prior') ? process.argv[process.argv.indexOf('--prior') + 1] : 0.02);
/** Responses with q above this count as measured silences. */
const QUIET_Q = 0.5;
const SIG_Q = 0.05;

const args = process.argv.slice(2);
const opt = (name: string, d: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1]! : d;
};
const steps = Number(opt('steps', '400'));
const outPath = opt('out', 'fits/atlas-1.json');
const start: Fit = args.includes('--from') ? JSON.parse(readFileSync(opt('from', ''), 'utf8')) : UNFITTED;

/** Validation pairs: a fifth of the fitting half, by hash, to choose when to stop. */
const isVal = (p: AtlasPair) => createHash('sha256').update(`val:${p.stim}>${p.resp}`).digest()[0]! % 5 === 0;
const fitHalf = atlasPairs('unc31', 'fit').filter((p) => p.q !== null && p.dFF !== null && (p.q < SIG_Q || p.q > QUIET_Q));
const train = fitHalf.filter((p) => !isVal(p));
const val = fitHalf.filter(isVal);

const n = connectome.cells.length;
const keys = new Set<string>();
for (const e of connectome.chemical) keys.add(`chem:${chemKey(e.pre, e.post)}`);
for (const e of connectome.gap) keys.add(`gap:${gapKey(e.a, e.b)}`);
const names = [...keys].sort();
const index = new Map(names.map((k, i) => [k, i]));
const w = Float64Array.from(names, (k) => (k.startsWith('chem:') ? start.chem[k.slice(5)] : start.gap[k.slice(4)]) ?? 0);

function toFit(x: Float64Array, name: string): Fit {
  const fit: Fit = { ...structuredClone(start), name, chem: {}, gap: {} };
  names.forEach((k, i) => {
    if (x[i] === 0) return;
    if (k.startsWith('chem:')) fit.chem[k.slice(5)] = x[i]!;
    else fit.gap[k.slice(4)] = x[i]!;
  });
  return fit;
}

/** Dense Jacobian of the network at rest (row i: d(C dV_i/dt)/dV_j). */
function jacobian(net: Network, s: Float64Array, ds: Float64Array): Float64Array {
  const J = new Float64Array(n * n);
  const v = net.vRest;
  for (let i = 0; i < n; i++) {
    let d = -net.params.gLeak - Math.abs(net.bias[i]!);
    for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) {
      const j = net.synPre[k]!;
      d -= net.synG[k]! * s[j]!;
      J[i * n + j] = J[i * n + j]! - net.synG[k]! * ds[j]! * (v[i]! - net.synE[k]!);
    }
    for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) {
      d -= net.gapG[k]!;
      J[i * n + net.gapOther[k]!] = J[i * n + net.gapOther[k]!]! + net.gapG[k]!;
    }
    J[i * n + i] = J[i * n + i]! + d;
  }
  return J;
}

/** Inverse of a dense n×n matrix (Gauss–Jordan with partial pivoting). */
function invert(A: Float64Array): Float64Array {
  const a = Float64Array.from(A);
  const inv = new Float64Array(n * n);
  for (let i = 0; i < n; i++) inv[i * n + i] = 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r * n + c]!) > Math.abs(a[p * n + c]!)) p = r;
    if (p !== c) {
      for (let k = 0; k < n; k++) {
        [a[c * n + k], a[p * n + k]] = [a[p * n + k]!, a[c * n + k]!];
        [inv[c * n + k], inv[p * n + k]] = [inv[p * n + k]!, inv[c * n + k]!];
      }
    }
    const piv = a[c * n + c]!;
    for (let k = 0; k < n; k++) {
      a[c * n + k] = a[c * n + k]! / piv;
      inv[c * n + k] = inv[c * n + k]! / piv;
    }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r * n + c]!;
      if (f === 0) continue;
      for (let k = 0; k < n; k++) {
        a[r * n + k] = a[r * n + k]! - f * a[c * n + k]!;
        inv[r * n + k] = inv[r * n + k]! - f * inv[c * n + k]!;
      }
    }
  }
  return inv;
}

interface Eval {
  loss: number;
  grad: Float64Array;
  /** Of the significant responses: share with |δV| > 1 mV and the right sign; of silences: share under 1 mV. */
  hit: number;
  quiet: number;
}

function evaluate(x: Float64Array, pairs: AtlasPair[], withGrad: boolean): Eval {
  const net = buildNetwork(DEFAULT_PARAMS, toFit(x, 'tmp'));
  const s = new Float64Array(n);
  const ds = new Float64Array(n);
  const beta = net.params.beta;
  for (let j = 0; j < n; j++) {
    s[j] = 1 / (1 + Math.exp(-beta * (net.vRest[j]! - net.vTh[j]!)));
    ds[j] = beta * s[j]! * (1 - s[j]!);
  }
  const M = invert(jacobian(net, s, ds));
  const u = Float64Array.from(net.vRest, (v) => STIM_NS * (net.params.eExc - v));
  const H = withGrad ? new Float64Array(n * n) : undefined;
  let loss = 0;
  let sig = 0;
  let hits = 0;
  let non = 0;
  let quiet = 0;
  const nSig = pairs.filter((p) => p.q! < SIG_Q).length;
  const nNon = pairs.length - nSig;
  for (const p of pairs) {
    const dv = -M[p.resp * n + p.stim]! * u[p.stim]!;
    const isSig = p.q! < SIG_Q;
    const target = isSig ? MV_PER_DFF * p.dFF! : 0;
    const weight = isSig ? 1 / nSig : 1 / nNon;
    loss += weight * (dv - target) ** 2;
    if (H) H[p.resp * n + p.stim] = H[p.resp * n + p.stim]! + weight * 2 * (dv - target) * -u[p.stim]!;
    if (isSig) {
      sig++;
      if (Math.abs(dv) > 1 && Math.sign(dv) === Math.sign(p.dFF!)) hits++;
    } else {
      non++;
      if (Math.abs(dv) <= 1) quiet++;
    }
  }
  const grad = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    loss += PRIOR * x[i]! ** 2;
    grad[i] = 2 * PRIOR * x[i]!;
  }
  // Input-conductance cap (as in the gait fit): penalise any cell over the unfitted maximum.
  const cap = maxInputConductance();
  if (H) {
    // dL/dJ = −M^T H M^T, computed as G = −(M^T H) M^T.
    const MtH = new Float64Array(n * n);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) {
        const h = H[a * n + b]!;
        if (h === 0) continue;
        for (let c = 0; c < n; c++) MtH[c * n + b] = MtH[c * n + b]! + M[a * n + c]! * h;
      }
    }
    const G = new Float64Array(n * n);
    for (let c = 0; c < n; c++) {
      for (let b = 0; b < n; b++) {
        const v = MtH[c * n + b]!;
        if (v === 0) continue;
        for (let d = 0; d < n; d++) G[c * n + d] = G[c * n + d]! - v * M[d * n + b]!;
      }
    }
    const ln10 = Math.LN10;
    for (let i = 0; i < n; i++) {
      let gIn = net.params.gLeak;
      for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) gIn += net.params.restRelease * net.synG[k]!;
      for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) gIn += net.gapG[k]!;
      const over = Math.log10(gIn / cap);
      const capGrad = over > 0 ? (20 * 2 * over) / (gIn * ln10) : 0;
      if (over > 0) loss += 20 * over * over;
      for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) {
        const j = net.synPre[k]!;
        const dLdg = G[i * n + i]! * -s[j]! + G[i * n + j]! * -ds[j]! * (net.vRest[i]! - net.synE[k]!) + capGrad * net.params.restRelease;
        grad[index.get(`chem:${chemKey(j, i)}`)!]! += dLdg * net.synG[k]! * ln10;
      }
      for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) {
        const j = net.gapOther[k]!;
        // Each junction appears once per side; each side's entry carries its own row's terms.
        const dLdg = -G[i * n + i]! + G[i * n + j]! + capGrad;
        grad[index.get(`gap:${gapKey(i, j)}`)!]! += dLdg * net.gapG[k]! * ln10;
      }
    }
  }
  return { loss, grad, hit: sig ? hits / sig : 0, quiet: non ? quiet / non : 0 };
}

// Adam (Kingma & Ba 2015).
const m = new Float64Array(w.length);
const v2 = new Float64Array(w.length);
const lr = Number(opt('lr', '0.05'));
let best = { val: Infinity, x: Float64Array.from(w), step: -1 };
for (let t = 1; t <= steps; t++) {
  const e = evaluate(w, train, true);
  for (let i = 0; i < w.length; i++) {
    m[i] = 0.9 * m[i]! + 0.1 * e.grad[i]!;
    v2[i] = 0.999 * v2[i]! + 0.001 * e.grad[i]! ** 2;
    const mh = m[i]! / (1 - 0.9 ** t);
    const vh = v2[i]! / (1 - 0.999 ** t);
    w[i] = Math.min(3, Math.max(-3, w[i]! - (lr * mh) / (Math.sqrt(vh) + 1e-8)));
  }
  if (t % 10 === 0 || t === 1) {
    const ev = evaluate(w, val, false);
    if (ev.loss < best.val) best = { val: ev.loss, x: Float64Array.from(w), step: t };
    console.log(
      `step ${t}: train loss ${e.loss.toFixed(3)} hit ${e.hit.toFixed(2)} quiet ${e.quiet.toFixed(2)} | val loss ${ev.loss.toFixed(3)} hit ${ev.hit.toFixed(2)} quiet ${ev.quiet.toFixed(2)}`,
    );
  }
}
const fit = toFit(best.x, outPath.split('/').pop()!.replace(/\.json$/, ''));
fit.meta = {
  fittedTo: 'Randi et al. 2023 signal propagation atlas, unc-31, fitting half (linear response; DESIGN.md 7.4); V4b held out',
  step: best.step,
  valLoss: best.val,
  ...(args.includes('--from') ? { continuedFrom: opt('from', '').split('/').pop() ?? '' } : {}),
};
writeFileSync(outPath, JSON.stringify(fit, null, 1) + '\n');
console.log(`wrote ${outPath} (step ${best.step})`);
