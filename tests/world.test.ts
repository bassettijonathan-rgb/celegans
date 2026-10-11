import { describe, expect, it } from 'vitest';
import { BODY_LENGTH, MAX_RADIUS, NODES, SEGMENT_LENGTH, bodyRadius, centrelineLength } from '../src/sim/body';
import { Medium, PLATE_RADIUS } from '../src/sim/plate';
import { createWorld, step } from '../src/sim/world';
import { expectDeterministic } from './helpers';

describe('a new plate', () => {
  it('is deterministic', () => {
    expectDeterministic((seed) => {
      const w = createWorld(seed);
      for (let i = 0; i < 500; i++) step(w);
      return w;
    });
  });

  it('starts on agar with the worm fully inside the plate', () => {
    for (let seed = 0; seed < 50; seed++) {
      const w = createWorld(seed);
      expect(w.medium).toBe(Medium.agar);
      for (let i = 0; i < NODES; i++) {
        expect(Math.hypot(w.body.x[i]!, w.body.y[i]!)).toBeLessThan(PLATE_RADIUS - MAX_RADIUS);
      }
    }
  });
});

describe('the body', () => {
  it('has 48 segments of equal length adding up to the body length', () => {
    const { body } = createWorld(7);
    expect(body.x.length).toBe(49);
    for (let i = 1; i < NODES; i++) {
      const len = Math.hypot(body.x[i]! - body.x[i - 1]!, body.y[i]! - body.y[i - 1]!);
      expect(len).toBeCloseTo(SEGMENT_LENGTH, 9);
    }
    expect(centrelineLength(body)).toBeCloseTo(BODY_LENGTH, 6);
  });

  it('rests in a gentle bend, not straight and not coiled', () => {
    const { body } = createWorld(3);
    const n = NODES - 1;
    const endToEnd = Math.hypot(body.x[n]! - body.x[0]!, body.y[n]! - body.y[0]!);
    expect(endToEnd).toBeGreaterThan(0.6 * BODY_LENGTH);
    expect(endToEnd).toBeLessThan(0.999 * BODY_LENGTH);
  });

  it('is widest in the middle and tapers to both ends', () => {
    expect(bodyRadius(0.5)).toBeCloseTo(MAX_RADIUS, 9);
    expect(bodyRadius(0)).toBeLessThan(0.4 * MAX_RADIUS);
    expect(bodyRadius(1)).toBeLessThan(0.4 * MAX_RADIUS);
    expect(bodyRadius(0)).toBeGreaterThan(0);
    expect(bodyRadius(0.25)).toBeLessThan(bodyRadius(0.4));
  });
});
