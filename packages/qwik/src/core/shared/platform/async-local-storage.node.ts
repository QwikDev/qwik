import { AsyncLocalStorage } from 'node:async_hooks';

export const getAsyncLocalStorage = () => AsyncLocalStorage;
