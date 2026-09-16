import { Signal } from './signal';
import { untrack } from './tracking';

/** @public */
export function useConstant<T, A extends unknown[]>(value: T | ((...args: A) => T), ...args: A): T {
  return typeof value === 'function' ? untrack(value as (...args: A) => T, ...args) : (value as T);
}

/** @public */
export function useSignal<T>(): Signal<T | undefined>;
/** @public */
export function useSignal<T>(value: T): Signal<T>;
export function useSignal<T>(value?: T): Signal<T | undefined> {
  return new Signal(value);
}
