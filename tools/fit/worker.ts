/** Fit worker: scores parameter vectors sent by tools/fit.ts. */
import { parentPort } from 'node:worker_threads';
import { score, scoreSteer, scoreTouch } from './evaluate';
import { buildSpace, toFit, type Task } from './space';

let space = buildSpace();
parentPort!.on('message', (msg: { id: number; x: number[]; seed: number; proprio: string[]; task: Task }) => {
  try {
    if (space.proprio.join() !== msg.proprio.join() || space.task !== msg.task) space = buildSpace(msg.proprio, msg.task);
    const fit = toFit(space, msg.x, 'candidate');
    const s = msg.task === 'touch' ? scoreTouch(fit, msg.seed) : msg.task === 'steer' ? scoreSteer(fit, msg.seed) : score(fit, msg.seed);
    parentPort!.postMessage({ id: msg.id, ...s });
  } catch (e) {
    parentPort!.postMessage({ id: msg.id, cost: 1000, error: String(e) });
  }
});
