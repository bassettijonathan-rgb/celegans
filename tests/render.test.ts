import { describe, expect, it } from 'vitest';
import { wormOutline } from '../src/render/wormShape';
import { MAX_RADIUS, NODES, SEGMENT_LENGTH } from '../src/sim/body';
import { formatWormTime } from '../src/sim/time';

describe('wormOutline', () => {
  it('traces both sides of a straight worm at the body radius', () => {
    const x = Float64Array.from({ length: NODES }, (_, i) => i * SEGMENT_LENGTH);
    const y = new Float64Array(NODES);
    const poly = wormOutline(x, y);
    expect(poly.length).toBe(4 * NODES);
    const mid = (NODES - 1) / 2;
    // Node `mid` on the first side, and its partner on the way back.
    expect(poly[2 * mid + 1]!).toBeCloseTo(MAX_RADIUS, 9);
    expect(poly[2 * (2 * NODES - 1 - mid) + 1]!).toBeCloseTo(-MAX_RADIUS, 9);
  });
});

describe('formatWormTime', () => {
  it('shows minutes, seconds and tenths', () => {
    expect(formatWormTime(0)).toBe('0 min 00.0 s');
    expect(formatWormTime(65_200)).toBe('1 min 05.2 s');
  });
});
