/**
 * The wiring (DESIGN.md section 3), read from src/data/connectome.json, which
 * tools/data/build_connectome.py generates from Cook et al. 2019 with synapse
 * signs from Fenyves et al. 2020. Nothing here is hand-written biology.
 */
import data from '../data/connectome.json';

export type CellKind = 'neuron' | 'muscle';

/**
 * Where an edge's sign comes from (DESIGN.md section 3.2). Saved: append-only.
 * - measured: shown by recordings (here: the neuromuscular junction).
 * - predicted: Fenyves 2020's transmitter + receptor rule gives one sign.
 * - ambiguous: both signs possible, or no prediction; to be fitted.
 */
export type SignLabel = 'measured' | 'predicted' | 'ambiguous';

export interface Cell {
  name: string;
  kind: CellKind;
  /** Anatomical class, e.g. AVA for AVAL and AVAR, VB for VB01–VB11. */
  class: string;
  group: string;
  /** Classical transmitters: dominant first (Fenyves 2020 table); empty for monoamine/peptide-only cells. */
  nt?: string[];
  /** Soma position (x left–right, y nose→tail, z dorsal–ventral), µm, VirtualWorm. */
  soma?: [number, number, number];
  /** Muscles: position along the body, 1 = head. */
  index?: number;
}

export interface ChemicalEdge {
  pre: number;
  post: number;
  /** Size in Cook 2019 EM sections. */
  size: number;
  /** +1 excitatory, −1 inhibitory, 0 unknown (DESIGN.md section 3.2). */
  sign: number;
  label: SignLabel;
}

export interface GapEdge {
  a: number;
  b: number;
  size: number;
}

export interface Connectome {
  cells: Cell[];
  chemical: ChemicalEdge[];
  gap: GapEdge[];
  /** Cook sections per Varshney synapse, to turn sizes into synapse counts. */
  sectionsPerSynapse: { chemical: number; gap: number };
  sources: Record<string, { cite: string; url: string }>;
}

function load(): Connectome {
  const cells = data.cells as Cell[];
  const chemical = (data.chemical as [number, number, number, number, SignLabel][]).map(
    ([pre, post, size, sign, label]) => ({ pre, post, size, sign, label }),
  );
  const gap = (data.gap as [number, number, number][]).map(([a, b, size]) => ({ a, b, size }));
  return { cells, chemical, gap, sectionsPerSynapse: data.sectionsPerSynapse, sources: data.sources };
}

export const connectome: Connectome = load();

/** Index of a cell by name, e.g. cellIndex('AVAL'). Throws for unknown names. */
const byName = new Map(connectome.cells.map((c, i) => [c.name, i]));
export function cellIndex(name: string): number {
  const i = byName.get(name);
  if (i === undefined) throw new Error(`No cell named ${name}`);
  return i;
}

/** The neurons come first in the cell list, then the 95 body-wall muscles. */
export const NEURON_COUNT = connectome.cells.filter((c) => c.kind === 'neuron').length;
