/**
 * Starts the page: PixiJS views of the plate and of the brain, fed by the
 * simulation worker. URL options: ?seed=N picks the plate (default 1);
 * ?stim=AVML,PLML starts with those neurons stimulated (the first selected;
 * a class name such as VD stimulates the whole class);
 * ?view=brain opens the brain view; ?medium=0..1 sets water (0) to agar (1);
 * ?puppet=1 starts with the puppet drive on (by default the fitted brain drives the body).
 */
import { Application } from 'pixi.js';
import { BrainView } from './render/brainView';
import { Camera } from './render/camera';
import { PlateView, wormBounds } from './render/plateView';
import { NEURON_COUNT, connectome } from './sim/connectome';
import { formatWormTime } from './sim/time';
import type { FromWorker, ToWorker } from './worker/protocol';

type Mode = 'plate' | 'brain';

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const status = document.getElementById('status')!;
  const hud = document.getElementById('hud')!;
  const info = document.getElementById('info')!;
  const params = new URLSearchParams(location.search);
  const seed = parseSeed(params.get('seed'));

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const plate = new PlateView();
  const brain = new BrainView();
  const scene = { plate: plate.root, brain: brain.root };
  app.stage.addChild(plate.root, brain.root);
  const cameras = { plate: new Camera(plate.root, stage), brain: new Camera(brain.root, stage) };
  const top = () => hud.getBoundingClientRect().bottom;

  let mode: Mode = params.get('view') === 'brain' ? 'brain' : 'plate';
  let follow = true;
  let radius = 0;
  let speed = 0;
  let lastCentre: { x: number; y: number; step: number } | undefined;
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
    document.getElementById('plate-bench')!.hidden = m !== 'plate';
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
  const stimClass = document.getElementById('stim-class') as HTMLButtonElement;
  stimClass.addEventListener('click', () => {
    if (brain.selected < 0 || !last) return;
    const members = classMembers(connectome.cells[brain.selected]!.class);
    const on = members.every((i) => last!.inject[i] !== 0);
    for (const i of members) send({ type: 'inject', neuron: i, pA: on ? 0 : Number(amp.value) });
  });

  // Lab bench, plate side: the puppet drive, the medium and the camera.
  const puppet = document.getElementById('puppet') as HTMLButtonElement;
  const medium = document.getElementById('medium') as HTMLInputElement;
  const mediumLabel = document.getElementById('medium-label')!;
  const followButton = document.getElementById('follow') as HTMLButtonElement;
  const showMedium = () => {
    const m = Number(medium.value) / 100;
    mediumLabel.textContent = m === 0 || m === 1 ? '' : `(${Math.round(m * 100)}%)`;
  };
  const startMix = Number(params.get('medium') ?? '1');
  medium.value = String(Math.round(100 * (Number.isFinite(startMix) ? Math.min(1, Math.max(0, startMix)) : 1)));
  showMedium();
  medium.addEventListener('input', () => {
    showMedium();
    send({ type: 'medium', mix: Number(medium.value) / 100 });
  });
  puppet.addEventListener('click', () => send({ type: 'puppet', on: !(last?.puppet ?? false) }));
  followButton.addEventListener('click', () => {
    follow = !follow;
    followButton.setAttribute('aria-pressed', String(follow));
  });

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
    stimClass.disabled = s < 0;
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
    const members = classMembers(c.class);
    stimClass.textContent = `${members.every((i) => last!.inject[i] !== 0) ? 'Stop' : 'Stimulate'} all ${c.class} (${members.length})`;
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'plate') {
      radius = msg.radius;
      rest = msg.rest;
    } else if (msg.type === 'tick') {
      last = msg;
      plate.setPlate(radius, msg.mix);
      plate.setWorm(msg.x, msg.y, msg.muscles);
      const c = centre(msg.x, msg.y);
      if (lastCentre && msg.step > lastCentre.step) {
        // µm per ms is mm per s; smoothed over about a second of worm time.
        const v = Math.hypot(c.x - lastCentre.x, c.y - lastCentre.y) / (msg.step - lastCentre.step);
        const k = Math.min(1, (msg.step - lastCentre.step) / 1000);
        speed += (v - speed) * k;
      }
      lastCentre = { ...c, step: msg.step };
      if (follow && mode === 'plate' && framed) cameras.plate.centreOn(c.x, c.y, top());
      puppet.textContent = msg.puppet ? 'Stop puppet' : 'Start puppet';
      status.textContent = `Plate ${seed} · worm time ${formatWormTime(msg.step)} · ${speed.toFixed(2)} mm/s`;
      render();
      if (!framed) {
        framed = true;
        setMode(mode);
      }
    }
  };
  send({ type: 'start', seed });
  send({ type: 'medium', mix: Number(medium.value) / 100 });
  if (params.get('puppet') === '1') send({ type: 'puppet', on: true });
  const stimNames = (params.get('stim') ?? '').split(',').filter(Boolean);
  for (const raw of stimNames) {
    const name = raw.trim().toUpperCase();
    // A cell name, or else a whole class; unknown names are ignored.
    const cells = connectome.cells.slice(0, NEURON_COUNT).flatMap((c, i) => (c.name === name ? [i] : []));
    const members = cells.length ? cells : classMembers(name);
    for (const i of members) {
      send({ type: 'inject', neuron: i, pA: Number(amp.value) });
      if (brain.selected < 0) brain.selected = i;
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

/** The neurons of an anatomical class, e.g. all 13 VD cells. */
function classMembers(cls: string): number[] {
  return connectome.cells.slice(0, NEURON_COUNT).flatMap((c, i) => (c.class === cls ? [i] : []));
}

function centre(x: Float64Array, y: Float64Array): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < x.length; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  return { x: sx / x.length, y: sy / y.length };
}

function parseSeed(raw: string | null): number {
  const n = Number(raw);
  return raw !== null && Number.isInteger(n) && n >= 0 ? n : 1;
}

void start();
