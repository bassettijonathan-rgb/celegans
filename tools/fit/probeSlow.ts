/**
 * Hand probe for the slow channel (DESIGN.md section 4.5): scores B cells
 * with anterior stretch feedback and a slow inward channel, A cells off.
 * HEAD=g:half:tau:gain:offset:extent (or a point's own `/g:half:…` suffix) gives SMD and RMD a slow channel and
 * sets SMD's stretch feedback (the head oscillator).
 *
 *   npx tsx tools/fit/probeSlow.ts start.json g:half:tau[:gain[:offset:extent]] ...
 */
import { readFileSync } from 'node:fs';
import type { Fit } from '../../src/sim/fit';
import { score } from './evaluate';

const [startPath, ...points] = process.argv.slice(2);
const envHead = process.env.HEAD?.split(':').map(Number);
const start = JSON.parse(readFileSync(startPath!, 'utf8')) as Fit;
for (const arg of points) {
  const [b, h] = arg.split('/');
  const head = h ? h.split(':').map(Number) : envHead;
  const [g, half, tau, gain, offset, extent] = b!.split(':').map(Number) as [number, number, number, number?, number?, number?];
  const fit: Fit = {
    ...start,
    proprio: start.proprio.map((p) =>
      p.cls === 'DB' || p.cls === 'VB' ? { ...p, gain: gain ?? p.gain, offset: offset ?? p.offset, extent: extent ?? p.extent } : p,
    ),
    slow: ['DB', 'VB'].map((cls) => ({ cls, g, half, tau })),
  };
  if (head) {
    fit.slow!.push(...['SMD', 'RMD'].map((cls) => ({ cls, g: head[0]!, half: head[1]!, tau: head[2]! })));
    fit.proprio = fit.proprio.map((p) => (p.cls === 'SMD' ? { ...p, gain: head[3]!, offset: head[4]!, extent: head[5]! } : p));
  }
  const s = score(fit);
  const f = (x: typeof s.agar) =>
    `${x.frequency.toFixed(2)} Hz λ ${x.wavelength.toFixed(2)} κL ${x.amplitude.toFixed(1)} v ${x.speed.toFixed(3)} coh ${x.coherence.toFixed(2)}`;
  console.log(`${arg}: cost ${s.cost.toFixed(2)} | agar ${f(s.agar)} | water ${f(s.water)} | g ${(s.conductance ?? 0).toFixed(2)}`);
}
