export type Store<T extends object> = T;

export function createStore<T extends object>(value: T): Store<T> {
  return value;
}
