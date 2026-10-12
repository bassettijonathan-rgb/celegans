import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/sim/connectome';
import { buildNetwork, DEFAULT_PARAMS } from '../src/sim/neurons';
import { TOUCH_CONDUCTANCE, TOUCH_MS, senseTouch, touchFields } from '../src/sim/touch';
import { hashState } from '../src/sim/hash';
import { buildBrain, createWorld, network, setAblated, step, touchBody } from '../src/sim/world';
import { UNFITTED } from '../src/sim/fit';

describe('gentle touch', () => {
  it('has a field for each of the six touch receptors', () => {
    expect(touchFields.map((f) => f.cell).sort((a, b) => a - b)).toEqual(
      ['ALML', 'ALMR', 'AVM', 'PVM', 'PLML', 'PLMR'].map(cellIndex).sort((a, b) => a - b),
    );
  });

  it('opens the anterior receptors for a touch near the head and the posterior ones near the tail', () => {
    const touched = (at: number) => {
      const sense = new Float64Array(400);
      senseTouch({ at, until: 10 }, 0, sense);
      return ['ALML', 'ALMR', 'AVM', 'PLML', 'PLMR'].filter((n) => sense[cellIndex(n)] === TOUCH_CONDUCTANCE);
    };
    expect(touched(0.1)).toEqual(['ALML', 'ALMR', 'AVM']);
    expect(touched(0.9)).toEqual(['PLML', 'PLMR']);
  });

  it('closes the channels after TOUCH_MS', () => {
    const sense = new Float64Array(400);
    senseTouch({ at: 0.1, until: TOUCH_MS }, TOUCH_MS, sense);
    expect(sense.every((g) => g === 0)).toBe(true);
  });

  it('depolarises the touched receptors in a running world, and only for a while', () => {
    const b = buildBrain(UNFITTED);
    const w = createWorld(1, b);
    for (let k = 0; k < 200; k++) step(w, b);
    const alm = cellIndex('ALML');
    const rest = w.neurons.v[alm]!;
    touchBody(w, 0.1);
    for (let k = 0; k < 50; k++) step(w, b);
    expect(w.neurons.v[alm]! - rest).toBeGreaterThan(5);
    for (let k = 0; k < 1000; k++) step(w, b);
    expect(w.touch).toBeNull();
    expect(Math.abs(w.neurons.v[alm]! - rest)).toBeLessThan(1);
  });
});

describe('laser ablation', () => {
  it('removes every synapse and gap junction of a killed cell, and keeps everyone else\'s threshold', () => {
    const ava = [cellIndex('AVAL'), cellIndex('AVAR')];
    const net = buildNetwork(DEFAULT_PARAMS, UNFITTED, ava);
    for (let i = 0; i < net.n; i++) {
      for (let k = net.synStart[i]!; k < net.synStart[i + 1]!; k++) {
        expect(ava.includes(i) || ava.includes(net.synPre[k]!)).toBe(false);
      }
      for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) {
        expect(ava.includes(i) || ava.includes(net.gapOther[k]!)).toBe(false);
      }
    }
    expect(net.vTh).toEqual(network().vTh);
  });

  it('refuses to step a world with a brain built for other ablations', () => {
    const b = buildBrain(UNFITTED);
    const w = createWorld(1, b);
    setAblated(w, [cellIndex('AVM')]);
    expect(() => step(w, b)).toThrow();
    const killed = buildBrain(UNFITTED, w.ablated);
    expect(() => step(w, killed)).not.toThrow();
  });

  it('a killed receptor feels no touch', () => {
    const b = buildBrain(UNFITTED, [cellIndex('ALML')]);
    const w = createWorld(1, b);
    touchBody(w, 0.1);
    step(w, b);
    expect(w.neurons.sense![cellIndex('ALML')]).toBe(0);
    expect(w.neurons.sense![cellIndex('ALMR')]).toBe(TOUCH_CONDUCTANCE);
  });

  it('runs deterministically with touches and ablations', () => {
    const run = () => {
      const b = buildBrain(UNFITTED, [cellIndex('AVDL')]);
      const w = createWorld(5, b);
      setAblated(w, [cellIndex('AVDL')]);
      for (let k = 0; k < 300; k++) {
        if (k === 100) touchBody(w, 0.2);
        step(w, b);
      }
      return hashState(w);
    };
    expect(run()).toBe(run());
  });
});
