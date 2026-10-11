# celegans: conventions for Claude Code

A cell-by-cell *C. elegans*: 302 neurons and 95 body-wall muscles wired from the measured
connectome, driving an overdamped 2D body on agar or in water, validated against published
experiments. **DESIGN.md is the approved design**; read the relevant section before changing a
model, and update DESIGN.md in the same pull request when a model changes.

## Commands

- `npm run dev`: run in the browser (`?seed=N` picks the plate)
- `npm test`: Vitest
- `npm run typecheck`, `npm run lint`: must pass before every push
- `npm run sim -- --seed 42 --seconds 10`: headless run in Node, prints a summary and state hash
- `npm run build`: production build (deployed to GitHub Pages from `main`)

## Layout

- `src/sim/`: the simulation (body, plate, later neurons, muscles, connectome), seeded RNG, state hash. Pure and deterministic.
- `src/worker/`: runs the simulation in a Web Worker and posts snapshots.
- `src/render/`: PixiJS drawing. Reads snapshots only; never changes simulation state.
- `src/main.ts`, `index.html`: the page.
- `tools/`: Node runners (headless run; later data conversion and fitting). `tests/`: Vitest; validation experiments (DESIGN.md section 9) go in `tests/science/`.

## Rules

1. **Deterministic.** Same seed and same player actions give the same state hash.
   - Randomness only from `Rng` (`src/sim/rng.ts`), seeded from a tuple such as `(seed, Purpose.x)`.
   - No real time in `src/sim/`: no `Date`, `performance.now`, timers. Time is counted in steps (1 step = 1 ms).
   - Iterate in data order or sorted by id; never key a `Map`/`Set` by object identity.
   - Lint enforces this for `src/sim/`.
2. **No browser code in `src/sim/`.** It runs in the worker, in Node and in tests.
3. **World state is plain data**: numbers, strings, arrays, plain objects, `Map`s, typed arrays.
   It must save, hash (`hashState`) and copy.
4. **Biology comes from data and papers, never from scripts.** No behaviour is coded directly;
   it must come out of cells, wiring and physics. Every constant from a paper cites it in a comment;
   numbers marked ≈ in DESIGN.md are checked against the paper before a test depends on them.
5. **Label every guess.** Each connection's sign and strength carry their evidence label
   (DESIGN.md section 3.2). Fitted values are never presented as measured.
6. **Held-out experiments stay held out.** Experiments marked H in DESIGN.md section 9 are never
   used in a fit's cost function.
7. **Units:** µm, ms (steps), mV. **Science first:** every rule gets a test; a feature is done when
   its validation experiment passes. If one cannot pass with plausible parameters, stop and report.
8. **Saved enums are append-only** (`Medium` and later ones): never reorder or reuse a value.
9. **One milestone per pull request** (or a few small ones). Marco merges.
