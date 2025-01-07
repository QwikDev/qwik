import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { SerializerSymbol } from '../shared/utils/serialize-utils';
import type { CustomSerializable } from './signal';
import {
  createSignal as _createSignal,
  createComputedSignal as createComputedQrl,
  createSerializedSignal as createSerializedQrl,
} from './signal-api';

export { isSignal } from './signal';

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

/**
 * A computed signal is a signal which is calculated from other signals. When the signals change,
 * the computed signal is recalculated, and if the result changed, all tasks which are tracking the
 * signal will be re-run and all components that read the signal will be re-rendered.
 *
 * @public
 */
export interface ComputedSignal<T> extends ReadonlySignal<T> {
  /**
   * Use this to force recalculation and running subscribers, for example when the calculated value
   * mutates but remains the same object. Useful for third-party libraries.
   */
  force(): void;
}

/**
 * A serialized signal holds a custom serializable value. See `useSerialized$` for more details.
 *
 * @public
 */
export interface SerializedSignal<T> extends ComputedSignal<T> {}

/**
 * Creates a Signal with the given value. If no value is given, the signal is created with
 * `undefined`.
 *
 * @public
 */
export const createSignal: {
  <T>(): Signal<T | undefined>;
  <T>(value: T): Signal<T>;
} = _createSignal;

/**
 * Create a computed signal which is calculated from the given QRL. A computed signal is a signal
 * which is calculated from other signals. When the signals change, the computed signal is
 * recalculated.
 *
 * The QRL must be a function which returns the value of the signal. The function must not have side
 * effects, and it must be synchronous.
 *
 * If you need the function to be async, use `useSignal` and `useTask$` instead.
 *
 * @public
 */
export const createComputed$: <T>(
  qrl: () => T
) => T extends Promise<any> ? never : ComputedSignal<T> = /*#__PURE__*/ implicit$FirstArg(
  createComputedQrl as any
);
export { createComputedQrl };

/**
 * Create a signal that holds a custom serializable value. See {@link useSerialized$} for more
 * details.
 *
 * @public
 */
export const createSerialized$: <
  T extends CustomSerializable<any, S>,
  S = T extends { [SerializerSymbol]: (obj: any) => infer U } ? U : unknown,
>(
  // We want to also add T as a possible parameter type, but that breaks type inference
  // The
  qrl: (data: S | undefined) => T
) => T extends Promise<any> ? never : SerializedSignal<T> = implicit$FirstArg(
  createSerializedQrl as any
);
export { createSerializedQrl };
