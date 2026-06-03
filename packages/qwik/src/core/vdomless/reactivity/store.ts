export type Store<T extends object> = T;

export interface StoreOptions {
  deep?: boolean;
}

export function createStore<T extends object>(value: T, _options?: StoreOptions): Store<T> {
  return value;
}
