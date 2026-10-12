/**
 * Gait fit (DESIGN.md section 7.3): separable CMA-ES (Ros & Hansen 2008) over
 * the motor circuit's class-pair strengths, tonic currents and
 * proprioception, scored on crawling and swimming gait (V1a, V1b).
 *
 *   npm run fit -- --seed 1 --generations 200 [--workers 4] [--out dir]
 *     [--from fit.json --sigma 0.3 --name gait-3b]   continue from a saved fit
 *     [--proprio DB,VB,SMD]   which classes get fitted stretch feedback (default all in space.ts)
 *     [--task touch]   also fit the touch responses (V2a, V2b, V4a) over the touch circuit
 *     [--task bio]     gait only, with B cells sensing ahead, A behind, and slow channels (DESIGN.md 4.5)
 *     [--task steer]   as bio, and also fit backing up while AVA is lit (optogenetics)
 *
 * Deterministic for a given seed and worker count does not matter: each
 * candidate is scored independently.
 */
import { Worker } from 'node:worker_threads';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { Purpose, Rng } from '../src/sim/rng';
import { buildSpace, fromFit, toFit, type Task } from './fit/space';
import type { Fit } from '../src/sim/fit';
import type { Score, SteerScore, TouchScore } from './fit/evaluate';

const args = process.argv.slice(2);
const opt = (name: string, dflt: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : dflt;
};
const seed = opt('seed', 1);
const generations = opt('generations', 200);
const workers = opt('workers', 4);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1]! : 'fits';
mkdirSync(out, { recursive: true });

const proprioIdx = args.indexOf('--proprio');
const taskIdx = args.indexOf('--task');
const task: Task = taskIdx >= 0 && ['touch', 'steer', 'bio'].includes(args[taskIdx + 1]!) ? (args[taskIdx + 1] as Task) : 'gait';
const space = buildSpace(proprioIdx >= 0 ? args[proprioIdx + 1]!.split(',') : undefined, task);
const n = space.dims.length;
const rng = new Rng(seed, Purpose.sim);

// sep-CMA-ES constants (Hansen 2016 tutorial; Ros & Hansen 2008).
const lambda = 4 * Math.ceil((4 + Math.floor(3 * Math.log(n))) / 4);
const mu = lambda / 2;
const rawW = Array.from({ length: mu }, (_, i) => Math.log(mu + 0.5) - Math.log(i + 1));
const wSum = rawW.reduce((a, b) => a + b, 0);
const weights = rawW.map((w) => w / wSum);
const muEff = 1 / weights.reduce((a, w) => a + w * w, 0);
const cSigma = (muEff + 2) / (n + muEff + 5);
const dSigma = 1 + 2 * Math.max(0, Math.sqrt((muEff - 1) / (n + 1)) - 1) + cSigma;
const cc = (4 + muEff / n) / (n + 4 + (2 * muEff) / n);
const c1 = ((n + 2) / 3) * (2 / ((n + 1.3) ** 2 + muEff));
const cMu = Math.min(1 - c1, ((n + 2) / 3) * ((2 * (muEff - 2 + 1 / muEff)) / ((n + 2) ** 2 + muEff)));
const chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));

const fromIdx = args.indexOf('--from');
let mean = fromIdx >= 0 ? fromFit(space, JSON.parse(readFileSync(args[fromIdx + 1]!, 'utf8')) as Fit) : new Float64Array(n);
let sigma = opt('sigma', 1);
const diag = new Float64Array(n).fill(1);
const ps = new Float64Array(n);
const pc = new Float64Array(n);

const pool = Array.from({ length: workers }, () => new Worker(new URL('./fit/worker.mjs', import.meta.url)));
function evaluate(xs: Float64Array[]): Promise<(Score & { error?: string })[]> {
  return new Promise((resolve) => {
    const results: (Score & { error?: string })[] = new Array(xs.length);
    let next = 0;
    let done = 0;
    const feed = (w: Worker) => {
      if (next >= xs.length) return;
      const id = next++;
      w.postMessage({ id, x: [...xs[id]!], seed: 1, proprio: space.proprio, task });
    };
    for (const w of pool) {
      w.removeAllListeners('message');
      w.on('message', (m: Score & { id: number; error?: string }) => {
        results[m.id] = m;
        done++;
        if (done === xs.length) resolve(results);
        else feed(w);
      });
      feed(w);
    }
  });
}

const nameIdx = args.indexOf('--name');
const runName = nameIdx >= 0 ? args[nameIdx + 1]! : `gait-${seed}`;
const log = `${out}/${runName}.log`;
writeFileSync(log, `${task} fit seed ${seed}, ${n} dims, lambda ${lambda}, stretch feedback in ${space.proprio.join(' ')}\n`);
let best = { cost: Infinity, x: new Float64Array(n), score: undefined as Score | undefined };
const fmt = (g: Score['agar']) =>
  `${g.frequency.toFixed(2)} Hz λ ${g.wavelength.toFixed(2)} κL ${g.amplitude.toFixed(1)} v ${g.speed.toFixed(3)} coh ${g.coherence.toFixed(2)}`;

const fmtTouch = (t: TouchScore) =>
  `front min ${t.anterior.minSpeed.toFixed(3)} AVA ${(t.anterior.avaAfter - t.anterior.avaBefore).toFixed(1)} AVB ${(t.anterior.avbAfter - t.anterior.avbBefore).toFixed(1)} end ${t.anterior.recovered.toFixed(3)}; back ${t.posterior.before.toFixed(3)}→${t.posterior.after.toFixed(3)}`;

const fmtSteer = (t: SteerScore) =>
  `AVA lit: min ${t.ava.minSpeed.toFixed(3)} ΔAVA ${(t.ava.avaAfter - t.ava.avaBefore).toFixed(1)} ΔAVB ${(t.ava.avbAfter - t.ava.avbBefore).toFixed(1)} after ${t.ava.recovered.toFixed(3)}`;

for (let gen = 0; gen < generations; gen++) {
  const zs: Float64Array[] = [];
  const xs: Float64Array[] = [];
  for (let k = 0; k < lambda; k++) {
    const z = Float64Array.from({ length: n }, () => rng.normal());
    zs.push(z);
    xs.push(Float64Array.from(z, (zi, i) => mean[i]! + sigma * Math.sqrt(diag[i]!) * zi));
  }
  const scores = await evaluate(xs);
  const order = scores.map((s, k) => [s.cost, k] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const [topCost, top] = order[0]!;
  if (topCost < best.cost) {
    best = { cost: topCost, x: Float64Array.from(xs[top]!), score: scores[top] };
    const fit = toFit(space, best.x, runName);
    fit.meta = {
      fittedTo:
        task === 'touch'
          ? 'V1a, V1b gait + V2a, V2b touch responses + V4a command interneurons + backing up while AVA is lit (DESIGN.md 7.2); V1c and ablations (V2d) held out'
          : task === 'steer'
            ? 'V1a, V1b gait + backing up while AVA is lit (DESIGN.md 7.2); V1c and ablations held out'
            : 'V1a crawling + V1b swimming gait (DESIGN.md 7.2); V1c held out',
      cost: topCost,
      seed,
      ...(fromIdx >= 0 ? { continuedFrom: args[fromIdx + 1]!.split('/').pop() ?? '' } : {}),
      generation: gen,
      agar: fmt(best.score!.agar),
      water: fmt(best.score!.water),
      ...(task === 'touch' ? { touch: fmtTouch(best.score as TouchScore) } : {}),
      ...(task === 'steer' || task === 'touch' ? { steer: fmtSteer(best.score as SteerScore) } : {}),
    };
    writeFileSync(`${out}/${runName}.json`, JSON.stringify(fit, null, 1) + '\n');
  }
  const s = scores[top]!;
  appendFileSync(log, `gen ${gen} best ${topCost.toFixed(3)} (ever ${best.cost.toFixed(3)}) σ ${sigma.toFixed(3)} | agar ${fmt(s.agar)} | water ${fmt(s.water)} | g ${(s.conductance ?? 0).toFixed(2)}${task === 'touch' && !s.error ? ' | ' + fmtTouch(s as TouchScore) : ''}${(task === 'steer' || task === 'touch') && !s.error ? ' | ' + fmtSteer(s as SteerScore) : ''}${s.error ? ' ERR ' + s.error : ''}\n`);

  // Update (sep-CMA-ES).
  const old = mean;
  mean = new Float64Array(n);
  const zMean = new Float64Array(n);
  for (let r = 0; r < mu; r++) {
    const k = order[r]![1];
    for (let i = 0; i < n; i++) {
      mean[i] = mean[i]! + weights[r]! * xs[k]![i]!;
      zMean[i] = zMean[i]! + weights[r]! * zs[k]![i]!;
    }
  }
  let psNorm = 0;
  for (let i = 0; i < n; i++) {
    ps[i] = (1 - cSigma) * ps[i]! + Math.sqrt(cSigma * (2 - cSigma) * muEff) * zMean[i]!;
    psNorm += ps[i]! ** 2;
  }
  psNorm = Math.sqrt(psNorm);
  const hSig = psNorm / Math.sqrt(1 - (1 - cSigma) ** (2 * (gen + 1))) / chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
  for (let i = 0; i < n; i++) {
    pc[i] = (1 - cc) * pc[i]! + (hSig * Math.sqrt(cc * (2 - cc) * muEff) * (mean[i]! - old[i]!)) / sigma;
    let rankMu = 0;
    for (let r = 0; r < mu; r++) {
      const k = order[r]![1];
      rankMu += weights[r]! * diag[i]! * zs[k]![i]! ** 2;
    }
    diag[i] = (1 - c1 - cMu) * diag[i]! + c1 * (pc[i]! ** 2 + (1 - hSig) * cc * (2 - cc) * diag[i]!) + cMu * rankMu;
  }
  sigma *= Math.exp((cSigma / dSigma) * (psNorm / chiN - 1));
}
for (const w of pool) await w.terminate();
appendFileSync(log, `done: best ${best.cost.toFixed(3)}\n`);
