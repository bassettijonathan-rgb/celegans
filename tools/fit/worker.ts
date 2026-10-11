/** Fit worker: scores parameter vectors sent by tools/fit.ts. */
import { parentPort } from 'node:worker_threads';
import { score } from './evaluate';
import { buildSpace, toFit } from './space';

let space = buildSpace();
parentPort!.on('message', (msg: { id: number; x: number[]; seed: number; proprio: string[] }) => {
  try {
    if (space.proprio.join() !== msg.proprio.join()) space = buildSpace(msg.proprio);
    const s = score(toFit(space, msg.x, 'candidate'), msg.seed);
    parentPort!.postMessage({ id: msg.id, ...s });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, cost: 1000, error: String(e) });
  }
});
