/**
 * Gait measurement (DESIGN.md section 9, V1): frequency, wavelength,
 * amplitude, direction and speed of undulation, measured from the body the
 * way trackers measure real worms: curvature along the centreline over time
 * (Fang-Yen et al. 2010; Berri et al. 2009 ≈).
 */
import { BODY_LENGTH, NODES, SEGMENT_LENGTH } from './body';
import { turningAngles } from './mechanics';

/** Where along the body curvature is sampled (fractions, nose = 0); the very ends are left out. */
export const GAIT_POINTS = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85];

export interface Gait {
  /** Undulations per second; 0 when the body does not undulate. */
  frequency: number;
  /** Body lengths; positive when the wave runs from head to tail (forward). */
  wavelength: number;
  /** Peak curvature κ·L, averaged along the body. */
  amplitude: number;
  /** Mean speed of the centroid towards the head, mm/s (negative is backwards). */
  speed: number;
  /** How well one travelling wave explains the curvature (0 to 1). */
  coherence: number;
}

/** Collects samples while a world runs; call `sample` every `every` ms. */
export class GaitRecorder {
  readonly kappa: number[][] = GAIT_POINTS.map(() => []);
  private readonly turning = new Float64Array(NODES);
  private travelled = 0;
  private last: [number, number] | undefined;
  private ms = 0;

  constructor(readonly every: number) {}

  sample(x: Float64Array, y: Float64Array): void {
    turningAngles(x, y, this.turning);
    GAIT_POINTS.forEach((u, p) => {
      // Average three nodes around the point to smooth the discrete angles.
      const j = Math.round(u * (NODES - 1));
      const t = (this.turning[j - 1]! + this.turning[j]! + this.turning[j + 1]!) / 3;
      this.kappa[p]!.push((t / SEGMENT_LENGTH) * BODY_LENGTH);
    });
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < NODES; i++) {
      cx += x[i]!;
      cy += y[i]!;
    }
    cx /= NODES;
    cy /= NODES;
    if (this.last) {
      // Progress along the head's direction (centroid to nose).
      const hx = x[0]! - cx;
      const hy = y[0]! - cy;
      const h = Math.hypot(hx, hy) || 1;
      this.travelled += ((cx - this.last[0]) * hx + (cy - this.last[1]) * hy) / h;
      this.ms += this.every;
    }
    this.last = [cx, cy];
  }

  result(): Gait {
    return measureGait(this.kappa, this.every, this.ms > 0 ? this.travelled / this.ms : 0);
  }
}

/**
 * Gait from curvature time series (one per GAIT_POINTS entry, sampled every
 * `every` ms) and the mean forward speed (µm/ms = mm/s).
 */
export function measureGait(kappa: number[][], every: number, speed: number): Gait {
  const n = kappa[0]!.length;
  const seconds = (n * every) / 1000;
  const none: Gait = { frequency: 0, wavelength: 0, amplitude: 0, speed, coherence: 0 };
  if (n < 4) return none;
  // Amplitude: √2 × RMS curvature (exact for a sine), mean over points.
  let amp = 0;
  const centred = kappa.map((series) => {
    const mean = series.reduce((s, v) => s + v, 0) / n;
    const c = series.map((v) => v - mean);
    amp += Math.sqrt((2 * c.reduce((s, v) => s + v * v, 0)) / n);
    return c;
  });
  amp /= kappa.length;
  if (amp < 0.2) return { ...none, amplitude: amp };
  // Frequency: the strongest Fourier component, summed over points, scanned
  // from 0.1 to 4 Hz, refined to 0.01 Hz.
  const power = (f: number) => {
    let total = 0;
    for (const c of centred) {
      let re = 0;
      let im = 0;
      for (let k = 0; k < n; k++) {
        const ph = (2 * Math.PI * f * k * every) / 1000;
        re += c[k]! * Math.cos(ph);
        im -= c[k]! * Math.sin(ph);
      }
      total += re * re + im * im;
    }
    return total;
  };
  let best = 0;
  let bestF = 0;
  const lowest = Math.max(0.1, 1.5 / seconds);
  for (let f = lowest; f <= 4; f += 0.05) {
    const p = power(f);
    if (p > best) [best, bestF] = [p, f];
  }
  for (let f = bestF - 0.05; f <= bestF + 0.05; f += 0.01) {
    const p = power(f);
    if (p > best) [best, bestF] = [p, f];
  }
  // Phase of that component at each point; a wave running head to tail
  // lags further behind towards the tail.
  const phases = centred.map((c) => {
    let re = 0;
    let im = 0;
    for (let k = 0; k < n; k++) {
      const ph = (2 * Math.PI * bestF * k * every) / 1000;
      re += c[k]! * Math.cos(ph);
      im -= c[k]! * Math.sin(ph);
    }
    return { phase: Math.atan2(im, re), mag: Math.hypot(re, im) };
  });
  // Unwrap along the body and fit a line: phase = φ0 − 2π u / λ.
  const un = [phases[0]!.phase];
  for (let p = 1; p < phases.length; p++) {
    let d = phases[p]!.phase - phases[p - 1]!.phase;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    un.push(un[p - 1]! + d);
  }
  const us = GAIT_POINTS;
  const mu = us.reduce((s, v) => s + v, 0) / us.length;
  const mp = un.reduce((s, v) => s + v, 0) / un.length;
  let sxy = 0;
  let sxx = 0;
  for (let p = 0; p < us.length; p++) {
    sxy += (us[p]! - mu) * (un[p]! - mp);
    sxx += (us[p]! - mu) ** 2;
  }
  const slope = sxy / sxx;
  const wavelength = slope === 0 ? 0 : (-2 * Math.PI) / slope;
  // Coherence: share of the signal's power in this one component.
  let total = 0;
  for (const c of centred) total += c.reduce((s, v) => s + v * v, 0);
  const coherence = Math.min(1, (2 * best) / (n * total));
  return { frequency: bestF, wavelength, amplitude: amp, speed, coherence };
}
