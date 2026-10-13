# DESIGN.md: a cell-by-cell *C. elegans* on an agar plate

Status: **approved by Marco on 2026-10-11** (all decisions D1–D15 as written).
Date: 2026-10-11

A browser simulation of one adult hermaphrodite *C. elegans*: all 302 neurons and all 95 body-wall
muscles as individual cells, wired from the measured connectome, driving a 2D soft body that crawls
on agar and swims in water. Behaviour is not scripted anywhere: it has to come out of the cells, the
wiring and the physics. The model is checked against real experiments, including some it was never
fitted to.

Section 1 lists every decision in one table so it can be approved or overruled row by row. Where
I think something better exists than what was proposed in the project chat, the row says so.

Numbers marked **≈** are from memory of the cited paper and are checked against the paper itself in
the milestone that first uses them, before any test depends on them.

---

## 0. What "cell by cell" honestly means here

*C. elegans* has 959 somatic cells. Simulating all of them is not possible in any meaningful sense:
for most of them (intestine, hypodermis, gonad, glia, pharyngeal muscle) nobody has a model that
connects their state to behaviour. OpenWorm has tried the whole animal since 2011 and its worm still
does not behave like a real one. So the scope is the part where the science is good enough:

- **In:** every neuron (302, including the 20 pharyngeal ones), every body-wall muscle (95), every
  measured chemical synapse, gap junction and neuromuscular junction between them. The rest of the
  body is in the simulation only as mechanics: a bendable, slightly stiff cylinder.
- **Out (v1):** pharyngeal pumping and its muscles, egg laying, the intestine's defecation clock,
  development, and most extrasynaptic signalling (neuropeptides and monoamines, D7).

The hard problem is not wiring or speed (section 11: this runs far faster than real time). It is
that **the connectome gives which cells touch, not how strongly or with which sign.** Electron
microscopy counts synapses; it cannot see whether a synapse excites or inhibits, or how strong it
is. The design treats this openly:

1. Every connection carries an **evidence label**: anatomy (always), sign source (measured, predicted
   from gene expression, or fitted) and strength source (synapse count × fitted class scale).
2. Unknowns are fitted to behaviour and to measured neural activity, never hand-tuned to make a demo
   look right (section 7).
3. Some experiments are **held out** from fitting and used only to test the model (section 9). A
   model that reproduces what it was fitted to proves little; one that predicts the effect of
   killing a neuron it was never told about says something.
4. Fitting gives many parameter sets that fit equally well (the "degeneracy" Prinz, Bucher & Marder
   2004 showed in the lobster stomatogastric circuit). We keep an **ensemble** of fits and report
   predictions across it, not one lucky set (D6).

What Marco gets to watch: a worm that crawls, swims, reverses when you touch its nose, turns, and
finds salt, with every cell's activity visible, and a lab bench to kill or stimulate any neuron
and see what changes.

---

## 1. Decisions for Marco

| # | Decision | Rec. | Alternative | § |
|---|---|---|---|---|
| D1 | Cell scope | **302 neurons + 95 body-wall muscles** simulated as cells; rest of the body as mechanics only | Also pharyngeal muscles and pumping | 0 |
| D2 | Wiring data | **Cook et al. 2019** hermaphrodite (has the muscles and neuromuscular junctions), cross-checked with **Varshney et al. 2011** | Varshney / White 1986 only | 3.1 |
| D3 | Synapse signs | **Prior from transmitter + receptor expression (Fenyves et al. 2020)**, fitted only where that is ambiguous, every edge labelled | Sign by transmitter alone (ACh +, GABA −): known to be wrong for many glutamate and some ACh synapses | 3.2 |
| D4 | Neuron model | **Graded-potential single compartment** (Wicks, Roehrig & Rankin 1996; Kunert et al. 2014) with sigmoid synaptic release; **conductance-based exceptions** for the cells known to spike or plateau (AWA, AVL, DVB, RMD) and for muscle | Full Hodgkin-Huxley for all (most conductances unmeasured); spiking Izhikevich for all (wrong for this animal) | 4 |
| D5 | Unknown strengths | **Weight = synapse count × fitted scale per neuron-class pair**, left/right symmetric: about 150–300 free numbers | One free weight per edge (~7,000 numbers, hopelessly under-determined) | 7.1 |
| D6 | Fitting | **CMA-ES, offline in Node, an ensemble of ~10 fits**, behaviour + measured neural activity as targets, **ablation experiments held out** | One best fit; hand tuning | 7 |
| D7 | Neuropeptides and monoamines | **Left out of v1 and labelled as a known gap**; the lab bench shows where they are missing | Coarse peptide layer from Ripoll-Sánchez et al. 2023 now | 3.4 |
| D8 | Where the rhythm comes from | **Both evidence-based mechanisms, each switchable**: proprioceptive coupling along the B motor neurons (Wen et al. 2012) plus a head oscillator, and intrinsic oscillation in A motor neurons for backward (Xu et al. 2018). An experiment compares them | Pick one mechanism | 5.3 |
| D9 | Body mechanics | **Overdamped 2D elastic rod** (Boyle, Berri & Cohen 2012 style), worm lying on its side. **Better than reusing spikingbrain's body**: that one has inertia, which is wrong at the worm's Reynolds number (≪ 1) | Reuse spikingbrain mass-spring; 3D fluid body (OpenWorm Sibernetic, far too slow) | 6 |
| D10 | Agar and water | **Resistive force theory** with drag ratio K: ≈ 1.5 in water, large on agar, a **viscosity slider** in between | Agar as anisotropic Coulomb friction (agar is a wet film; it acts like a very anisotropic viscous medium) | 6.3 |
| D11 | Muscles | **95 muscle cells**, each pulling on its own stretch of body; the four quadrants fold to dorsal and ventral sides in 2D; muscle-to-muscle gap junctions kept | One muscle per segment and side (loses cell identity) | 6.4 |
| D12 | "Touch its nose" | **Two separate behaviours**: nose touch (ASH, FLP, OLQ; Kaplan & Horvitz 1993) and gentle anterior body touch with an eyelash (ALM, AVM; Chalfie et al. 1985). The project-chat note merged them | Only one of them | 8.2 |
| D13 | Fit vs held-out split | Fit on intact-worm behaviour and part of the Randi 2023 activity atlas; **hold out all ablations, the rest of the atlas, and intermediate viscosities** | Fit on everything (no real test) | 9 |
| D14 | Rendering | **PixiJS**, same as formicarium (thousands of synapse lines in the brain view) | Canvas 2D | 10 |
| D15 | Shipping the data | **Convert the published tables once with a script, commit the JSON with its source and checksum**; licence checked in M1 | Fetch at runtime from WormWiring or OpenWorm | 3.5 |

None of these block each other.

---

## 2. Units and scales

| Quantity | Unit | Typical value |
|---|---|---|
| Length | µm | adult body ≈ 1,000–1,100 µm long, ≈ 60–80 µm wide |
| Time | ms | neural step 1 ms (substeps for spiking cells), behaviour over minutes |
| Voltage | mV | graded neurons rest ≈ −60 to −70 mV and move by tens of mV |
| Force | nN | body forces of order 1–10 µN |
| Concentration | mM NaCl | gradients over 0–100 mM across a plate |

The worm's Reynolds number is ≈ 10⁻³–10⁻¹ in water and lower on agar, so **inertia does not
matter**: the body stops the instant forces stop. This drives D9.

---

## 3. The connectome

### 3.1 Sources (D2)

- **Cook et al. 2019** (*Nature*): whole-animal connectome of both sexes, re-annotated from the
  original White et al. 1986 electron micrographs plus new series. It includes synapses onto
  muscles and the muscles' own gap junctions, which this model needs. Primary source.
- **Varshney et al. 2011**: the standard 279-neuron somatic network (≈ 6,400 chemical synapses,
  ≈ 890 gap junctions, ≈ 1,400 neuromuscular junctions). Used as a cross-check: a test lists every
  edge where the two disagree by more than a threshold, and the list is printed in the data notes.
- **Witvliet et al. 2021**: eight animals across development. Not used in v1, but it shows which
  connections vary between individuals and which are stereotyped. Later (section 13) it can give
  each worm its own slightly different brain.

Each edge stores: pre, post, type (chemical / gap junction), synapse count (or EM size where
available), and the source(s) it appears in.

### 3.2 Signs (D3)

A chemical synapse's sign depends on the receptor on the receiving cell, not only on the
transmitter. In *C. elegans* glutamate can excite (AMPA/NMDA-like receptors) or inhibit
(glutamate-gated chloride channels such as GLC-3, AVR-14), and acetylcholine can inhibit through
ACh-gated chloride channels. **Fenyves, Szilágyi, Vassy, Sőti & Csermely 2020** combined transmitter
identity (Pereira et al. 2015 for ACh, Serrano-Saiz et al. 2013 for glutamate, GABA: the 26 known
GABAergic cells) with receptor expression to predict a sign for most edges.

Rule: each edge's sign comes with a label.

| Label | Meaning | Used how |
|---|---|---|
| `measured` | an electrophysiology or optogenetics paper shows the sign | fixed |
| `predicted` | Fenyves 2020 gives one sign | fixed, can be flipped in an experiment |
| `ambiguous` | both receptor types expressed, or unknown | fitted (a continuous mix between −1 and +1) |

### 3.3 Gap junctions

Gap junctions conduct both ways, with conductance ∝ count × a fitted scale per class pair. Many
locomotion results depend on them (AVA and AVB are coupled to the A and B motor neurons through gap
junctions; Kawano et al. 2011). Ohmic by default; from M4b a fit may make junctions rectify (4.6).

### 3.4 What the wiring misses (D7)

**Randi et al. 2023** (*Nature*) stimulated neurons one at a time with light and imaged the
responses across the head: many functional connections have no wired synapse behind them, largely
through neuropeptides (**Ripoll-Sánchez et al. 2023** mapped that network). This is the biggest
known limit of any connectome-only model, ours included. v1 leaves it out, keeps the measured
atlas as a target (section 7.2), and the lab bench marks each atlas response the wiring cannot
explain. A peptide layer is the first item in section 13.

### 3.5 Data pipeline (D15)

`tools/data/build_connectome.py` (Python, openpyxl) downloads its inputs at pinned versions, checks
each against a SHA-256, and writes `src/data/connectome.json` plus a cross-check report,
`tools/data/REPORT.md`. The simulation never reads anything else. Inputs (as built in M1):

- **Cook 2019** SI 5 adjacency matrices (corrected July 2020), from OpenWorm's ConnectomeToolbox
  (MIT). Strengths are Cook's connection sizes in **EM serial sections**, not synapse counts.
- **Varshney 2011** synapse counts, same source, used for the cross-check and for units: over
  the pairs both datasets list, one Varshney synapse ≈ 2.6 Cook sections (chemical) and ≈ 3.4
  (gap junctions). The model divides Cook sizes by these, so the per-synapse conductances of 4.2
  apply.
- **Fenyves 2020** S3 Data (transmitter and receptor-gene tables), shipped in the `wormneuroatlas`
  package of Randi et al. 2023. The converter re-implements Fenyves' rule from their spreadsheet
  (sheet 5) and applies it to Cook's edges. Result: 1,360 excitatory, 440 inhibitory, 455 "complex"
  (both signs possible) and 1,454 with no prediction (mostly cells with no classical transmitter,
  such as the dopaminergic and serotonergic ones); by weight, 57% of neuron-to-neuron synapses
  get a single sign. The rest are `ambiguous` and wait for fitting.
- **Neuromuscular junctions:** body-wall muscle has excitatory nicotinic ACh and inhibitory GABA-A
  (UNC-49) receptors (Richmond & Jorgensen 1999), so ACh and GABA synapses onto muscle are
  `measured`; the 64 others are `ambiguous`.
- **Soma positions** for the brain view: OpenWorm CElegansNeuroML (the VirtualWorm model, µm),
  pinned commit. Drawing only.

Checks on the result (tests in `tests/connectome.test.ts`): 302 neurons in 118 classes,
20 pharyngeal neurons, the ventral cord classes by number, 95 body-wall muscles (24/24/23/24),
and textbook connections (AVA–A and AVB–B motor neuron gap junctions, PLM–PVC, AVM→AVB). Cook
and Varshney agree on most strong connections; the report lists the few strong ones that differ.

---

## 4. Neurons (D4)

### 4.1 Why not spikes

Most *C. elegans* neurons do not fire action potentials. Their voltage changes smoothly, and they
release transmitter in proportion to it (Goodman et al. 1998; Lockery & Goodman 2009). A spiking
model like spikingbrain's Izhikevich neurons would be the wrong biology. A few exceptions are known:
**AWA** fires sodium-free calcium spikes (Liu et al. 2018), **AVL and DVB** spike (Jiang et al.
2022), **RMD** has plateau potentials (Mellem et al. 2008), and **body-wall muscles** fire calcium
action potentials (Gao & Zhen 2011; Liu et al. 2013).

### 4.2 The graded model

For neuron *i*:

```
C_i dV_i/dt = −g_L (V_i − E_L)
              − Σ_j  g_gap,ij (V_i − V_j)                     gap junctions
              − Σ_j  g_syn,ij · s_j · (V_i − E_ij)            chemical synapses
              + I_ext,i + noise
s_j  = 1 / (1 + exp(−β (V_j − V_th,j)))                       graded release (Wicks 1996)
```

- `E_ij` is the reversal potential set by the edge's sign: ≈ 0 mV for excitatory, ≈ −70 mV for
  inhibitory; a fitted `ambiguous` edge mixes the two.
- `V_th` is per neuron class, centred on that neuron's resting potential, so a cell at rest
  releases a little (as graded synapses do) and more when depolarized.
- Membrane `C` and `g_L` come from published recordings where they exist (time constants of tens
  of ms), otherwise a shared default; every number is labelled the same way as edges.
- **Noise:** a small seeded current noise per cell (channel noise). It is what makes spontaneous
  reversals possible at all.

This is the model family of Wicks, Roehrig & Rankin 1996 (tap withdrawal circuit) and Kunert,
Shlizerman & Kutz 2014 (whole-connectome dynamics), and close to OpenWorm c302's level "B".

As built in M1 (`src/sim/neurons.ts`):

- Default parameters are Kunert 2014's ≈ (C = 1 pF, g_L = 10 pS, E_L = −35 mV, 100 pS per gap
  junction and per synapse, E = 0 / −48 mV, β = 0.125 /mV). They are marked as not yet checked
  against the paper: the build environment cannot reach journal sites, so this check waits for a
  copy of the paper.
- `V_th` per neuron is the network's equilibrium with every synapse half open (Kunert 2014). That
  equilibrium is also the network's resting state.
- **Resting release (M4b).** Half-open synapses at rest load every hub with tens of nS of always-on
  input, so a few touch synapses cannot move it (section 9.2). A fit may therefore set the release
  every cell has at rest, `restRelease` (default 0.5, Kunert's rule): the resting state is the
  equilibrium with every cell releasing that much, and `V_th` sits `ln(1/s₀ − 1)/β` above it. The
  M4b fits use 0.1 (a **guess**: graded synapses release a little at rest, Liu et al. 2009 ≈).
- `ambiguous` edges get a reversal half way between E_inh and E_exc until fitted.
- Gap junctions make the equations stiff (a well-coupled cell relaxes in ≈ 0.1 ms), so each step
  is backward Euler in V with release taken from the start of the step, solved by
  Jacobi-preconditioned conjugate gradients. Stable at 1 ms; a test checks 1 ms against 0.125 ms.
- Known limit of the passive graded model: nothing caps depolarization, so a strongly stimulated
  cell can go far above any real voltage. The voltage-gated currents that bound real cells come
  with the conductance-based cells (4.3) and the fits.

### 4.3 Exceptions

The cells in 4.1 get a small conductance-based model (Morris–Lecar-style: a calcium current and a
potassium current), with parameters from the cited recordings, e.g. AWA from Liu et al. 2018 and
the conductance-based models of Naudin et al. 2022 for RMD, AWA and AIY. They run with 0.1 ms
substeps; a test halves the step and checks the trace barely changes.

### 4.4 Sensory transduction

Sensory neurons receive a stimulus current from their receptor model (section 8). Proprioception
(B and A motor neurons, SMD, DVA among others) is a current proportional to local body curvature at
the cell's position, sign and gain fitted.

As built in M3a (`src/sim/motor.ts`): DB, VB, DA, VA and SMD each get `gain · side · κL`, read at
the soma's position along the body plus a per-class offset (positive is towards the tail). Side is
+1 for dorsal cells and −1 for ventral, so a positive gain excites a cell when its own side is
bent concave. A soma's position along the body comes from its VirtualWorm coordinate, scaled so the
nose and tail tips sit 25 and 30 µm beyond the first and last somata. Gains are 0 and offsets 0
until M3b fits them; Wen et al. 2012 ≈ is the evidence that B cells sense bending next to them,
and the fit decides on which side. Each class reads the mean curvature over a receptive field
(offset and length fitted): Boyle, Berri & Cohen 2012 gave each B unit a field reaching about half a
body length behind it. DVA is left out for now: its single long process runs the length
of the body, so it needs a receptive field rather than a point.

Changed in M3b: proprioception and the fitted tonic drive are **conductances, not currents**.
`gain · side · κL` is now a signed conductance in nS: positive opens a channel to the excitatory
reversal (0 mV), negative one to the inhibitory reversal (−48 mV), as stretch-gated cation and
chloride channels would. The first M3b fit, with currents, found a gait by driving motor neurons to
±1,000 mV and beyond, which no real cell can do; with conductances every cell stays between the
reversal potentials by construction (tested in `tests/fit.test.ts`). Currents remain only for the
lab bench's electrode.

### 4.5 Slow inward channel (rhythm source, M4)

Added in M4 after B-cell stretch feedback alone failed to crawl (section 9.2), with Marco's
approval. The A and B motor neurons (DA, VA, DB, VB) may carry one slow inward channel:

    I_slow = g_slow · m · (E_exc − V),   dm/dt = (m∞(V) − m) / τ,   m∞ = 1 / (1 + exp(−(V − V_half) / 2 mV))

With enough `g_slow` a cell latches: once pushed past `V_half` the channel holds it depolarised
until an inhibitory push turns it off. A latching cell whose switch is driven by the bend the body
itself makes is a relaxation oscillator; this is the mechanism of Boyle, Berri & Cohen 2012 ≈
(bistable B units with stretch input). Fouad et al. 2018 ≈ found rhythm generators along the
ventral cord, and the A and B motor neurons express calcium channels (EGL-19, UNC-2; Liu et al.
2018 ≈ for A cells). Per class, `g_slow` (0 to 10 nS), `V_half` (relative to the cell's release
threshold, ±20 mV) and `τ` (5 to 500 ms) are **fitted guesses**; the 2 mV slope is a guess for a
regenerative current. The channel counts fully open towards the input-conductance cap (section 9.2),
so a latched cell stays within real neurons' range. The shipped M4 fit turned out not to need it: switching every slow
channel off leaves its gait almost unchanged (section 9.2). It stays available to later fits. Gating is plain data in the neuron state, so it
saves and hashes; an ablated cell loses its channel. Tests in `tests/neurons.test.ts`.

### 4.6 Rectifying gap junctions (M4b)

Added in M4b with Marco's approval, after touch could not reach AVA through ohmic junctions: each
cell on the touch path sits at roughly the average of its many gap partners, so every hop loses
most of the signal (section 9.2). Real junctions need not be ohmic. Liu, Chen, Mailler & Wang 2017
recorded the AVA–A motor neuron junctions (UNC-7 in AVA, UNC-9 in the A cells) and found they "only
allow current flow from A-MNs into AVA", which they call probably the strongest rectification seen
in native gap junctions. A junction between cells *i* and *j* with rectification ρ (−1 to 1):

    g_eff = g · (1 − |ρ| · σ(∓(V_i − V_j) / 2 mV))

where positive ρ passes current from *i* to *j* and shuts by the fraction |ρ| when *j* is the more
depolarised (σ the logistic function; the sign flips for negative ρ). The 2 mV switch is a
**guess** (steep, as Liu 2017 describe). The factor is the same seen from either cell, so the
conductance matrix stays symmetric and the solver unchanged; it is taken from the start of each step,
like release, and the resting state is iterated to its fixed point.

- **Measured, fixed:** AVA–DA and AVA–VA, fully one way into AVA (Liu 2017; `MEASURED_RECT`).
  Applied in every touch fit from M4b.
- **Fitted guesses:** ρ for each touch-path class pair with its own strength (a command cell's or a
  touch receptor's junctions with another class), in the touch task only. UNC-7/UNC-9 junctions
  rectify in oocytes (Starich et al. 2009 ≈), which makes this plausible, but which way each of
  these pairs passes current is not measured; the fit's choices are labelled as guesses.
- The input-conductance cap counts every junction fully open. Tests in `tests/neurons.test.ts` and
  `tests/fit.test.ts`.

---

## 5. The motor system

### 5.1 The cells that matter most

- **Command interneurons:** AVB and PVC drive forward; AVA, AVD and AVE drive backward
  (Chalfie et al. 1985). AVA and AVB inhibit each other's state (bistable forward/backward switch).
- **Ventral cord motor neurons:** B-type (DB1–7, VB1–11) for forward, A-type (DA1–9, VA1–12) for
  backward, D-type GABAergic (DD1–6, VD1–13) inhibit the opposite side so dorsal and ventral do not
  contract together, AS1–11.
- **Head motor neurons:** RMD, SMD, SMB, RME drive the head and neck muscles.

### 5.2 Muscle drive

Motor neurons release onto muscle arms; each body-wall muscle receives the synapses Cook 2019
lists. Muscle activation follows calcium (section 6.4).

### 5.3 Where the rhythm comes from (D8)

This is still debated in the literature, so the design does not hide it:

- **Proprioceptive chain** (Wen et al. 2012; modelled in Boyle, Berri & Cohen 2012): a B motor
  neuron senses the curvature of the body just anterior to it and makes its own segment follow.
  The bending wave starts at the head and is passed back along the body. This alone explains why
  the gait changes smoothly with viscosity (Berri et al. 2009; Fang-Yen et al. 2010).
- **Oscillators:** the head has its own rhythm generator, and Fouad et al. 2018 showed the body
  posterior can oscillate when the head is paralysed. A motor neurons oscillate intrinsically
  during backward movement (Xu et al. 2018; Gao et al. 2018).

Both mechanisms are built and switchable. One experiment (V1c, section 9) runs both and reports
which ones the gait-versus-viscosity curve needs. That is a small scientific result of its own.

---

## 6. Body and physics (D9–D11)

### 6.1 Body

The adult worm lies on its side on agar, so its dorsal and ventral bends are in the plane we see.
Body: a 2D **elastic rod** of 48 segments (49 nodes on the centreline), radius tapering towards the
head and tail. State per node: position; per segment: angle. Internal mechanics:

- Stretching: a stiff spring keeps segments near constant length.
- Bending: elastic moment `M = k_b (κ − κ_active)`, with `k_b` from measured body stiffness
  (Fang-Yen et al. 2010 ≈) and internal viscous damping.
- Muscles add active bending moments (6.4).

### 6.2 Overdamped dynamics

At Re ≪ 1 there is no inertia: at every moment, forces from the body balance drag from the medium.

```
0 = F_elastic(x) + F_muscle(x, a) + F_drag(ẋ)     solve for ẋ, then x ← x + Δt · ẋ
```

Drag is linear in velocity (6.3), so each step is a linear solve for the velocities. The rod's
neighbours make that matrix banded, so the solve costs about the same as the explicit loop. A
**semi-implicit** step (elastic forces linearized) keeps it stable at 1 ms despite the stiff
stretching springs. This is the reason not to reuse spikingbrain's symplectic Euler: an inertial
integrator at these scales needs tiny steps and gets the physics wrong when it doesn't.

As built in M2 (`src/sim/mechanics.ts`):

- Each 1 ms step is backward Euler, `D (x₁ − x₀)/Δt = F(x₁)`, with the drag directions taken at
  the start of the step, solved by **two Newton iterations** with the analytic stiffness matrix
  (the Hessian of the stored energy; a test checks it against finite differences). The single
  linearized step planned above was not accurate enough in water: there a body-sized bend relaxes
  in ≈ 0.2 ms, the elastic forces are far from linear within one step, and the swimming speed came
  out 40% too high. With two Newton iterations the 1 ms step gives the Δt → 0 speed to four digits
  (0.1657 mm/s for the test wave), in water and on agar. A step that would move a node more than a
  fifth of a segment is split in two.
- Bending stiffness `k_b = 1e8 nN·µm²` (= 1e-13 N·m², inside the published range ≈ 1e-14 to
  3e-13, Fang-Yen 2010; Backholm 2013). Stretching is a stiff spring, a numerical choice rather than
  a measurement: segments stay within 0.1% of their length when swimming hard.
- No internal viscous damping yet: in the overdamped model the external drag already damps every
  mode. Added in M3 only if the gait fits need it.
- Cost: ≈ 0.1 ms of CPU per step, so the body and the 302 neurons together run at about 1/6 of a
  core at 1×.

### 6.3 Agar, water and in between (D10)

Resistive force theory (Gray & Hancock 1955) per segment:

```
F_t = −c_t · v_t · L_seg        (along the body)
F_n = −c_n · v_n · L_seg        (sideways)
K   = c_n / c_t
```

- **Water / buffer:** K ≈ 1.5 (slender body in a Newtonian fluid).
- **Agar:** the worm sits in a groove in the wet surface film and can barely slip sideways. K is
  large (tens; Berri et al. 2009, Boyle et al. 2012 ≈), and the absolute drag is far higher.
- **Viscosity slider:** interpolates c_t and K between the two, which is how Berri 2009 and
  Fang-Yen 2010 swept gels and viscous solutions.

The plate has a wall (edge of the dish); worms in water need no ground.

As built in M2: water `c_t = 3.3e-3`, `c_n = 5.2e-3` Pa·s (K ≈ 1.6); agar `c_t = 3.2`,
`c_n = 128` Pa·s (K = 40), the values used by Boyle, Berri & Cohen 2012 ≈ after Niebur & Erdős
1991. Checked: these are exactly the constants in Boyle, Berri & Cohen's published model code
(github.com/openworm/CelegansNeuromechanicalGaitModulation, `worm.cc`, after dividing out their
per-node split); the original papers themselves are not reachable from the build environment. The slider interpolates both
coefficients in log space. The wall is a stiff spring at the dish edge. Tests:

- Same drag in every direction: the worm goes nowhere (to 1e-9 µm/ms).
- Gray & Hancock 1955: at small amplitude (β = bq = 0.03, wavelength L/3) the speed is 0.965 of
  the infinite-filament result `U = V (K − 1) β²/2` in water and 0.896 on agar. The finite body's
  recoil (sway and yaw) makes up the difference, more so at large K. Halving β quarters the speed
  (ratio 3.998 and 3.954).
- Scallop theorem: a standing wave goes < 1% as far as a travelling one, when driven slowly enough
  for the body to follow (agar at 0.1 Hz, water at 2 Hz).
- **A finding:** at the real crawling frequency (0.5 Hz) a standing-wave drive does move the worm,
  about 4.5% of a forward stroke per cycle. On agar a body-sized bend takes ≈ 0.15 s to relax, and
  different bending modes lag the drive by different amounts, so the body's actual shape is no
  longer reciprocal. This is the "flexible oar" of Wiggins & Goldstein 1998, not an error; a test
  keeps it.
- Passive relaxation never gains energy, in water and on agar.

### 6.4 Muscles

- 95 cells: dorsal-left, dorsal-right, ventral-right with 24 each, ventral-left with 23, staggered
  along the body as in the real worm. Each muscle spans a fixed stretch of rod segments.
- In 2D, left and right muscles of the same side add to the same bend. (The head can also lift
  out of the plane in 3D; that is out of scope.)
- Each muscle is a cell with membrane voltage, the Ca action potentials of Gao & Zhen 2011 in
  simplified form, and calcium `c` as a low-pass of activity. Active bending moment on its
  segments ∝ `f(c)`, saturating. Muscles are joined to neighbours by gap junctions (Cook 2019).
- Dorsal muscles bend the body dorsally, ventral ventrally. Opposing contraction is prevented only
  by the D-type cross inhibition, as in the worm.

As built in M2 (`src/sim/muscles.ts`, `src/sim/puppet.ts`): the muscles are **actuators** only.
Each has an activation from 0 to 1.

As built in M3a: the 95 muscles are cells of the network (`buildNetwork` now holds 397 cells). They
receive all 956 neuromuscular junctions of Cook 2019 (892 with a measured sign) and their 96
muscle-to-muscle gap junctions. Their membrane is, for now, the same graded model as the neurons, and
their "release" is the calcium drive: calcium follows it with a 100 ms time constant (the muscle
time constant of Boyle, Berri & Cohen 2012, checked in their published code) and is the activation. The calcium action potentials of Gao & Zhen 2011
replace this with the conductance-based cells. At rest every muscle sits at half activation, so the
two sides cancel and the body lies straight. With strengths not yet fitted, stimulating each motor
class already bends the body to the anatomically expected side: DB, DA and AS dorsal; VB and VA
ventral; GABAergic DD ventral and VD dorsal, by relaxing their own side (tests/motor.test.ts). The
puppet still overrides the motor neurons when it is on.

- Placement: the 24 positions of each quadrant are spread evenly over 5–95% of the body length (a
  simplification of WormAtlas ≈, not a measured map). Each cell pulls with a hat-shaped weight two
  spacings long, so neighbours overlap by half, like the two staggered rows. MVL24 is missing, as in
  the worm.
- Active curvature at a point is `κ_max (D − V)`, where D and V are the dorsal and ventral pulls
  (left and right each give half). `κ_max · L = 10` is a guess (crawling bends reach κ·L ≈ 5–8,
  Stephens et al. 2008 ≈); M3 fits muscle strength.
- Dorsal is drawn on the left of the direction of travel.
- **Puppet** (lab bench): a prescribed head-to-tail wave of activation, dorsal and ventral in
  antiphase. The gait follows the medium: ≈ 2 Hz and wavelength 1.5 L in water, ≈ 0.5 Hz and
  0.65 L on agar (Fang-Yen 2010 ≈). It moves at ≈ 0.23 mm/s on agar and ≈ 0.17 mm/s in water. No
  validation depends on these numbers; the real gait must come from the motor circuit in M3.

---

## 7. Fitting the unknowns (D5, D6)

### 7.1 What is free

- Synapse strength: `g_syn,ij = n_ij · w(class_i, class_j)` where `n_ij` is the EM synapse count
  and `w` is one number per pair of neuron classes. Classes are the 118 anatomical classes
  (e.g. all VB together, AVAL and AVAR together), which builds in left/right symmetry. Only class
  pairs that are actually connected get a number; pairs below a few synapses share a default.
- The same for gap junctions.
- `ambiguous` signs (3.2), per-class `V_th`, proprioceptive gains, muscle gain.

Estimated total: **≈ 150–300 parameters.** That is a size where fitting is feasible and where
the data still constrains it; per-edge weights (~7,000) would fit anything and mean nothing.

### 7.2 Targets

The cost function compares the simulated worm with numbers from papers, never with
"looks right":

| Target | Source |
|---|---|
| Crawling and swimming frequency, wavelength, speed | Fang-Yen et al. 2010; Berri et al. 2009 |
| Spontaneous reversal rate off food | Gray, Hill & Bargmann 2005 ≈ |
| Response probability and latency to anterior and posterior touch, nose touch | Chalfie et al. 1985; Kaplan & Horvitz 1993; Wicks & Rankin 1995 |
| Chemotaxis index to NaCl, turning rate vs dC/dt | Bargmann & Horvitz 1991; Pierce-Shimomura et al. 1999 |
| AVA/AVB activity vs movement direction | Kato et al. 2015; Kawano et al. 2011 |
| Half of the Randi 2023 stimulation-response pairs (chosen at random by seed) | Randi et al. 2023 |

### 7.3 Method

- **CMA-ES** (covariance matrix adaptation): robust for 100s of noisy, coupled parameters, needs
  no gradients. Runs headless in Node with worker threads (`npm run fit`).
- Each evaluation runs a short battery (about 2–3 minutes of worm time across assays and seeds).
- **Ensemble:** 10 independent fits from different starts. Accepted fits go into
  `src/data/fits/` with their score, seed and date. The app loads one by default and the lab bench
  can switch between them. Every prediction in section 9 is reported as "k of 10 fits".
- **Stop rule:** if no fit reaches the targets with parameters in physiological ranges, I stop and
  report what fails (and how) before changing the model. Same rule as the ants and creatures.

### 7.4 Transmission calibration against the atlas (M4c)

Added after touch (M4b) and salt (M5) both failed for the same reason: every sensory signal
fades within two hops (section 9.2). `tools/data/build_atlas.py` extracts Randi et al. 2023's
signal propagation atlas (`src/data/atlas.json`: per stimulated and responding neuron, mean ΔF/F,
q value, trials; wild type and unc-31, which lacks neuropeptide release) and splits every ordered
pair into a fitting half and a held-out half by a seeded hash, the same in both strains.
`tools/fit/atlas.ts` runs the experiment in the model (light one cell with a 2 nS channel for
0.5 s, network only, as in the immobilised worms; mean ΔV over 2 s against an unlit run).
`tools/fit/atlasFit.ts` fits every class pair's strength to the unc-31 fitting half by the
network's linear response at rest, with a fifth of the fitting half kept aside to check that the
fit generalises. Findings in 9.3.

---

## 8. Sensory world

### 8.1 Proprioception
Curvature at each body point, read by the cells in 4.4.

### 8.2 Touch (D12)
- **Gentle body touch** (eyelash stroke): ALM and AVM (anterior), PLM (posterior), PVM.
  Stimulus: the player clicks a point on the body; nearby receptors get a brief current falling
  off with distance along their known process.
- **Nose touch** (head-on bump): ASH, FLP, OLQ (Kaplan & Horvitz 1993). Triggered by the player's
  probe or by the head hitting the dish wall.
- **Harsh touch**: PVD and others; later.

### 8.3 Salt
- NaCl field on the agar: a 2D grid with real diffusion (D ≈ 1.5 × 10⁻⁹ m²/s in water, slower in
  agar), started from a salt spot the player places, as in the plate assays.
- **ASEL** responds to increases, **ASER** to decreases (Suzuki et al. 2008), each with adaptation:
  the receptor current depends on the recent change in concentration at the nose tip, not its level.
- Downstream (AIY, AIZ, AIB, RIA, SMB…) is whatever the connectome wires. The two known
  strategies should emerge, not be coded: **pirouettes** (more turns when salt is falling;
  Pierce-Shimomura et al. 1999) and **weathervaning** (steering during head sweeps; Iino & Yoshida
  2009).

### 8.4 Not in v1
Temperature (AFD), odours (AWA, AWC), oxygen, food and bacteria lawns, light. The cells are all
simulated; they just get no stimulus yet.

---

## 9. Validation experiments (D13)

Each runs over 10 seeds × the ensemble and prints pass/fail with the number. **F** = fitted target,
**H** = held out (never seen by the fit). The H rows are the real tests.

| # | Experiment | Pass when | F/H |
|---|---|---|---|
| V1a | Crawling on agar | frequency ≈ 0.3–0.6 Hz, wavelength ≈ 0.6–0.7 body lengths (Fang-Yen 2010 ≈) | F |
| V1b | Swimming in water | ≈ 1.5–2 Hz, wavelength ≈ 1.5 body lengths, a "C"-like thrash | F |
| V1c | Gait across intermediate viscosities | frequency and wavelength change **smoothly and monotonically**, matching the curve shape in Fang-Yen 2010 / Berri 2009 | H |
| V2a | Gentle anterior touch | reversal in most trials, latency under ≈ 1 s | F |
| V2b | Posterior touch | forward acceleration | F |
| V2c | Nose touch and wall collisions | reversal, often followed by an omega turn | F |
| V2d | Chalfie 1985 ablations: kill ALM+AVM; kill AVD; kill AVB+PVC; kill AVA | the published loss of each response | **H** |
| V2e | Wicks & Rankin 1995 tap-circuit ablations | direction of response shifts as published | **H** |
| V3a | Salt chemotaxis on a standard plate | chemotaxis index clearly positive, in the published range (Bargmann & Horvitz 1991 ≈) | F |
| V3b | Pirouettes and weathervaning | turn rate rises when dC/dt < 0; curving towards the gradient during runs | H |
| V3c | Kill ASE (both) / ASEL / ASER | CI falls to near 0 / partial losses as in Bargmann & Horvitz 1991 and Suzuki 2008 | **H** |
| V4a | AVA is up during reversals, AVB during forward | as in Kato 2015 | F |
| V4b | The other half of Randi 2023's atlas | correlation of predicted vs measured responses, reported against a shuffled-connectome baseline | **H** |
| V5 | Rhythm mechanism (D8) | which of the switchable mechanisms V1c needs; a result, not a pass/fail | – |

### 9.1 Results: M3b (one fit, `src/data/fits/gait.json`)

One gait fit so far, not yet the ensemble of 10 (that comes with M5). Every cell stays between the
reversal potentials (−48 to 0 mV). Gait measured on seed 1; seeds 2–6 give the same gait within
0.01 Hz and 0.01 body lengths.

| # | Result | Verdict |
|---|---|---|
| V1a | agar: 0.47 Hz, wavelength 0.65 L, κL 3.1, forward 0.19 mm/s | pass |
| V1b | water: 1.92 Hz, wavelength 1.32 L, κL 3.2, forward 0.10 mm/s | pass |
| V1c | frequency falls smoothly and monotonically (1.92 → 0.47 Hz). Wavelength does not: it stays at ≈ 1.33 L up to 70% of the way from water to agar, jumps to 1.93 L at 80%, then drops to 0.70 and 0.65 L. Real worms change smoothly | **fail** |
| V5 | the rhythm needs stretch feedback (without it nothing moves), and specifically the A cells' (DA or VA off: no gait); B-cell and SMD stretch barely matter | result |

V5 disagrees with the evidence: in real worms B cells carry forward undulation by sensing the bend
just ahead of them (Wen et al. 2012) and A cells drive backward movement. The fit found a way to
move the body that is not the real worm's. A second fit allowed stretch feedback only in B cells
and SMD (`npm run fit -- --proprio DB,VB,SMD`), from a hand probe where each B cell is excited
when its own side bends just ahead of it. That probe swims forward in water (1.0 Hz, wavelength
1.2 L) but does not crawl; in 60 generations the search found nothing that crawls on agar and
mostly nothing that moves at all, so the shipped fit is the A-cell one above. This is the first
model-level finding of the project: with the connectome, graded neurons and stretch feedback
alone, the gait targets are reachable but the viscosity curve is not. The head oscillator (D8),
which this fit does not yet have, is the next candidate. Note that V1c has now been looked at, so
any later fit that passes it is weaker evidence than a first look. Tools: `npm run viscosity --
<fit.json>` (V1c), `npm run rhythm` (V5); tests in `tests/science/gait.test.ts`, where V1c is
marked as a known failure.

### 9.2 Findings so far: M4 (touch and reversals; no fit shipped yet)

- **The M3b fit's strengths are implausible.** It scaled the motor circuit until AVA had about
  1,000 nS of resting input conductance (every chemical synapse half open, plus gap junctions).
  Real C. elegans neurons are around 1 nS (GΩ input resistance; Goodman et al. 1998 ≈); the
  unfitted wiring ranges 0.1–39 nS. So clamped, 200 pA into AVA moved it 0.15 mV. Fits now pay a
  penalty for any neuron above 39 nS (`conductanceCost` in `tools/fit/evaluate.ts`).
- **Hubs drown the touch pathway.** A head touch depolarises ALM and AVM by 12–19 mV, but with
  every synapse at the same default strength AVD moves 0.1 mV: its hundreds of other inputs
  outweigh the few from the touch cells. The touch and steer fits therefore scale each command
  interneuron's inputs from outside the circuit as a group (`COMMAND` in `tools/fit/space.ts`).
- **The fitted rhythm ignores the command cells.** In the M3b fit, driving AVA with 200 pA and
  holding AVB 17 mV down leaves the gait unchanged: the rhythm runs through A-cell stretch
  feedback (V5), so the forward/backward switch has nothing to act on. Real worms switch there:
  AVB drives forward through the B cells, AVA backward through the A cells.
- **Under the cap, steering and gait trade off.** A fit asking for forward crawling and swimming
  plus backing up while AVA is lit (optogenetics; Guo et al. 2009 ≈, Kawano et al. 2011 ≈) found,
  at best: backing up at 0.05 mm/s (target 0.08) and crawling forward again after the light, but
  crawling at only 0.2 Hz and 0.015 mm/s and swimming at 1.3 Hz. No generation in the next 100
  improved on that; later ones either steered or crawled, not both.
- **B-cell stretch alone makes no crawl (2026-10-12).** Redoing the gait the biological way
  (B cells read the bend ahead and drive forward; A cells read the bend behind and drive backward;
  the cap kept), a sweep of B stretch gain (−15 to 30 nS), field offset (0.05 to 0.4 body ahead) and
  length (0.05 to 0.3) found no crawl on agar anywhere, and only a weak swim in water (κL ≤ 1.3,
  target ≥ 3). A fit from the best point stayed flat. With graded neurons, a stretch reflex
  passes a bend backwards but nothing makes the bend in the first place. Published models that
  crawl this way add a rhythm source: bistable B motor neurons (Boyle, Berri & Cohen 2012 ≈) or
  oscillators in the head and along the cord (Fouad et al. 2018 ≈; Xu et al. 2018 ≈ for A cells).
  Our neuron model (section 4) has neither, so this needs a model change, not more fitting.
- **The real-way gait (2026-10-12), shipped in M4.** With B cells required to read at least 5% of
  the body ahead of them and A cells behind them, a gait-only fit and then a steering fit
  (`steer-bio-19`, now `src/data/fits/gait.json`) found a gait with every neuron under the
  input-conductance cap: crawling 0.51 Hz (λ 0.73, κL 2.0) and swimming 1.49 Hz (λ 1.22, κL 4.0).
  V1a and V1b miss narrowly (agar λ above 0.7 and κL below 3; water λ below 1.3) and are marked
  as known failures. **V1c (held out) now passes**: between water and agar, frequency falls
  1.49 → 0.51 Hz and wavelength 1.22 → 0.73 steadily (`npm run viscosity`), as Fang-Yen et al.
  2010 ≈ found.
- **Where its rhythm comes from (V5, `npm run rhythm`).** Switching off DB, VB or DA stretch
  stops the gait; VA and SMD stretch do not matter. Switching off every slow channel (section 4.5)
  changes almost nothing (0.49 Hz agar, 1.62 Hz water), so **the slow channel turned out not to be
  the missing rhythm source**: the B-only sweep failed for want of DA's stretch input (gain −3.4,
  reading 0.32 to 0.92 of a body length behind it), which the fit found once A cells were free to
  read behind them. B cells reading ahead now carry the forward wave, as Wen et al. 2012 ≈ found,
  but forward crawling still leans on an A cell (DA). In real worms A-cell ablation spares forward
  crawling (Chalfie et al. 1985 ≈), so this remains a divergence to check in the ablation tests.
- **Steering works.** Lighting AVA (2 nS) makes the worm back up at 0.026 to 0.091 mm/s in 5 of 8
  worms (target 0.08; Guo et al. 2009 ≈) and crawl forward again after the light. Whether it backs
  up depends on where in the stroke the light comes on; real worms back up almost every time.
  `npm run steer` and `tests/science/steer.test.ts` check it.
- **Touch still cannot reach AVA.** Touching the nose depolarises ALM and AVM by about 10 mV but AVD
  and AVA by under 1 mV, and anterior and posterior touches change the gait identically (by
  nothing). Fitting the signs of ambiguous synapses (section 3.2; AVD→AVA was left half way, so
  AVD could not excite AVA) and strengthening the ALM/AVM → AVD path by hand did not help. The cause
  is the model's resting state (section 4.2): every synapse is half open at rest, so AVD, AVA and
  AVB each sit on 17 to 50 nS of synapses from dozens of partners, and a receptor's input is a
  sliver of that. In the real worm most of those partners are quiet at rest. Fixing this means
  changing how release thresholds are set, a model change.
- **What works:** a tail touch speeds the worm up (0.04 → 0.12 mm/s, V2b) in the capped touch fit.
- **M4b: closing synapses at rest was not enough.** With every cell releasing 10% at rest (4.2),
  slow channels in the command cells (4.5) and each touch receptor output fitted on its own, four
  touch fits (touch-rest-24 to 27) never raised AVA by more than 1 mV after a nose touch; even ten
  times the touch current gave AVA +3 mV. The hops lose the signal: ALM +18 mV, AVD +5 mV, AVA +3 mV.
  Every cell on the path is tied by gap junctions to many partners (34 of AVA's 37 nS are gap
  junctions), so it sits near their average.
- **M4b: rectifying junctions did not fix it either.** With AVA–A junctions one way into AVA (Liu
  et al. 2017) and rectification fitted on 24 touch-path pairs (4.6), the best fit (touch-rect-28)
  backs up after a nose touch on the seed it was fitted on (−0.15 mm/s), with AVB down 5 mV but AVA
  still not up (−1.3 mV), even though the fit made the AVD–AVA junction pass current mainly into
AVA (ρ = −0.75). Over 8 seeds it
  reverses in 4, and posterior touches slow the worm about as often, so the response is not
  touch-specific. Ablations: killing ALM and AVM stops the reversals (0 of 8), killing AVD nearly
  (1 of 8), but killing AVA does not (3 of 8), so whatever backs the worm up does not go through
  AVA. **Not shipped**: the app keeps the M4a fit. Touch reversal (V2a, V2b across seeds, V4a,
  V2d) stays an open failure of this model. Likely causes to test next: the touch current (a 1 nS
  guess; ALM rises only ~6 mV), and the uniform 100 pS per gap section, which makes hubs average
  their partners; real AVA has 2.5 GΩ input resistance (Liu 2017), i.e. 0.4 nS in total.

### 9.3 Findings: transmission calibration (M4c)

- **The model is silent where the worm responds.** With the shipped weights the model shows 0% of
  the significant responses in the fitting half (unc-31 and wild type); 90% of pairs move under
  0.02 mV. In the atlas 6.7% of directly wired pairs respond significantly in unc-31 worms, and
  responses barely shrink with distance (median |ΔF/F| 0.30 at one hop, 0.23 at four).
- **Global settings switch between silence and flooding.** Raising the release slope (β 0.125 →
  0.5 /mV) with synapses mostly closed at rest makes signals travel, but then 50 to 90% of all pairs
  respond, more at four hops than at one: the network becomes globally excitable. No setting of
  the global gap, synapse, slope and resting-release values gave sparse, non-fading transmission.
- **Fitting each class pair does not generalise.** The linear-response fit lowers the training
  loss but not the validation loss (78.8 → 78.2, about what predicting no response at all gives),
  at any prior strength, and its validation hit rate stays at 2 to 5%.
- **The wiring itself predicts the atlas weakly.** Ranking pairs by direct synapse count separates
  responding from silent pairs with AUC 0.54 (unc-31) to 0.56 (wild type), and a two-hop path count
  0.57 to 0.65 (0.5 is chance). Randi et al. 2023 reached the same conclusion: anatomy is a poor
  predictor of signal propagation. The model's own responses score 0.49 to 0.54.
- **What this means:** the atlas can bound how far and how densely signals spread, but not which
  pathways carry them, so it cannot calibrate this model's transmission. The held-out half (V4b)
  has not been scored.

Honest expectations: V1 and V2 should pass. V3b and V4b are the hardest; V4b may come out only
modestly above baseline, and that would be a real finding about connectome-only models, reported
as such rather than tuned away.

---

## 10. What you see and do

**Plate view** (PixiJS): a top-down agar plate with the worm drawn as a translucent, tapering
body with its pharynx and gut outline; dorsal/ventral muscles tinted by calcium; the salt field as
a faint gradient. Zoom from the whole plate to a close-up where muscle cells are visible.

**Brain view**: the worm's outline in side view with every neuron at its real position, glowing
with its voltage (like a calcium-imaging video); click a neuron to see its trace, its inputs and
outputs, and the evidence label of each connection. A heat-map raster of all 302 cells over time,
grouped as in Kato 2015.

**Lab bench tools**:
- Eyelash: touch any body point. Probe: nose touch.
- Salt: place a salt spot; start a chemotaxis assay with the standard scoring zones.
- Medium: agar ↔ water ↔ viscosity slider.
- **Laser ablation**: kill any neuron (Chalfie-style), undo.
- **Optogenetics**: light-activate or silence any set of neurons (ChR2 / Arch-like current).
- Connectome switch: change fits from the ensemble, flip a `predicted` sign, or shuffle the wiring.
- Export: tracks and activity as CSV.

A sketch of the screen and the core circuit is posted in the thread.

---

## 11. Compute

Per 1 ms step: 397 cells, ≈ 7,000 chemical and ≈ 1,000 gap-junction terms, ≈ 1,400 neuromuscular
terms, a 49-node banded solve, and a coarse diffusion grid every 100 ms. About 10⁴ operations per
step, so ≈ 10⁷ per simulated second: real time costs a few percent of one core, and headless runs
go ≈ 50–100× real time. One fit (≈ 10⁴ evaluations of ≈ 3 minutes of worm time) is then hours on a
few worker threads, so an ensemble of 10 is an overnight job. The fitted parameters ship with the
app; the browser never fits.

---

## 12. Architecture and milestones

Same skeleton as formicarium: `src/sim/` pure and deterministic (seeded RNG, no real time, state
hash), `src/worker/` runs it, `src/render/` PixiJS reads snapshots only, `tools/` headless runner,
data conversion and fitting, `tests/science/` for section 9. Same CI, lint rules and GitHub Pages
deploy. One milestone per pull request.

What carries over from spikingbrain's design: resistive force theory, the determinism harness and
the worker setup. Its body code does not (D9), and that repo is not changed.

- **M0 Skeleton.** Repo, build, tests, lint, CI, Pages, RNG, state hash, headless runner.
- **M1 Connectome and neurons** (two pull requests: wiring, graded neurons and the brain view first; the
  conductance-based cells of 4.3 second). Data pipeline and licences; counts checked (302 neurons,
  95 muscles, totals against Cook 2019 and Varshney 2011); sign labels; graded and spiking cell
  models with step-size tests. *Visible:* brain view; inject current into any cell and watch it
  spread through the real wiring.
- **M2 Body and media.** Overdamped rod, RFT, agar/water/slider, muscles as actuators. Tests:
  analytic RFT speed for a prescribed travelling wave (Gray & Hancock), passive body relaxes and
  never gains energy, a reciprocal flap goes nowhere (scallop theorem). *Visible:* a puppet worm
  driven by a prescribed wave, crawling and swimming. *Done:* see the as-built notes in 6.2–6.4.
- **M3 Locomotion.** Motor circuit wired to the body, proprioception, both rhythm mechanisms,
  first fits. V1a–c, V5. *Visible:* the worm crawls and swims on its own brain. Two pull requests:
  M3a wires muscles and proprioception (done; see 4.4 and 6.4) and adds the fit machinery: a fit is
  plain JSON of class-pair strengths, tonic conductances per class (changed from currents in M3b,
  see 4.4) and proprioceptive fields
  (`src/sim/fit.ts`); `npm run fit` runs separable CMA-ES over the motor circuit (127 numbers)
  scored on V1a and V1b only; gait is measured from body curvature (`src/sim/gait.ts`). M3b
  (done) fits the strengths, makes the fit the app's default brain (the worm crawls and swims on
  its own; the puppet is now opt-in) and reports V1 and V5 in 9.1: V1a and V1b pass, V1c fails.
  The head oscillator and intrinsic A-cell oscillation (D8) are not built yet; the A-cell model
  needs the papers M1b is waiting for.
- **M4 Touch and reversals.** Touch receptors, nose touch, command switch, omega turns, spontaneous
  reversals. V2a–e, V4a. Ablation and optogenetics tools. Split in two after the findings in 9.2.
  **M4a** (done): touch receptors and click-to-touch, laser ablation, light channels, the
  input-conductance cap, the slow channel (4.5), fitted signs of ambiguous synapses (3.2), and a
  refitted gait in which B cells read ahead and AVA light makes the worm back up; V1c passes,
  V1a and V1b miss narrowly, touch does not yet reach AVA. **M4b** (done, touch not solved):
  resting release (4.2), slow channels for command cells, rectifying gap junctions (4.6). Touch
  still does not reach AVA (9.2), so V2a–e and V4a remain open; the app keeps the M4a fit.
- **M4c Transmission calibration** (done, did not succeed): Randi 2023 atlas data, its fit/held-out
  split, the atlas experiment in the model and a linear-response fit (7.4). The atlas cannot
  calibrate this model's transmission (9.3).
- **M5 Salt chemotaxis.** Salt field, ASE, full fitting ensemble. V3a–c, V4b. **Started, then
  paused with the project (2026-10-13):** the salt field (8.3), ASEL/ASER sensing with adaptation
  and the salt steering check (`npm run chemotaxis`) are built; salt does not steer the worm,
  because sensory signals fade within two hops (9.2, 9.3).
- **Project paused (2026-10-13), by Marco's choice.** The worm crawls and swims under its own
  rhythm, and backs up when AVA is lit. Touch reversal, salt chemotaxis and the atlas remain open;
  all three fail for one reason: wiring plus uniform rules does not reproduce the worm's signalling.
  Restarting would need a model change that makes transmission sparse but non-fading without
  fitting pathways by hand (for example per-cell excitability from CeNGEN expression).
- **M6 Lab bench polish.** Evidence-label browser, ensemble switcher, CSV export, assay presets.

## 13. Later

1. Neuropeptide and monoamine layer (Ripoll-Sánchez 2023; Bentley et al. 2016), which should raise
   V4b.
2. Food and the roaming/dwelling states (serotonin, PDF; Flavell et al. 2013).
3. Salt learning: worms starved on salt learn to avoid it (Saeki et al. 2001), so plasticity.
4. Individual brains from Witvliet 2021; males (Cook 2019 has their connectome too).
5. Thermotaxis, odour chemotaxis, pharyngeal pumping, 3D head movement.

## 14. References

- Bargmann & Horvitz 1991, *Neuron* 7: chemosensory neurons for chemotaxis.
- Bentley et al. 2016, *PLoS Comput Biol*: the multilayer (monoamine/peptide) connectome.
- Berri, Boyle, Tassieri, Hope & Cohen 2009, *HFSP J*: single gait modulated by the environment.
- Boyle, Berri & Cohen 2012, *Front Comput Neurosci*: integrated neuromechanical locomotion model.
- Chalfie et al. 1985, *J Neurosci*: the touch circuit, by laser ablation.
- Cook et al. 2019, *Nature*: whole-animal connectomes of both sexes.
- Fang-Yen et al. 2010, *PNAS*: biomechanics of gait adaptation.
- Fenyves et al. 2020, *PLoS Comput Biol*: synaptic polarity of the connectome.
- Fouad et al. 2018, *eLife*: distributed rhythm generators.
- Gao & Zhen 2011, *PNAS*: action potentials in body-wall muscle.
- Goodman, Hall, Avery & Lockery 1998, *Neuron*: graded potentials in *C. elegans* neurons.
- Gray & Hancock 1955, *J Exp Biol*: propulsion of sea-urchin spermatozoa (resistive force theory).
- Gray, Hill & Bargmann 2005, *PNAS*: local search and turning circuits.
- Iino & Yoshida 2009, *J Neurosci*: klinotaxis (weathervaning) to salt.
- Jiang et al. 2022, *PNAS*: AVL and DVB fire action potentials.
- Kaplan & Horvitz 1993, *PNAS*: nose touch.
- Kato et al. 2015, *Cell*: whole-brain activity and the global motor state.
- Kawano et al. 2011, *Neuron*: AVA/AVB imbalance controls direction.
- Kunert, Shlizerman & Kutz 2014, *PLoS Comput Biol*: dynamics of the full connectome.
- Liu et al. 2018, *Cell*: AWA action potentials.
- Mellem et al. 2008, *Nat Neurosci*: RMD plateau potentials.
- Naudin et al. 2022, *PLoS ONE*: conductance-based models of RMD, AWA, AIY.
- Pierce-Shimomura, Morse & Lockery 1999, *J Neurosci*: pirouette strategy.
- Prinz, Bucher & Marder 2004, *Nat Neurosci*: similar circuit behaviour from different parameters.
- Randi, Sharma, Dvali & Leifer 2023, *Nature*: neural signal propagation atlas.
- Ripoll-Sánchez et al. 2023, *Neuron*: the neuropeptidergic connectome.
- Suzuki et al. 2008, *Nature*: ASEL/ASER ON and OFF responses.
- Varshney et al. 2011, *PLoS Comput Biol*: structural properties of the neuronal network.
- Wen et al. 2012, *Neuron*: proprioceptive coupling in the motor circuit.
- White, Southgate, Thomson & Brenner 1986, *Phil Trans R Soc B*: the original connectome.
- Wicks, Roehrig & Rankin 1996, *J Neurosci*: graded-potential model of the tap circuit.
- Wicks & Rankin 1995, *J Neurosci*: tap-withdrawal circuit ablations.
- Witvliet et al. 2021, *Nature*: connectomes across development.
- Xu et al. 2018, *PNAS*: A motor neurons as intrinsic oscillators.
- Yemini et al. 2021, *Cell*: NeuroPAL atlas of neuron identities and positions.
