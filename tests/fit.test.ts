import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/sim/connectome';
import { UNFITTED, biasConductances, chemKey, chemScale, gapKey, type Fit } from '../src/sim/fit';
import { GAIT_POINTS, GaitRecorder, measureGait } from '../src/sim/gait';
import { buildNetwork, DEFAULT_PARAMS } from '../src/sim/neurons';
import { buildBrain, createWorld, network, setMedium, setPuppet, step } from '../src/sim/world';

describe('a fit', () => {
  it('names connections by class pair, with all muscles as one class', () => {
    expect(chemKey(cellIndex('VB03'), cellIndex('MVL07'))).toBe('VB>BWM');
    expect(chemKey(cellIndex('AVAL'), cellIndex('VA05'))).toBe('AVA>VA');
    expect(gapKey(cellIndex('VA05'), cellIndex('AVAR'))).toBe(gapKey(cellIndex('AVAL'), cellIndex('VA05')));
    expect(gapKey(cellIndex('VA05'), cellIndex('AVAR'))).toBe('AVA~VA');
  });

  it('scales every synapse of a class pair together, and only those', () => {
    const fit: Fit = { ...UNFITTED, chem: { 'AVA>VA': 1 } };
    expect(chemScale(fit, cellIndex('AVAL'), cellIndex('VA05'))).toBeCloseTo(10, 12);
    expect(chemScale(fit, cellIndex('AVAR'), cellIndex('VA05'))).toBeCloseTo(10, 12);
    expect(chemScale(fit, cellIndex('AVBL'), cellIndex('VB05'))).toBe(1);
    const plain = network();
    const scaled = buildNetwork(DEFAULT_PARAMS, fit);
    const va = cellIndex('VA05');
    const sum = (net: typeof plain) => {
      let s = 0;
      for (let k = net.synStart[va]!; k < net.synStart[va + 1]!; k++) s += net.synG[k]!;
      return s;
    };
    expect(sum(scaled)).toBeGreaterThan(sum(plain));
  });

  it('gives a tonic conductance to every cell of a biased class', () => {
    const b = biasConductances({ ...UNFITTED, bias: { AVB: 12 } });
    expect(b[cellIndex('AVBL')]).toBe(12);
    expect(b[cellIndex('AVBR')]).toBe(12);
    expect(b[cellIndex('AVAL')]).toBe(0);
  });

  it('keeps every cell between the reversal potentials, however strong the tonic and sensory inputs', () => {
    const fit: Fit = {
      ...UNFITTED,
      bias: { AVB: 500, AVA: -500, DB: 300 },
      proprio: [
        { cls: 'DB', gain: 3000, offset: 0, extent: 0.2 },
        { cls: 'VB', gain: -3000, offset: 0, extent: 0.2 },
      ],
    };
    const b = buildBrain(fit);
    const w = createWorld(4, b);
    setPuppet(w, true); // bend the body hard so the stretch inputs are large
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 1500; k++) {
      step(w, b);
      for (const v of w.neurons.v) [lo, hi] = [Math.min(lo, v), Math.max(hi, v)];
    }
    expect(lo).toBeGreaterThanOrEqual(DEFAULT_PARAMS.eInh - 1e-6);
    expect(hi).toBeLessThanOrEqual(DEFAULT_PARAMS.eExc + 1e-6);
  });

  it('runs a world deterministically with a fitted brain', () => {
    const fit: Fit = {
      ...UNFITTED,
      bias: { AVB: 20 },
      proprio: [{ cls: 'VB', gain: 50, offset: 0.05, extent: 0.2 }],
    };
    const b = buildBrain(fit);
    const run = () => {
      const w = createWorld(3, b);
      for (let k = 0; k < 300; k++) step(w, b);
      return w.body.x.slice();
    };
    expect(run()).toEqual(run());
  });
});

describe('gait measurement', () => {
  it('recovers a known travelling wave', () => {
    const f = 0.8;
    const lambda = 0.7;
    const every = 10;
    const kappa = GAIT_POINTS.map((u) =>
      Array.from({ length: 600 }, (_, k) => 6 * Math.sin((2 * Math.PI * u) / lambda - (2 * Math.PI * f * k * every) / 1000)),
    );
    const g = measureGait(kappa, every, 0.1);
    expect(g.frequency).toBeCloseTo(f, 2);
    expect(g.wavelength).toBeCloseTo(lambda, 2);
    expect(g.amplitude).toBeCloseTo(6, 1);
    expect(g.coherence).toBeGreaterThan(0.95);
  });

  it('gives a negative wavelength for a wave running tail to head', () => {
    const kappa = GAIT_POINTS.map((u) =>
      Array.from({ length: 600 }, (_, k) => 5 * Math.sin((2 * Math.PI * u) / 0.7 + (2 * Math.PI * 0.8 * k * 10) / 1000)),
    );
    expect(measureGait(kappa, 10, 0).wavelength).toBeLessThan(0);
  });

  it('reports no undulation for a still body', () => {
    const kappa = GAIT_POINTS.map(() => Array.from({ length: 300 }, () => 2));
    expect(measureGait(kappa, 10, 0).frequency).toBe(0);
  });

  it('measures the puppet worm at the gait it is driven with', () => {
    for (const mix of [1, 0]) {
      const w = createWorld(1);
      setMedium(w, mix);
      setPuppet(w, true);
      const rec = new GaitRecorder(10);
      for (let k = 0; k < 6000; k++) {
        step(w);
        if (k >= 2000 && k % 10 === 0) rec.sample(w.body.x, w.body.y);
      }
      const g = rec.result();
      expect(g.frequency).toBeCloseTo(w.puppet.frequency, 1);
      expect(Math.abs(g.wavelength / w.puppet.wavelength - 1)).toBeLessThan(0.05);
      expect(g.speed).toBeGreaterThan(0);
    }
  }, 30000);
});

describe('biological stretch fields (bio, steer and touch fits)', () => {
  it('keeps every B cell field ahead of the soma and every A cell field behind it', async () => {
    const { buildSpace, toFit } = await import('../tools/fit/space');
    const space = buildSpace(undefined, 'bio');
    for (const x of [-5, 0, 5]) {
      const fit = toFit(space, new Float64Array(space.dims.length).fill(x), 't');
      for (const r of fit.proprio) {
        if (r.cls === 'DB' || r.cls === 'VB') expect(r.offset + r.extent).toBeLessThanOrEqual(1e-12);
        if (r.cls === 'DA' || r.cls === 'VA') expect(r.offset).toBeGreaterThanOrEqual(0);
      }
      expect(fit.slow?.map((r) => r.cls)).toEqual(['DB', 'VB', 'DA', 'VA', 'SMD', 'RMD']);
    }
  });
});

describe('continuing a fit in a larger circuit', () => {
  it('keeps every strength the smaller fit set on its own, and its pooled small-edge strength', async () => {
    const { buildSpace, toFit, fromFit } = await import('../tools/fit/space');
    const bio = buildSpace(undefined, 'bio');
    const x = Float64Array.from(bio.dims, (_, i) => Math.sin(i));
    const small = toFit(bio, x, 'bio');
    const touch = buildSpace(undefined, 'touch');
    const big = toFit(touch, fromFit(touch, small), 'touch');
    for (const k of bio.chemKeys.filter((k) => touch.chemKeys.includes(k))) expect(big.chem[k]).toBeCloseTo(small.chem[k]!, 9);
    const pooledBefore = small.chem[bio.smallChem[0]!]!;
    const stillSmall = bio.smallChem.filter((k) => touch.smallChem.includes(k));
    for (const k of stillSmall) expect(big.chem[k]).toBeCloseTo(pooledBefore, 9);
  });
});

describe('rectifying junctions in touch fits (DESIGN.md 4.6)', () => {
  it('fixes the measured AVA–A junctions, fits the touch path ones, and round-trips them', async () => {
    const { buildSpace, toFit, fromFit } = await import('../tools/fit/space');
    const { MEASURED_RECT } = await import('../src/sim/fit');
    const touch = buildSpace(undefined, 'touch');
    expect(touch.rectKeys).toContain('AVA~AVD');
    for (const k of Object.keys(MEASURED_RECT)) expect(touch.rectKeys).not.toContain(k);
    const x = Float64Array.from(touch.dims, (_, i) => Math.cos(i));
    const fit = toFit(touch, x, 't');
    for (const [k, r] of Object.entries(MEASURED_RECT)) expect(fit.rect?.[k]).toBe(r);
    for (const k of touch.rectKeys) expect(Math.abs(fit.rect![k]!)).toBeLessThanOrEqual(1);
    const again = toFit(touch, fromFit(touch, fit), 't');
    for (const k of touch.rectKeys) expect(again.rect![k]).toBeCloseTo(fit.rect![k]!, 9);
    // The gait-only tasks leave every junction ohmic.
    expect(toFit(buildSpace(undefined, 'bio'), new Float64Array(buildSpace(undefined, 'bio').dims.length), 'b').rect).toBeUndefined();
  });
});
