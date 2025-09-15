import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { ComputedOptions, SerializerArg } from './types';
import {
  createSignal as _createSignal,
  createComputedSignal as createComputedQrl,
  createSerializerSignal as createSerializerQrl,
  createAsyncComputedSignal as createAsyncComputedQrl,
} from './signal-api';
import type { ComputedReturnType } from '../use/use-computed';
import type { AsyncComputedReturnType } from '../use/use-async-computed';
export { isSignal } from './utils';

/** @public */
export interface ReadonlySignal<T = unknown> {
  readonly value: T;
}

/** @public */
export interface AsyncComputedReadonlySignal<T = unknown> extends ComputedSignal<T> {
  /** Whether the signal is currently loading. */
  loading: boolean;
  /** The error that occurred while computing the signal. */
  error: Error | null;
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
   * Use this to force running subscribers, for example when the calculated value mutates but
   * remains the same object.
   */
  force(): void;

  /**
   * Use this to force recalculation and running subscribers, for example when the calculated value
   * mutates but remains the same object.
   */
  invalidate(): void;
}

/**
 * A serializer signal holds a custom serializable value. See `useSerializer$` for more details.
 *
 * @public
 */
export interface SerializerSignal<T> extends ComputedSignal<T> {
  /** Fake property to make the serialization linter happy */
  __no_serialize__: true;
}

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
 * If you need the function to be async, use `useAsyncComputed$` instead.
 *
 * @public
 */
export const createComputed$: <T>(
  qrl: () => T,
  options?: ComputedOptions
) => ComputedReturnType<T> = /*#__PURE__*/ implicit$FirstArg(createComputedQrl as any);
export { createComputedQrl };

/**
 * Create an async computed signal which is calculated from the given QRL. A computed signal is a
 * signal which is calculated from other signals or async operation. When the signals change, the
 * computed signal is recalculated.
 *
 * The QRL must be a function which returns the value of the signal. The function must not have side
 * effects, and it can be async.
 *
 * @public
 */
export const createAsyncComputed$: <T>(
  qrl: () => Promise<T>,
  options?: ComputedOptions
) => AsyncComputedReturnType<T> = /*#__PURE__*/ implicit$FirstArg(createAsyncComputedQrl as any);
export { createAsyncComputedQrl };

/**
 * Create a signal that holds a custom serializable value. See {@link useSerializer$} for more
 * details.
 *
 * @public
 */
export const createSerializer$: <T, S>(
  arg: SerializerArg<T, S>
) => T extends Promise<any> ? never : SerializerSignal<T> = implicit$FirstArg(
  createSerializerQrl as any
);
export { createSerializerQrl };
