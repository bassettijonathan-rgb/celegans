/**
 * Hand probe for a fit's starting point: scores B-cell stretch feedback
 * settings around the default start (DESIGN.md section 7.3).
 *
 *   npx tsx tools/fit/probe.ts gain:offset:extent ...   e.g. -3:-0.15:0.15
 */
import { buildSpace, toFit } from './space';
import { score } from './evaluate';

const space = buildSpace(['DB', 'VB', 'SMD']);
const at = (name: string) => space.dims.findIndex((d) => d.name === name);
for (const arg of process.argv.slice(2)) {
  const [gain, offset, extent] = arg.split(':').map(Number) as [number, number, number];
  const x = new Float64Array(space.dims.length);
  for (const c of ['DB', 'VB']) {
    for (const [k, v] of [
      ['gain', gain],
      ['offset', offset],
      ['extent', extent],
    ] as const) {
      const d = space.dims[at(`${k}:${c}`)]!;
      x[at(`${k}:${c}`)] = (v - d.centre) / d.scale;
    }
  }
  const s = score(toFit(space, x, 'probe'));
  const f = (g: typeof s.agar) =>
    `${g.frequency.toFixed(2)} Hz λ ${g.wavelength.toFixed(2)} κL ${g.amplitude.toFixed(1)} v ${g.speed.toFixed(3)} coh ${g.coherence.toFixed(2)}`;
  console.log(`${arg}: cost ${s.cost.toFixed(2)} | agar ${f(s.agar)} | water ${f(s.water)}`);
}
