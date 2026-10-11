import { describe, expect, it } from 'vitest';
import { cellIndex } from '../src/sim/connectome';
import {
  DEFAULT_PARAMS,
  buildNetwork,
  createNeuronState,
  networkFromEdges,
  stepNeurons,
  type NeuronState,
} from '../src/sim/neurons';
import { Rng } from '../src/sim/rng';
import { hashState } from '../src/sim/hash';

const P = DEFAULT_PARAMS;
const run = (net: ReturnType<typeof networkFromEdges>, st: NeuronState, ms: number, dt = 1) => {
  for (let t = 0; t < ms / dt; t++) stepNeurons(net, st, dt);
};

describe('one passive neuron', () => {
  it('charges with the membrane time constant C/g_L towards E_L + I/g_L', () => {
    const net = networkFromEdges(1, [], []);
    const st: NeuronState = { v: Float64Array.of(P.eLeak), inject: Float64Array.of(0.1) };
    const tau = P.C / P.gLeak; // 100 ms
    const vInf = P.eLeak + 0.1 / P.gLeak; // +10 mV above rest
    run(net, st, tau, 0.05);
    const exact = vInf - (vInf - P.eLeak) * Math.exp(-1);
    expect(st.v[0]!).toBeCloseTo(exact, 1);
    run(net, st, 10 * tau, 1);
    expect(st.v[0]!).toBeCloseTo(vInf, 3);
  });
});

describe('gap junctions', () => {
  it('divide an injected current between two coupled cells as Ohm says', () => {
    const net = networkFromEdges(2, [], [{ a: 0, b: 1, synapses: 1 }]);
    const st: NeuronState = { v: Float64Array.of(P.eLeak, P.eLeak), inject: Float64Array.of(0.1, 0) };
    run(net, st, 3000);
    // Steady state: the pair's leaks in series with the junction.
    const gL = P.gLeak;
    const gG = P.gGapPerSynapse;
    const v1 = 0.1 / (gL + (gL * gG) / (gL + gG));
    const v2 = (v1 * gG) / (gL + gG);
    expect(st.v[0]! - P.eLeak).toBeCloseTo(v1, 3);
    expect(st.v[1]! - P.eLeak).toBeCloseTo(v2, 3);
  });

  it('stay stable at a 1 ms step even when coupling is far faster than 1 ms', () => {
    // 50 junctions: the pair equalizes in ~0.1 ms, much less than the step.
    const net = networkFromEdges(2, [], [{ a: 0, b: 1, synapses: 50 }]);
    const st: NeuronState = { v: Float64Array.of(0, -70), inject: new Float64Array(2) };
    // Backward Euler: the difference shrinks every step and never overshoots.
    stepNeurons(net, st, 1);
    expect(st.v[0]! - st.v[1]!).toBeGreaterThan(0);
    expect(st.v[0]! - st.v[1]!).toBeLessThan(70 / 5);
    stepNeurons(net, st, 1);
    stepNeurons(net, st, 1);
    expect(st.v[0]! - st.v[1]!).toBeGreaterThan(0);
    expect(st.v[0]! - st.v[1]!).toBeLessThan(0.1);
  });
});

describe('graded chemical synapses', () => {
  const pair = (sign: number) => networkFromEdges(2, [{ pre: 0, post: 1, synapses: 5, sign }], []);

  it('depolarize the target when excitatory and hyperpolarize it when inhibitory', () => {
    for (const sign of [1, -1]) {
      const net = pair(sign);
      const st = createNeuronState(net);
      const rest = st.v[1]!;
      st.inject[0] = 0.2;
      run(net, st, 1000);
      expect(Math.sign(st.v[1]! - rest)).toBe(sign);
    }
  });

  it('release more the more the presynaptic cell is depolarized', () => {
    const net = pair(1);
    const effect = (i: number) => {
      const st = createNeuronState(net);
      const rest = st.v[1]!;
      st.inject[0] = i;
      run(net, st, 1000);
      return st.v[1]! - rest;
    };
    const small = effect(0.05);
    const large = effect(0.2);
    expect(large).toBeGreaterThan(small);
    expect(small).toBeGreaterThan(0);
  });
});

describe('the whole network', () => {
  const net = buildNetwork();

  it('rests at its own release thresholds and stays there without input', () => {
    const st = createNeuronState(net);
    for (let i = 0; i < net.n; i++) expect(Math.abs(st.v[i]! - net.vTh[i]!)).toBeLessThan(1e-6);
    const before = Float64Array.from(st.v);
    run(net, st, 1000);
    for (let i = 0; i < net.n; i++) expect(Math.abs(st.v[i]! - before[i]!)).toBeLessThan(1e-6);
    // Resting voltages lie between the inhibitory and excitatory reversals.
    for (const v of st.v) {
      expect(v).toBeGreaterThanOrEqual(P.eInh);
      expect(v).toBeLessThanOrEqual(P.eExc);
    }
  });

  it('passes a stimulus along the wiring, fading with distance', () => {
    const st = createNeuronState(net);
    const rest = Float64Array.from(st.v);
    const src = cellIndex('PLML');
    st.inject[src] = 20;
    run(net, st, 500);
    const dv = (i: number) => Math.abs(st.v[i]! - rest[i]!);
    expect(dv(src)).toBeGreaterThan(5);
    expect(dv(cellIndex('PVCL'))).toBeGreaterThan(0.05); // gap junction partner
    // Hop distance from PLML over synapses and gap junctions (either direction).
    const hops = new Array<number>(net.n).fill(Infinity);
    hops[src] = 0;
    const next = (i: number) => {
      const out: number[] = [];
      for (let k = net.gapStart[i]!; k < net.gapStart[i + 1]!; k++) out.push(net.gapOther[k]!);
      for (let j = 0; j < net.n; j++)
        for (let k = net.synStart[j]!; k < net.synStart[j + 1]!; k++) if (net.synPre[k] === i) out.push(j);
      return out;
    };
    for (let queue = [src]; queue.length; ) {
      const i = queue.shift()!;
      for (const j of next(i)) {
        if (hops[j] !== Infinity) continue;
        hops[j] = hops[i]! + 1;
        queue.push(j);
      }
    }
    const mean = (pred: (h: number) => boolean) => {
      const sel = [...hops.keys()].filter((i) => pred(hops[i]!));
      return sel.reduce((s, i) => s + dv(i), 0) / sel.length;
    };
    expect(mean((h) => h === 1)).toBeGreaterThan(5 * mean((h) => h >= 3));
  });

  it('converges as the step shrinks (1 ms is within 0.5 mV of 0.125 ms)', () => {
    const trace = (dt: number) => {
      const st = createNeuronState(net);
      st.inject[cellIndex('ALML')] = 20;
      st.inject[cellIndex('ALMR')] = 20;
      run(net, st, 200, dt);
      return st.v;
    };
    const coarse = trace(1);
    const fine = trace(0.125);
    let worst = 0;
    for (let i = 0; i < net.n; i++) worst = Math.max(worst, Math.abs(coarse[i]! - fine[i]!));
    expect(worst).toBeLessThan(0.5);
  });

  it('is deterministic with noise on, and the noise does reach the voltages', () => {
    const noisy = buildNetwork({ ...P, noise: 0.05 });
    const go = (seed: number) => {
      const st = createNeuronState(noisy);
      const rng = new Rng(seed);
      for (let t = 0; t < 200; t++) stepNeurons(noisy, st, 1, rng);
      return st;
    };
    expect(hashState(go(1))).toBe(hashState(go(1)));
    expect(hashState(go(1))).not.toBe(hashState(go(2)));
  });
});
