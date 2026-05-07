import { target } from './shared';

type GlobalStore = Record<string, unknown>;

const globalStore = target as unknown as GlobalStore;

export function createGlobalAccessor<T>(key: string) {
  return {
    get: () => globalStore[key] as T,
    set: (value: T) => {
      globalStore[key] = value;
    },
  };
}
