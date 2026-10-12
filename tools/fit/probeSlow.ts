/**
 * Hand probe for the slow channel (DESIGN.md section 4.5): scores B cells
 * with anterior stretch feedback and a slow inward channel, A cells off.
 *
 *   npx tsx tools/fit/probeSlow.ts start.json g:half:tau[:gain] ...
 */
import { readFileSync } from 'node:fs';
import type { Fit } from '../../src/sim/fit';
import { score } from './evaluate';

const [startPath, ...points] = process.argv.slice(2);
const start = JSON.parse(readFileSync(startPath!, 'utf8')) as Fit;
for (const arg of points) {
  const [g, half, tau, gain] = arg.split(':').map(Number) as [number, number, number, number?];
  const fit: Fit = {
    ...start,
    proprio: start.proprio.map((p) => (gain !== undefined && (p.cls === 'DB' || p.cls === 'VB') ? { ...p, gain } : p)),
    slow: ['DB', 'VB'].map((cls) => ({ cls, g, half, tau })),
  };
  const s = score(fit);
  const f = (x: typeof s.agar) =>
    `${x.frequency.toFixed(2)} Hz λ ${x.wavelength.toFixed(2)} κL ${x.amplitude.toFixed(1)} v ${x.speed.toFixed(3)} coh ${x.coherence.toFixed(2)}`;
  console.log(`${arg}: cost ${s.cost.toFixed(2)} | agar ${f(s.agar)} | water ${f(s.water)} | g ${(s.conductance ?? 0).toFixed(2)}`);
}
