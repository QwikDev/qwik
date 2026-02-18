import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import type { AsyncCtx, AsyncSignalOptions, ComputedOptions, SerializerArg } from './types';
import {
  createSignal as _createSignal,
  createComputedSignal as createComputedQrl,
  createSerializerSignal as createSerializerQrl,
  createAsyncSignal as createAsyncQrl,
} from './signal-api';
import type { ComputedReturnType } from '../use/use-computed';
export { isSignal } from './utils';

/** @public @deprecated not used */
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
export interface Signal<T = any> {
  /** Reading from this subscribes to updates; writing to this triggers updates. */
  value: T;
  /** Reading from this does not subscribe to updates; writing to this does not trigger updates. */
  untrackedValue: T;
  /**
   * Use this to force running subscribers, for example when the value mutated but remained the same
   * object.
   */
  force(): void;
}

/**
 * A computed signal is a signal which is calculated from other signals. When the signals change,
 * the computed signal is recalculated, and if the result changed, all tasks which are tracking the
 * signal will be re-run and all components that read the signal will be re-rendered.
 *
 * @public
 */
export interface ComputedSignal<T> extends Signal<T> {
  /** Use this to force recalculation. */
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
 * An AsyncSignal holds the result of the given async function. If the function uses `track()` to
 * track reactive state, and that state changes, the AsyncSignal is recalculated, and if the result
 * changed, all tasks which are tracking the AsyncSignal will be re-run and all subscribers
 * (components, tasks etc) that read the AsyncSignal will be updated.
 *
 * If the async function throws an error, the AsyncSignal will capture the error and set the `error`
 * property. The error can be cleared by re-running the async function successfully.
 *
 * While the async function is running, the `.loading` property will be set to `true`. Once the
 * function completes, `loading` will be set to `false`.
 *
 * If the value has not yet been resolved, reading the AsyncSignal will throw a Promise, which will
 * retry the component or task once the value resolves.
 *
 * If the value has been resolved, but the async function is re-running, reading the AsyncSignal
 * will subscribe to it and return the last resolved value until the new value is ready. As soon as
 * the new value is ready, the subscribers will be updated.
 *
 * If the async function threw an error, reading the `.value` will throw that same error. Read from
 * `.error` to check if there was an error.
 *
 * @public
 */
export interface AsyncSignal<T = unknown> extends ComputedSignal<T> {
  /**
   * Whether the signal is currently loading. This will trigger lazy loading of the signal, so you
   * can use it like this:
   *
   * ```tsx
   * signal.loading ? <Loading /> : signal.error ? <Error /> : <Component
   * value={signal.value} />
   * ```
   */
  loading: boolean;
  /**
   * The error that occurred while computing the signal, if any. This will be cleared when the
   * signal is successfully computed.
   */
  error: Error | undefined;
  /**
   * Poll interval in ms. Writable and immediately effective when the signal has consumers. If set
   * to `0`, polling stops.
   */
  interval: number;
  /** A promise that resolves when the value is computed or rejected. */
  promise(): Promise<void>;
  /** Abort the current computation and run cleanups if needed. */
  abort(reason?: any): void;
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
 * If you need the function to be async, use `createAsync$` instead (don't forget to use `track()`).
 *
 * @public
 */
export const createComputed$: <T>(
  qrl: () => T,
  options?: ComputedOptions
) => ComputedReturnType<T> = /*#__PURE__*/ implicit$FirstArg(createComputedQrl as any);
export { createComputedQrl };

/**
 * Create a signal holding a `.value` which is calculated from the given async function (QRL). The
 * standalone version of `useAsync$`.
 *
 * @public
 */
export const createAsync$: <T>(
  qrl: (arg: AsyncCtx<T>) => Promise<T>,
  options?: AsyncSignalOptions<T>
) => AsyncSignal<T> = /*#__PURE__*/ implicit$FirstArg(createAsyncQrl as any);
export { createAsyncQrl };

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
