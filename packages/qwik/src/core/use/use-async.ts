import { createAsyncSignal } from '../reactive-primitives/signal-api';
import { type AsyncSignal } from '../reactive-primitives/signal.public';
import type { AsyncCtx, AsyncSignalOptions } from '../reactive-primitives/types';
import { _captures } from '../shared/qrl/qrl-class';
import { implicit$FirstArg } from '../shared/qrl/implicit_dollar';
import { createQRL } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import type { ValueOrPromise } from '../shared/utils/types';
import { useSequentialScope } from './use-sequential-scope';
import { useConstant } from './use-signal';

/**
 * Note, we don't pass the generic type to AsyncCtx because it causes TypeScript to not infer the
 * type of the resource correctly. The type is only used for the `previous` property, which is not
 * commonly used, and can be easily cast if needed.
 *
 * @public
 */
export type AsyncFn<T> = (ctx: AsyncCtx) => ValueOrPromise<T>;

/**
 * Async resource function used by the direct `useAsync$(resource, input)` form.
 *
 * @public
 */
export type AsyncResourceFn<TInput, TOutput> = (
  abortSignal: AbortSignal,
  input: TInput
) => ValueOrPromise<TOutput>;

/**
 * Server function QRL accepted by the direct `useAsync$(serverFn, input)` form.
 *
 * @public
 */
export type ServerFunctionQrl<TInput = unknown, TOutput = unknown> = QRL<
  AsyncResourceFn<TInput, TOutput>
> & {
  __qwik_server_function__?: true;
};

/**
 * Internal QRL form for `useAsync$`.
 *
 * @public
 */
export type UseAsyncQrl = {
  <T>(qrl: QRL<AsyncFn<T>>, options?: AsyncSignalOptions<T>): AsyncSignal<T>;
  <TInput, TOutput>(
    qrl: ServerFunctionQrl<TInput, TOutput>,
    input: TInput,
    options?: AsyncSignalOptions<Awaited<TOutput>>
  ): AsyncSignal<Awaited<TOutput>>;
};

/**
 * Public callable shape for `useAsync$`.
 *
 * @public
 */
export type UseAsyncDollar = {
  <T>(fn: AsyncFn<T>, options?: AsyncSignalOptions<T>): AsyncSignal<T>;
  <TInput, TOutput>(
    fn: AsyncResourceFn<TInput, TOutput>,
    input: TInput,
    options?: AsyncSignalOptions<Awaited<TOutput>>
  ): AsyncSignal<Awaited<TOutput>>;
  <TInput, TOutput>(
    fn: ServerFunctionQrl<TInput, TOutput>,
    input: TInput,
    options?: AsyncSignalOptions<Awaited<TOutput>>
  ): AsyncSignal<Awaited<TOutput>>;
};

const SERVER_FUNCTION_MARKER = '__qwik_server_function__';

const ASYNC_SIGNAL_OPTION_KEYS = new Set([
  'allowStale',
  'clientOnly',
  'concurrency',
  'container',
  'eagerCleanup',
  'expires',
  'initial',
  'interval',
  'poll',
  'serializationStrategy',
  'timeout',
]);

const creator = <T>(qrl: QRL<AsyncFn<T>>, options?: AsyncSignalOptions<T>) => {
  qrl.resolve();
  return createAsyncSignal(qrl, options);
};

/** @internal */
export const _uas = async <TInput, TOutput>(ctx: AsyncCtx<Awaited<TOutput>>) => {
  const [qrl, input] = _captures as [
    QRL<AsyncResourceFn<TInput, TOutput> | ServerFunctionQrl<TInput, TOutput>>,
    TInput,
  ];
  const resource = isServerFunctionQrl(qrl) ? qrl : await qrl.resolve();
  return (await (resource as AsyncResourceFn<TInput, TOutput>)(
    ctx.abortSignal,
    input
  )) as Awaited<TOutput>;
};

const resourceCreator = <TInput, TOutput>(
  qrl: QRL<AsyncResourceFn<TInput, TOutput> | ServerFunctionQrl<TInput, TOutput>>,
  input: TInput,
  options?: AsyncSignalOptions<Awaited<TOutput>>
) => {
  const { val, set, iCtx } = useSequentialScope<AsyncSignal<Awaited<TOutput>>>();
  if (val) {
    return val;
  }

  const resourceQrl = createQRL(
    null,
    '_uas',
    _uas as AsyncFn<Awaited<TOutput>>,
    null,
    [qrl, input],
    iCtx.$container$
  );
  resourceQrl.resolve();
  const signalOptions = options?.container
    ? options
    : {
        ...options,
        container: iCtx.$container$,
      };
  const signal = createAsyncSignal(resourceQrl as QRL<AsyncFn<Awaited<TOutput>>>, signalOptions);
  (signal as any).__qwik_async_resource__ = {
    input,
    qrlHash: qrl.getHash(),
  };
  return set(signal);
};

/** @internal */
export const useAsyncQrl: UseAsyncQrl = (<T>(
  qrl: QRL<AsyncFn<T>>,
  inputOrOptions?: unknown,
  options?: AsyncSignalOptions<T>
): AsyncSignal<T> => {
  if (options !== undefined || !isAsyncSignalOptions(inputOrOptions)) {
    return resourceCreator(
      qrl as unknown as QRL<AsyncResourceFn<unknown, T>>,
      inputOrOptions,
      options as AsyncSignalOptions<Awaited<T>>
    ) as AsyncSignal<T>;
  }
  return useConstant(creator<T>, qrl, inputOrOptions as AsyncSignalOptions<T> | undefined);
}) as UseAsyncQrl;

/**
 * Creates an AsyncSignal which holds the result of the given async function. If the function uses
 * `track()` to track reactive state, and that state changes, the AsyncSignal is recalculated, and
 * if the result changed, all tasks which are tracking the AsyncSignal will be re-run and all
 * subscribers (components, tasks etc) that read the AsyncSignal will be updated.
 *
 * If the async function throws an error, the AsyncSignal will capture the error and set the `error`
 * property. The error can be cleared by re-running the async function successfully.
 *
 * While the async function is running, the `loading` property will be set to `true`. Once the
 * function completes, `loading` will be set to `false`.
 *
 * If the value has not yet been resolved, reading the AsyncSignal will throw a Promise, which will
 * retry the component or task once the value resolves.
 *
 * If the value has been resolved, but the async function is re-running, reading the AsyncSignal
 * will subscribe to it and return the last resolved value until the new value is ready. As soon as
 * the new value is ready, the subscribers will be updated.
 *
 * @public
 */
export const useAsync$ = implicit$FirstArg(useAsyncQrl) as UseAsyncDollar;

const isServerFunctionQrl = <TInput, TOutput>(
  value: unknown
): value is ServerFunctionQrl<TInput, TOutput> => {
  return !!value && typeof value === 'function' && (value as any)[SERVER_FUNCTION_MARKER] === true;
};

const isAsyncSignalOptions = (value: unknown): value is AsyncSignalOptions<unknown> | undefined => {
  if (value == null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  for (const key of Object.keys(value)) {
    if (ASYNC_SIGNAL_OPTION_KEYS.has(key)) {
      return true;
    }
  }
  return false;
};
