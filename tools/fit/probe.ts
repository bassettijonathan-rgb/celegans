/** Hand probe for a starting point: score a few gains of the B-cell stretch feedback. */
import { buildSpace, toFit } from './space';
import { score } from './evaluate';

const space = buildSpace();
const gi = (c: string, k: string) => space.dims.findIndex((d) => d.name === `${k}:${c}`);
for (const gain of process.argv.slice(2).map(Number)) {
  const x = new Float64Array(space.dims.length);
  for (const c of ['DB', 'VB']) x[gi(c, 'gain')] = (gain - space.dims[gi(c, 'gain')]!.centre) / space.dims[gi(c, 'gain')]!.scale;
  const s = score(toFit(space, x, 'probe'));
  const f = (g: typeof s.agar) => `${g.frequency.toFixed(2)} Hz λ ${g.wavelength.toFixed(2)} κL ${g.amplitude.toFixed(1)} v ${g.speed.toFixed(3)} coh ${g.coherence.toFixed(2)}`;
  console.log(`gain ${gain}: cost ${s.cost.toFixed(2)} | agar ${f(s.agar)} | water ${f(s.water)}`);
}
