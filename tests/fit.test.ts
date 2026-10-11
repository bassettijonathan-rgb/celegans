import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/sim/connectome';
import { UNFITTED, biasCurrents, chemKey, chemScale, gapKey, type Fit } from '../src/sim/fit';
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

  it('gives a tonic current to every cell of a biased class', () => {
    const b = biasCurrents({ ...UNFITTED, bias: { AVB: 12 } });
    expect(b[cellIndex('AVBL')]).toBe(12);
    expect(b[cellIndex('AVBR')]).toBe(12);
    expect(b[cellIndex('AVAL')]).toBe(0);
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
