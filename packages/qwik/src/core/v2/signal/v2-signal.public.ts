import { implicit$FirstArg } from '../../util/implicit_dollar';
import type { QRL } from '../../qrl/qrl.public';
import {
  createSignal as _createSignal,
  createComputedSignal as _createComputedSignal,
} from './v2-signal-api';

export { isSignal } from './v2-signal';

export type { Effect } from './v2-signal';

/** @public */
export interface ReadonlySignal<T = unknown> {
  readonly value: T;
}

/**
 * A signal is a reactive value which can be read and written. When the signal is written, all tasks
 * which are tracking the signal will be re-run and all components that read the signal will be
 * re-rendered.
 *
 * Furthermore, when a signal value is passed as a prop to a component, the optimizer will
 * automatically forward the signal. This means that `return <div title={signal.value}>hi</div>`
 * will update the `title` attribute when the signal changes without having to re-render the
 * component.
 *
 * @public
 */
export interface Signal<T = any> extends ReadonlySignal<T> {
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
