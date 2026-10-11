/**
 * Runs the simulation off the page's thread and sends snapshots to the renderer.
 * The simulation itself never sees real time; this loop decides how many
 * steps to run per real interval.
 */
import { STEPS_PER_SECOND } from '../sim/time';
import { appBrain } from '../sim/fits';
import { createWorld, setInjection, setMedium, setPuppet, step, type World } from '../sim/world';
import type { FromWorker, ToWorker } from './protocol';

const INTERVAL_MS = 50;

let world: World | undefined;
let speed = 1;
let owed = 0;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  postMessage(msg, transfer);
}

function sendTick(w: World): void {
  const x = w.body.x.slice();
  const y = w.body.y.slice();
  const v = Float32Array.from(w.neurons.v);
  const inject = Float32Array.from(w.neurons.inject);
  const muscles = Float32Array.from(w.muscles);
  post({ type: 'tick', step: w.step, x, y, v, inject, muscles, mix: w.mix, puppet: w.puppet.on }, [
    x.buffer,
    y.buffer,
    v.buffer,
    inject.buffer,
    muscles.buffer,
  ]);
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'start') {
    world = createWorld(msg.seed, appBrain());
    owed = 0;
    post({ type: 'plate', radius: world.plateRadius, medium: world.medium, rest: world.neurons.v.slice() });
    sendTick(world);
  } else if (msg.type === 'speed') {
    speed = msg.value;
  } else if (world && msg.type === 'inject') {
    setInjection(world, msg.neuron, msg.pA);
    sendTick(world);
  } else if (world && msg.type === 'clear-injections') {
    world.neurons.inject.fill(0);
    sendTick(world);
  } else if (world && msg.type === 'medium') {
    setMedium(world, msg.mix);
    sendTick(world);
  } else if (world && msg.type === 'puppet') {
    setPuppet(world, msg.on);
    sendTick(world);
  }
};

setInterval(() => {
  if (!world || speed <= 0) return;
  owed += (speed * STEPS_PER_SECOND * INTERVAL_MS) / 1000;
  while (owed >= 1) {
    step(world, appBrain());
    owed -= 1;
  }
  sendTick(world);
}, INTERVAL_MS);
