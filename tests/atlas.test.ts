import { describe, expect, it } from 'vitest';
import { atlasPairs } from '../tools/fit/atlas';

describe('Randi 2023 atlas data (DESIGN.md 7.2, V4b)', () => {
  it('splits pairs in half, the same way in both strains', () => {
    const wt = atlasPairs('wt', 'all');
    const unc = atlasPairs('unc31', 'all');
    const held = new Map(wt.map((p) => [`${p.stim}>${p.resp}`, p.heldOut]));
    let shared = 0;
    for (const p of unc) {
      const h = held.get(`${p.stim}>${p.resp}`);
      if (h === undefined) continue;
      shared++;
      expect(p.heldOut).toBe(h);
    }
    expect(shared).toBeGreaterThan(1000);
    const frac = wt.filter((p) => p.heldOut).length / wt.length;
    expect(frac).toBeGreaterThan(0.45);
    expect(frac).toBeLessThan(0.55);
    expect(atlasPairs('wt', 'fit').every((p) => !p.heldOut)).toBe(true);
  });
});
