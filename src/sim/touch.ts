/**
 * Gentle body touch (DESIGN.md section 8.2): the eyelash stroke of Chalfie
 * et al. 1985. Six touch receptor neurons have long processes along the
 * body; a touch opens mechanosensitive channels (MEC-4) in every receptor
 * whose process runs under the touched point.
 *
 * Receptive fields, as fractions of the body from the nose (Chalfie &
 * Sulston 1981 ≈; Chalfie et al. 1985 ≈): ALM and AVM send processes from
 * their somata forward to the nose; PLM from the tail forward to about mid
 * body; PVM a shorter process forward of its soma. Soma positions come from
 * the connectome (bodyFraction).
 *
 * The channel is a conductance to the excitatory reversal, like the stretch
 * channels (section 4.4). Its size and duration are guesses, labelled as
 * such: O'Hagan, Chalfie & Goodman 2005 ≈ recorded transient receptor
 * currents of tens of pA at touch onset.
 */
import { NEURON_COUNT, connectome } from './connectome';
import { bodyFraction } from './motor';

/** Conductance opened in a receptor under the touched point, nS (guess). */
export const TOUCH_CONDUCTANCE = 1;
/** How long the channels stay open after a touch, ms (guess: a brief stroke). */
export const TOUCH_MS = 100;
/** Where PLM's process ends towards the head (Chalfie & Sulston 1981 ≈: about mid body). */
export const PLM_FIELD_FRONT = 0.5;
/** How far forward of its soma PVM's process reaches (guess). */
export const PVM_FIELD_LENGTH = 0.2;

export interface TouchField {
  cell: number;
  from: number;
  to: number;
}

/** Every touch receptor's field (cell index, from, to as body fractions), in connectome order. */
export const touchFields: TouchField[] = (() => {
  const fields: TouchField[] = [];
  for (let i = 0; i < NEURON_COUNT; i++) {
    const c = connectome.cells[i]!;
    const u = bodyFraction(c);
    if (c.class === 'ALM' || c.class === 'AVM') fields.push({ cell: i, from: 0, to: u });
    else if (c.class === 'PLM') fields.push({ cell: i, from: PLM_FIELD_FRONT, to: 1 });
    else if (c.class === 'PVM') fields.push({ cell: i, from: Math.max(0, u - PVM_FIELD_LENGTH), to: u });
  }
  return fields;
})();

/** A touch in progress: where (body fraction from the nose) and until which step. Plain data. */
export interface Touch {
  at: number;
  until: number;
}

/** Adds the open touch channels' conductance to `sense` (signed nS, positive excitatory). */
export function senseTouch(touch: Touch | null, step: number, sense: Float64Array): void {
  if (!touch || step >= touch.until) return;
  for (const f of touchFields) {
    if (touch.at >= f.from && touch.at <= f.to) sense[f.cell] = sense[f.cell]! + TOUCH_CONDUCTANCE;
  }
}
