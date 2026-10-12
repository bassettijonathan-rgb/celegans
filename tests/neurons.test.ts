import { describe, expect, it } from 'vitest';
import { cellIndex, connectome } from '../src/sim/connectome';
import { MEASURED_RECT, UNFITTED } from '../src/sim/fit';

const nameOf = (i: number) => connectome.cells[i]!.name;
import {
  DEFAULT_PARAMS,
  buildNetwork,
  createNeuronState,
  gapOpen,
  networkFromEdges,
  release,
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

describe('rectifying gap junctions (DESIGN.md 4.6)', () => {
  const settle = (rect: number, into: 0 | 1) => {
    const net = networkFromEdges(2, [], [{ a: 0, b: 1, synapses: 1, rect }]);
    const st: NeuronState = { v: Float64Array.of(P.eLeak, P.eLeak), inject: new Float64Array(2) };
    st.inject[into] = 0.5;
    run(net, st, 3000);
    return [st.v[0]! - P.eLeak, st.v[1]! - P.eLeak] as const;
  };

  it('pass current one way only when fully rectifying', () => {
    // Current a → b allowed: depolarising a reaches b nearly as through an
    // ohmic junction (the junction half shuts only where a and b are within
    // a few mV, RECT_SLOPE).
    const ohmic = settle(0, 0);
    const forward = settle(1, 0);
    expect(forward[1]).toBeGreaterThan(0.85 * ohmic[1]);
    // Depolarising b barely reaches a, and b keeps nearly the voltage of an uncoupled cell.
    const back = settle(1, 1);
    expect(back[0]).toBeLessThan(0.2 * ohmic[1]);
    expect(back[1]).toBeGreaterThan(0.9 * (0.5 / P.gLeak));
  });

  it('are the same junction seen from either side, so the solver stays symmetric', () => {
    for (const rho of [-1, -0.4, 0, 0.7, 1]) {
      for (const dv of [-10, -1, 0, 2, 15]) expect(gapOpen(rho, dv)).toBeCloseTo(gapOpen(-rho, -dv), 12);
    }
    expect(gapOpen(1, 20)).toBeGreaterThan(0.99);
    expect(gapOpen(1, -20)).toBeLessThan(0.01);
    expect(gapOpen(0.5, -20)).toBeCloseTo(0.5, 2);
  });

  it('come from the fit, oriented by class pair key, with AVA–A measured one-way into AVA', () => {
    const fit = { ...UNFITTED, rect: { ...MEASURED_RECT } };
    const net = buildNetwork(P, fit);
    const ava = cellIndex('AVAL');
    let seen = 0;
    for (let k = net.gapStart[ava]!; k < net.gapStart[ava + 1]!; k++) {
      const other = net.gapOther[k]!;
      if (/^(DA|VA)\d/.test(other === undefined ? '' : nameOf(other))) {
        // Entry (AVA, A cell): passes current from the A cell into AVA, so negative.
        expect(net.gapRect[k]).toBe(-1);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(net.rectifying).toBe(true);
    // Unfitted networks have no rectifying junctions.
    expect(buildNetwork(P).rectifying).toBe(false);
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

describe('slow inward channel (DESIGN.md section 4.5)', () => {
  // One cell at rest (E_L) with a channel that opens 15 mV above it: on, it
  // holds the cell near −12 mV; off, the leak holds it at rest. So it latches.
  const latching = () => {
    const net = networkFromEdges(1, [], []);
    net.slowG[0] = 0.02;
    net.slowHalf[0] = P.eLeak + 15;
    net.slowTau[0] = 10;
    const st = createNeuronState(net);
    return { net, st };
  };

  it('stays at rest without a push', () => {
    const { net, st } = latching();
    run(net, st, 1000);
    expect(st.v[0]!).toBeLessThan(P.eLeak + 3);
  });

  it('latches on after a brief depolarising pulse and off after a hyperpolarising one', () => {
    const { net, st } = latching();
    st.inject[0] = 0.25;
    run(net, st, 200);
    st.inject[0] = 0;
    run(net, st, 2000);
    expect(st.v[0]!).toBeGreaterThan(P.eLeak + 20);
    expect(st.slow![0]!).toBeGreaterThan(0.9);
    st.inject[0] = -2;
    run(net, st, 200);
    st.inject[0] = 0;
    run(net, st, 2000);
    expect(st.v[0]!).toBeLessThan(P.eLeak + 3);
  });

  it('never drives a cell past the excitatory reversal', () => {
    const { net, st } = latching();
    net.slowG[0] = 100;
    st.inject[0] = 1;
    run(net, st, 1000);
    expect(st.v[0]!).toBeLessThanOrEqual(P.eExc + 1e-6 + 1 / 100);
  });

  it('comes from the fit, per class, with its half activation relative to the cell threshold', () => {
    const fit = { name: 't', chem: {}, gap: {}, bias: {}, proprio: [], slow: [{ cls: 'VB', g: 3, half: 5, tau: 40 }] };
    const net = buildNetwork(P, fit);
    const vb = cellIndex('VB03');
    expect(net.slowG[vb]).toBe(3);
    expect(net.slowTau[vb]).toBe(40);
    expect(net.slowHalf[vb]).toBeCloseTo(net.vTh[vb]! + 5, 9);
    expect(net.slowG[cellIndex('DB03')]).toBe(0);
    expect(buildNetwork(P, fit, [vb]).slowG[vb]).toBe(0);
  });
});

describe('fitted signs of ambiguous synapses (DESIGN.md 3.2)', () => {
  it('sets the reversal of every ambiguous edge in a class pair from the fitted excitatory share', () => {
    const net = buildNetwork(P, { name: 't', chem: {}, gap: {}, bias: {}, proprio: [], mix: { 'AVD>AVA': 1 } });
    const ava = cellIndex('AVAL');
    const avd = cellIndex('AVDL');
    let found = 0;
    for (let k = net.synStart[ava]!; k < net.synStart[ava + 1]!; k++) {
      if (net.synPre[k] === avd) {
        expect(net.synE[k]).toBe(P.eExc);
        found++;
      }
    }
    expect(found).toBe(1);
    // Unfitted, the same edge sits half way between the reversals.
    const plain = buildNetwork(P);
    for (let k = plain.synStart[ava]!; k < plain.synStart[ava + 1]!; k++) {
      if (plain.synPre[k] === avd) expect(plain.synE[k]).toBe(P.eInh + P.ambiguousMix * (P.eExc - P.eInh));
    }
  });
});

describe('resting release (DESIGN.md 4.2, M4b)', () => {
  it('puts every cell at rest releasing restRelease, and the network stays there', () => {
    const net = buildNetwork({ ...P, restRelease: 0.1 });
    const st = createNeuronState(net);
    const s = new Float64Array(net.n);
    release(net, st.v, s);
    for (let i = 0; i < net.n; i++) expect(s[i]).toBeCloseTo(0.1, 9);
    for (let t = 0; t < 200; t++) stepNeurons(net, st, 1);
    for (let i = 0; i < net.n; i++) expect(Math.abs(st.v[i]! - net.vRest[i]!)).toBeLessThan(1e-6);
  });

  it('is Kunert 2014’s half-open rule by default, and a fit can lower it', () => {
    const half = buildNetwork(P);
    expect(half.vTh).toEqual(half.vRest);
    const quiet = buildNetwork(P, { name: 't', chem: {}, gap: {}, bias: {}, proprio: [], restRelease: 0.1 });
    expect(quiet.params.restRelease).toBe(0.1);
    const ava = cellIndex('AVAL');
    expect(quiet.vTh[ava]! - quiet.vRest[ava]!).toBeCloseTo(Math.log(9) / P.beta, 9);
  });
});
