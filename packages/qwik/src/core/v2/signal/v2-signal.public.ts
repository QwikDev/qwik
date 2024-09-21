import { implicit$FirstArg } from '../../util/implicit_dollar';
import type { QRL } from '../../qrl/qrl.public';
import {
  createSignal as _createSignal,
  createComputedSignal as _createComputedSignal,
} from './v2-signal';

export { isSignal as isSignal } from './v2-signal';

export type { Effect } from './v2-signal';

/** @public */
export interface ReadonlySignal<T> {
  readonly untrackedValue: T;
  readonly value: T;
}

/** @public */
export interface Signal<T> extends ReadonlySignal<T> {
  untrackedValue: T;
  value: T;
}

/** @public */
export interface ComputedSignal<T> extends ReadonlySignal<T> {
  /**
   * Use this to force recalculation and running subscribers, for example when the calculated value
   * mutates but remains the same object. Useful for third-party libraries.
   */
  force(): void;
}

/** @public */
export const createSignal: {
  <T>(): Signal<T | undefined>;
  <T>(value: T): Signal<T>;
} = _createSignal;

/** @public */
export const createComputedQrl: <T>(qrl: QRL<() => T>) => ComputedSignal<T> = _createComputedSignal;

/** @public */
export const createComputed$ = /*#__PURE__*/ implicit$FirstArg(createComputedQrl);
