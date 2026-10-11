/**
 * Starts the page: PixiJS views of the plate and of the brain, fed by the
 * simulation worker. URL options: ?seed=N picks the plate (default 1);
 * ?stim=AVML,PLML starts with those neurons stimulated (the first selected).
 */
import { Application } from 'pixi.js';
import { BrainView } from './render/brainView';
import { Camera } from './render/camera';
import { PlateView, wormBounds } from './render/plateView';
import { NEURON_COUNT, cellIndex, connectome } from './sim/connectome';
import { formatWormTime } from './sim/time';
import type { FromWorker, ToWorker } from './worker/protocol';

type Mode = 'plate' | 'brain';

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const status = document.getElementById('status')!;
  const hud = document.getElementById('hud')!;
  const info = document.getElementById('info')!;
  const seed = parseSeed(new URLSearchParams(location.search).get('seed'));

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const plate = new PlateView();
  const brain = new BrainView();
  const scene = { plate: plate.root, brain: brain.root };
  app.stage.addChild(plate.root, brain.root);
  const cameras = { plate: new Camera(plate.root, stage), brain: new Camera(brain.root, stage) };
  const top = () => hud.getBoundingClientRect().bottom;

  let mode: Mode = 'brain';
  let last: Extract<FromWorker, { type: 'tick' }> | undefined;
  let rest: Float64Array | undefined;
  let framed = false;

  const findWorm = () => last && cameras.plate.fit(wormBounds(last.x, last.y), top());
  const setMode = (m: Mode) => {
    mode = m;
    for (const k of ['plate', 'brain'] as const) {
      scene[k].visible = k === m;
      cameras[k].enabled = k === m;
      document.getElementById(`mode-${k}`)!.setAttribute('aria-pressed', String(k === m));
    }
    document.getElementById('bench')!.hidden = m !== 'brain';
    if (m === 'brain') cameras.brain.fit(brain.bounds, top());
    else findWorm();
  };
  document.getElementById('mode-plate')!.addEventListener('click', () => setMode('plate'));
  document.getElementById('mode-brain')!.addEventListener('click', () => setMode('brain'));

  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker) => worker.postMessage(msg);

  // Lab bench: pick a neuron, then hold a current in it.
  const amp = document.getElementById('amp') as HTMLInputElement;
  const ampLabel = document.getElementById('amp-label')!;
  const stim = document.getElementById('stim') as HTMLButtonElement;
  const showAmp = () => (ampLabel.textContent = `${amp.value} pA`);
  showAmp();
  amp.addEventListener('input', () => {
    showAmp();
    if (brain.selected >= 0 && last && last.inject[brain.selected] !== 0) {
      send({ type: 'inject', neuron: brain.selected, pA: Number(amp.value) });
    }
  });
  stim.addEventListener('click', () => {
    if (brain.selected < 0 || !last) return;
    const on = last.inject[brain.selected] !== 0;
    send({ type: 'inject', neuron: brain.selected, pA: on ? 0 : Number(amp.value) });
  });
  document.getElementById('clear')!.addEventListener('click', () => send({ type: 'clear-injections' }));

  // A click (not a drag) on the brain picks the nearest neuron.
  let down: { x: number; y: number } | undefined;
  stage.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  stage.addEventListener('pointerup', (e) => {
    if (mode !== 'brain' || !down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
    const rect = stage.getBoundingClientRect();
    const p = brain.root.toLocal({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    brain.selected = brain.pick(p.x, p.y);
    brain.drawLinks();
    render();
  });

  const render = () => {
    if (!last || !rest) return;
    brain.update(last.v, rest, last.inject);
    const s = brain.selected;
    stim.disabled = s < 0;
    if (s < 0) {
      info.innerHTML = 'Click a neuron to see it and its connections.';
      stim.textContent = 'Stimulate';
      return;
    }
    const c = connectome.cells[s]!;
    const ins = connectome.chemical.filter((e) => e.post === s);
    const outs = connectome.chemical.filter((e) => e.pre === s && e.post < NEURON_COUNT);
    const nmj = connectome.chemical.filter((e) => e.pre === s && e.post >= NEURON_COUNT).length;
    const gaps = connectome.gap.filter((e) => e.a === s || e.b === s).length;
    const count = (list: typeof ins, label: string) => list.filter((e) => e.label === label).length;
    const dv = last.v[s]! - rest[s]!;
    info.innerHTML =
      `<b>${c.name}</b> · class ${c.class} · ${c.group}${c.nt?.length ? ` · ${c.nt.join(', ')}` : ''}<br>` +
      `V ${last.v[s]!.toFixed(1)} mV (${dv >= 0 ? '+' : ''}${dv.toFixed(2)} from rest)<br>` +
      `In: ${ins.length} synapses (${count(ins, 'predicted')} sign predicted, ${count(ins, 'ambiguous')} unknown) · ` +
      `out: ${outs.length}${nmj ? ` + ${nmj} onto muscle` : ''} · ${gaps} gap junctions`;
    stim.textContent = last.inject[s] !== 0 ? 'Stop stimulating' : 'Stimulate';
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'plate') {
      plate.setPlate(msg.radius, msg.medium);
      rest = msg.rest;
    } else if (msg.type === 'tick') {
      last = msg;
      plate.setWorm(msg.x, msg.y);
      status.textContent = `Plate ${seed} · worm time ${formatWormTime(msg.step)}`;
      render();
      if (!framed) {
        framed = true;
        setMode(mode);
      }
    }
  };
  send({ type: 'start', seed });
  const stimNames = (new URLSearchParams(location.search).get('stim') ?? '').split(',').filter(Boolean);
  for (const name of stimNames) {
    try {
      const i = cellIndex(name.trim().toUpperCase());
      if (i >= NEURON_COUNT) continue;
      send({ type: 'inject', neuron: i, pA: Number(amp.value) });
      if (brain.selected < 0) brain.selected = i;
    } catch {
      // Unknown names in the URL are ignored.
    }
  }
  brain.drawLinks();

  document.getElementById('worm')!.addEventListener('click', () => (mode === 'plate' ? findWorm() : cameras.brain.fit(brain.bounds, top())));
  const speedButtons = [...document.querySelectorAll<HTMLButtonElement>('button[data-speed]')];
  for (const button of speedButtons) {
    button.addEventListener('click', () => {
      send({ type: 'speed', value: Number(button.dataset.speed) });
      for (const b of speedButtons) b.setAttribute('aria-pressed', String(b === button));
    });
  }
}

function parseSeed(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : 1;
}

void start();
