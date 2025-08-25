import type { RequestEventInternal } from './request-event';
import type { AsyncLocalStorage } from 'node:async_hooks';

export type AsyncStore = AsyncLocalStorage<RequestEventInternal>;

// Qwik Core will also be using the async store if this is present
export let asyncRequestStore: AsyncStore | undefined;

export const setAsyncRequestStore = (store: AsyncStore | undefined) => {
  asyncRequestStore = store;
};
