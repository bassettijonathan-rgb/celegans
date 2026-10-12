/**
 * Steering on the shipped fit (DESIGN.md section 9.2; fitted): light on AVA
 * (optogenetics; Guo et al. 2009 ≈, Kawano et al. 2011 ≈) makes the crawling
 * worm back up, and it crawls forward again once the light is off.
 */
import { describe, expect, it } from 'vitest';
import { appBrain } from '../../src/sim/fits';
import { AVA_LIGHT } from '../../tools/fit/evaluate';
import { cellsOfClasses, driveFrom, settleWithGait, touchFrom } from '../../tools/fit/touchTrial';

describe('AVA steering on the shipped fit', () => {
  // Real worms back up almost every time (Guo et al. 2009 ≈). The fit does in 5 of 8 worms: whether
  // it backs up depends on where in the stroke the light comes on (DESIGN.md 9.2).
  it('backs up while AVA is lit and crawls forward after, in at least half of 8 worms', () => {
    const b = appBrain();
    const light = Object.fromEntries(cellsOfClasses(['AVA']).map((c) => [c, AVA_LIGHT]));
    let reversed = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const s = settleWithGait(b, seed, 2000, 6000);
      const t = driveFrom(s, b, light, touchFrom(s, b, null).vel);
      if (t.reversed && t.recovered > 0) reversed++;
    }
    expect(reversed).toBeGreaterThanOrEqual(4);
  }, 600_000);
});
