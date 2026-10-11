/**
 * Starts the page: a PixiJS view of the plate, fed by the simulation worker.
 * URL options: ?seed=N picks the plate (default 1).
 */
import { Application } from 'pixi.js';
import { Camera } from './render/camera';
import { PlateView, wormBounds } from './render/plateView';
import { formatWormTime } from './sim/time';
import type { FromWorker, ToWorker } from './worker/protocol';

async function start(): Promise<void> {
  const stage = document.getElementById('stage')!;
  const status = document.getElementById('status')!;
  const hud = document.getElementById('hud')!;
  const seed = parseSeed(new URLSearchParams(location.search).get('seed'));

  const app = new Application();
  await app.init({ resizeTo: stage, background: 0x111317, antialias: true, autoDensity: true, resolution: devicePixelRatio });
  stage.appendChild(app.canvas);

  const view = new PlateView();
  app.stage.addChild(view.root);
  const camera = new Camera(view.root, stage);
  const top = () => hud.getBoundingClientRect().bottom;

  let last: { x: Float64Array; y: Float64Array } | undefined;
  let framed = false;
  const findWorm = () => last && camera.fit(wormBounds(last.x, last.y), top());
  document.getElementById('worm')!.addEventListener('click', findWorm);
  document.getElementById('plate')!.addEventListener('click', () => camera.fit(view.bounds, top()));

  const worker = new Worker(new URL('./worker/sim.worker.ts', import.meta.url), { type: 'module' });
  const send = (msg: ToWorker) => worker.postMessage(msg);
  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    if (msg.type === 'plate') view.setPlate(msg.radius, msg.medium);
    else if (msg.type === 'tick') {
      last = { x: msg.x, y: msg.y };
      view.setWorm(msg.x, msg.y);
      status.textContent = `Plate ${seed} · worm time ${formatWormTime(msg.step)}`;
      if (!framed) {
        framed = true;
        findWorm();
      }
    }
  };
  send({ type: 'start', seed });

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
