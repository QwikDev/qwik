/* eslint-disable no-console */
import type { Render } from '@builder.io/qwik/server';
import type { System } from './types';
import { mainThread } from './main-thread';
import { workerThread } from './worker-thread';

// @builder.io/qwik-city/static/node

/**
 * @alpha
 */
export async function staticGenerate(sys: System, render: Render) {
  if (sys.isMainThread()) {
    await mainThread(sys);
  } else {
    await workerThread(sys, render);
  }
}
