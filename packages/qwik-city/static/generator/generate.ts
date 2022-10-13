import type { System } from './types';
import { mainThread } from './main-thread';
import { workerThread } from './worker-thread';

// @builder.io/qwik-city/static/node

/**
 * @alpha
 */
export async function staticGenerate(sys: System) {
  if (sys.isMainThread()) {
    await mainThread(sys);
  } else {
    await workerThread(sys);
  }
}
