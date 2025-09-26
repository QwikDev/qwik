import { isServer } from '@qwik.dev/core';
import type { RequestEventInternal } from './request-event';
import type { AsyncLocalStorage } from 'node:async_hooks';

export type AsyncStore = AsyncLocalStorage<RequestEventInternal>;

if (isServer) {
  import('node:async_hooks')
    .then((module) => {
      const AsyncLocalStorage = module.AsyncLocalStorage;
      asyncRequestStore = new AsyncLocalStorage<RequestEventInternal>();
    })
    .catch((err) => {
      console.warn(
        'AsyncLocalStorage not available, continuing without it. This might impact concurrent server calls.',
        err
      );
    });
}

// Qwik Core will also be using the async store if this is present
export let asyncRequestStore: AsyncStore | undefined = undefined;
