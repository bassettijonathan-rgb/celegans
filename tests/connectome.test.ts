import { describe, expect, it } from 'vitest';
import { NEURON_COUNT, cellIndex, connectome } from '../src/sim/connectome';

const { cells, chemical, gap } = connectome;
const neurons = cells.filter((c) => c.kind === 'neuron');
const muscles = cells.filter((c) => c.kind === 'muscle');
const name = (i: number) => cells[i]!.name;
const hasGap = (a: string, b: string) =>
  gap.some((e) => (name(e.a) === a && name(e.b) === b) || (name(e.a) === b && name(e.b) === a));
const chem = (a: string, b: string) => chemical.find((e) => name(e.pre) === a && name(e.post) === b);

describe('cells (Cook et al. 2019 hermaphrodite)', () => {
  it('has all 302 neurons in 118 anatomical classes', () => {
    expect(NEURON_COUNT).toBe(302);
    expect(neurons.length).toBe(302);
    expect(new Set(neurons.map((c) => c.class)).size).toBe(118);
    expect(new Set(cells.map((c) => c.name)).size).toBe(cells.length);
  });

  it('has 20 pharyngeal neurons and the ventral cord motor neurons by number', () => {
    expect(neurons.filter((c) => c.group === 'pharynx').length).toBe(20);
    const count = (cls: string) => neurons.filter((c) => c.class === cls).length;
    expect([count('DA'), count('DB'), count('DD'), count('VA'), count('VB'), count('VD'), count('AS')]).toEqual([
      9, 7, 6, 12, 11, 13, 11,
    ]);
  });

  it('has 95 body-wall muscles: 24 in each quadrant but 23 ventral-left', () => {
    expect(muscles.length).toBe(95);
    const q = (cls: string) => muscles.filter((c) => c.class === cls).length;
    expect([q('MDL'), q('MDR'), q('MVL'), q('MVR')]).toEqual([24, 24, 23, 24]);
  });

  it('lists neurons first, so indices below 302 are neurons', () => {
    expect(cells.slice(0, NEURON_COUNT).every((c) => c.kind === 'neuron')).toBe(true);
  });

  it('gives every neuron a soma position, head at negative y', () => {
    for (const c of neurons) expect(c.soma).toHaveLength(3);
    expect(cells[cellIndex('AVAL')]!.soma![1]).toBeLessThan(cells[cellIndex('PLML')]!.soma![1]);
  });
});

describe('wiring', () => {
  it('has valid references and positive sizes', () => {
    for (const e of chemical) {
      expect(e.pre).toBeLessThan(NEURON_COUNT); // only neurons release onto others
      expect(e.post).toBeLessThan(cells.length);
      expect(e.size).toBeGreaterThan(0);
    }
    for (const e of gap) expect(e.a).toBeLessThan(e.b);
  });

  it('contains the textbook touch and locomotion connections', () => {
    // AVA is coupled by gap junctions to the A-type motor neurons, AVB to the B-type
    // (White et al. 1986; Kawano et al. 2011).
    expect(hasGap('AVAL', 'DA05') && hasGap('AVAL', 'VA06')).toBe(true);
    expect(hasGap('AVBL', 'DB05') && hasGap('AVBL', 'VB05')).toBe(true);
    // Posterior touch cells PLM are coupled to the forward command cells PVC (Chalfie et al. 1985).
    expect(hasGap('PLML', 'PVCL') && hasGap('PLMR', 'PVCR')).toBe(true);
    // The anterior touch cell AVM synapses onto AVB and AVD (Chalfie et al. 1985).
    expect(chem('AVM', 'AVBL')).toBeDefined();
    expect(hasGap('AVM', 'AVDL')).toBe(true);
  });
});

describe('synapse signs (DESIGN.md section 3.2)', () => {
  it('labels every edge, with a sign exactly when the label is not ambiguous', () => {
    for (const e of chemical) {
      expect(['measured', 'predicted', 'ambiguous']).toContain(e.label);
      expect(e.sign === 0).toBe(e.label === 'ambiguous');
    }
  });

  it('makes GABAergic D-type motor neurons inhibit muscle and cholinergic B-type excite it', () => {
    const nmj = chemical.filter((e) => cells[e.post]!.kind === 'muscle');
    const signsFrom = (cls: string) => new Set(nmj.filter((e) => cells[e.pre]!.class === cls).map((e) => e.sign));
    expect(signsFrom('VD')).toEqual(new Set([-1]));
    expect(signsFrom('DD')).toEqual(new Set([-1]));
    expect(signsFrom('VB')).toEqual(new Set([1]));
    expect(signsFrom('DA')).toEqual(new Set([1]));
    expect(nmj.every((e) => e.label !== 'predicted')).toBe(true);
  });

  it('gives a single sign to more than half of the neuron-to-neuron synapse weight', () => {
    // The rest are 'complex' (both signs possible) or unpredicted, and will be fitted.
    const inner = chemical.filter((e) => e.post < NEURON_COUNT);
    const total = inner.reduce((s, e) => s + e.size, 0);
    const signed = inner.filter((e) => e.sign !== 0).reduce((s, e) => s + e.size, 0);
    expect(signed / total).toBeGreaterThan(0.5);
  });
});
