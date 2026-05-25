import type { AsyncLocalStorage } from 'node:async_hooks';

type ProcessWithBuiltins = {
  getBuiltinModule?: (id: string) => unknown;
};

/** @internal */
export const getAsyncLocalStorage = () => {
  const process = (globalThis as { process?: ProcessWithBuiltins }).process;
  return (
    process?.getBuiltinModule?.('node:async_hooks') as
      | { AsyncLocalStorage?: new <T>() => AsyncLocalStorage<T> }
      | undefined
  )?.AsyncLocalStorage;
};
