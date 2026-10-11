import { describe, expect, it } from 'vitest';
import { NODES, SEGMENT_LENGTH, BODY_LENGTH } from '../src/sim/body';
import { NEURON_COUNT, cellIndex, connectome } from '../src/sim/connectome';
import { turningAngles } from '../src/sim/mechanics';
import {
  MUSCLE_TAU,
  bodyFraction,
  buildProprioception,
  cellSide,
  senseProprioception,
  stepMuscleCalcium,
} from '../src/sim/motor';
import { MUSCLE_COUNT } from '../src/sim/muscles';
import { createWorld, network, setInjection, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

const ofClass = (cls: string) =>
  connectome.cells
    .slice(0, NEURON_COUNT)
    .map((c, i) => [c, i] as const)
    .filter(([c]) => c.class === cls)
    .map(([, i]) => i);

/** Mean change of κ·L along the body after stimulating a class for 1.5 s, against an unstimulated twin. */
function bendFrom(cls: string): number {
  const w = createWorld(1);
  const twin = createWorld(1);
  for (const i of ofClass(cls)) setInjection(w, i, 50);
  for (let k = 0; k < 1500; k++) {
    step(w);
    step(twin);
  }
  const a = new Float64Array(NODES);
  const b = new Float64Array(NODES);
  turningAngles(w.body.x, w.body.y, a);
  turningAngles(twin.body.x, twin.body.y, b);
  let sum = 0;
  for (let j = 1; j < NODES - 1; j++) sum += ((a[j]! - b[j]!) / SEGMENT_LENGTH) * BODY_LENGTH;
  return sum / (NODES - 2);
}

describe('the network with muscles', () => {
  it('holds the 302 neurons and the 95 muscle cells, with the neuromuscular junctions', () => {
    const net = network();
    expect(net.n).toBe(NEURON_COUNT + MUSCLE_COUNT);
    const mdl10 = cellIndex('MDL10');
    expect(net.synStart[mdl10 + 1]! - net.synStart[mdl10]!).toBeGreaterThan(0);
  });

  it('rests with every muscle at half activation, so the body is not bent by the brain', () => {
    const w = createWorld(3);
    for (let k = 0; k < 200; k++) step(w);
    for (const a of w.muscles) expect(a).toBeCloseTo(0.5, 9);
  });
});

describe('motor neurons through the real wiring (strengths not fitted)', () => {
  // Cholinergic B, A and AS cells excite the muscles on their own side;
  // GABAergic D cells inhibit them (McIntire et al. 1993), so they bend the
  // body the other way. Only the signs of the junctions are used here.
  it.each([
    ['DB', 1],
    ['DA', 1],
    ['AS', 1],
    ['VB', -1],
    ['VA', -1],
    ['DD', -1],
    ['VD', 1],
  ])('stimulating %s bends the body to the expected side', (cls, side) => {
    expect(Math.sign(bendFrom(cls as string))).toBe(side);
    expect(Math.abs(bendFrom(cls as string))).toBeGreaterThan(0.05);
  });
});

describe('muscle calcium', () => {
  it('follows its drive with time constant MUSCLE_TAU', () => {
    const net = network();
    const v = Float64Array.from(net.vTh);
    const i = NEURON_COUNT; // MDL01
    v[i] = net.vTh[i]! + 200; // drive ≈ 1
    const a = new Float64Array(MUSCLE_COUNT).fill(0.5);
    for (let t = 0; t < MUSCLE_TAU; t++) stepMuscleCalcium(net, v, a, 1);
    expect(a[0]).toBeCloseTo(0.5 + 0.5 * (1 - Math.exp(-1)), 6);
    expect(a[1]).toBeCloseTo(0.5, 12);
  });
});

describe('proprioception', () => {
  it('places motor neurons along the body from nose to tail', () => {
    const u = (name: string) => bodyFraction(connectome.cells[cellIndex(name)]!);
    expect(u('DB01')).toBeLessThan(u('DB04'));
    expect(u('DB04')).toBeLessThan(u('DB07'));
    expect(u('VA01')).toBeLessThan(u('VA12'));
    for (const name of ['AVAL', 'DB01', 'VA12', 'DVA']) {
      expect(u(name)).toBeGreaterThan(0);
      expect(u(name)).toBeLessThan(1);
    }
  });

  it('knows which side each motor neuron is on', () => {
    expect(cellSide(connectome.cells[cellIndex('DB03')]!)).toBe(1);
    expect(cellSide(connectome.cells[cellIndex('VB03')]!)).toBe(-1);
    expect(cellSide(connectome.cells[cellIndex('SMDDL')]!)).toBe(1);
    expect(cellSide(connectome.cells[cellIndex('SMDVR')]!)).toBe(-1);
    expect(cellSide(connectome.cells[cellIndex('AVAL')]!)).toBe(0);
  });

  it('excites a cell when its own side is bent concave, at the place it reads', () => {
    const map = buildProprioception([
      { cls: 'DB', gain: 10, offset: 0 },
      { cls: 'VB', gain: 10, offset: 0 },
    ]);
    expect(map.cell.length).toBe(ofClass('DB').length + ofClass('VB').length);
    // A uniform dorsal bend of κ·L = 2.
    const turning = new Float64Array(NODES);
    for (let j = 1; j < NODES - 1; j++) turning[j] = (2 / BODY_LENGTH) * SEGMENT_LENGTH;
    const sense = new Float64Array(network().n).fill(7);
    senseProprioception(map, turning, sense);
    expect(sense[cellIndex('DB03')]).toBeCloseTo(20, 9);
    expect(sense[cellIndex('VB03')]).toBeCloseTo(-20, 9);
    expect(sense[cellIndex('AVAL')]).toBe(0);
  });

  it('reads the body at an offset when asked', () => {
    const at = (offset: number) => buildProprioception([{ cls: 'DB', gain: 1, offset }]).node[0]!;
    expect(at(0.1)).toBeGreaterThan(at(0));
    expect(at(-0.1)).toBeLessThan(at(0));
  });
});

describe('a worm run by its motor neurons', () => {
  it('is deterministic under stimulation', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed);
      for (const i of ofClass('VD')) setInjection(w, i, 30);
      for (let k = 0; k < 400; k++) step(w);
      return w;
    });
  });
});
