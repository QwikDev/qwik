import type { QRLInternal, ValueOrPromise } from '../../server/qwik-types';
import { qwikDebugToString } from '../debug';
import { _captures } from '../internal';
import { createStore } from '../reactive-primitives/impl/store';
import {
  createAsyncQrl,
  type AsyncSignal,
  type Signal,
} from '../reactive-primitives/signal.public';
import type { AsyncCtx } from '../reactive-primitives/types';
import { StoreFlags } from '../reactive-primitives/types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { createQRL } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import { type QRL } from '../shared/qrl/qrl.public';
import { isPromise } from '../shared/utils/promises';
import { useSequentialScope } from './use-sequential-scope';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('RESOURCE', ...args.map(qwikDebugToString));

/** @public */
export interface ResourceCtx<T = unknown> extends AsyncCtx<T> {
  /** @deprecated Does not do anything */
  cache(policyOrMilliseconds: number | 'immutable'): void;
}

/** @public */
export type ResourceFn<T> = (ctx: ResourceCtx) => ValueOrPromise<T>;

/** @public */
export type ResourceReturn<T> = {
  readonly value: Promise<T>;
  readonly loading: boolean;
};

/** @public */
export type ResourcePending<T> = ResourceReturn<T>;

/** @public */
export type ResourceResolved<T> = ResourceReturn<T>;

/** @public */
export type ResourceRejected<T> = ResourceReturn<T>;

export interface ResourceReturnInternal<T> {
  __brand: 'resource';
  value: Promise<T>;
  loading: boolean;
  signal: AsyncSignal<{ r: T }>;
}

/**
 * Options to pass to `useResource$()`
 *
 * @public
 * @see useResource
 */
export interface ResourceOptions {
  /**
   * Timeout in milliseconds. If the resource takes more than the specified millisecond, it will
   * timeout. Resulting on a rejected resource.
   */
  timeout?: number;
}

/**
 * The resource function wrapper
 *
 * @internal
 */
export const _rsc = async <T>(arg: ResourceCtx<T>) => {
  const [fn, ref] = _captures as [QRLInternal<ResourceFn<T>>, { r: T; i: number }];
  DEBUG && log('invoke resource function');
  const result = await fn(arg);
  DEBUG && log('resource function resolved', result);
  if (result && typeof result === 'object') {
    if (ref.r) {
      Object.assign(ref.r, result);
    } else {
      // We need lazy creation because we don't know if it will be an array or an object, and we want to preserve the original reference for reactivity to work
      ref.r = createStore(fn.$container$, result, StoreFlags.RECURSIVE);
      DEBUG && log('store created', ref.r);
    }
  } else {
    ref.r = result as any;
  }
  return { r: ref.r };
};

/** @internal */
export const useResourceQrl = <T>(
  qrl: QRL<ResourceFn<T>>,
  opts?: ResourceOptions
): ResourceReturn<T> => {
  assertQrl(qrl);

  const { val, set, iCtx } = useSequentialScope<ResourceReturnInternal<T>>();
  if (val) {
    return val as ResourceReturn<T>;
  }

  const ref = {} as { r: T };
  // Wrap the function so we can maintain a stable reference to the store
  const wrapped = createQRL(null, '_rsc', _rsc, null, [qrl, ref]);
  qrl.$container$ = iCtx.$container$;
  const asyncSignal = createAsyncQrl<{ r: T }>(wrapped as any, {
    timeout: opts?.timeout,
    container: iCtx.$container$,
    concurrency: 0,
  });
  // Resource is eager
  asyncSignal.$computeIfNeeded$();

  // Create a wrapper that presents the Promise-based ResourceReturn API
  const resource: ResourceReturnInternal<T> = {
    __brand: 'resource',
    signal: asyncSignal,
    get value(): Promise<T> {
      return asyncSignal
        .promise()
        .then(() => (asyncSignal.error ? Promise.reject(asyncSignal.error) : asyncSignal.value.r));
    },
    get loading(): boolean {
      return asyncSignal.loading;
    },
  };

  set(resource);
  return resource;
};

/** @public */
export interface ResourceProps<T> {
  readonly value: ResourceReturn<T> | Signal<Promise<T> | T> | Promise<T>;
  onResolved: (value: T) => JSXOutput | Promise<JSXOutput>;
  onPending?: () => JSXOutput | Promise<JSXOutput>;
  onRejected?: (reason: Error) => JSXOutput | Promise<JSXOutput>;
}

/**
 * ```tsx
 * const Cmp = component$(() => {
 *   const city = useSignal('');
 *
 *   const weather = useAsync$(async ({ track, cleanup, abortSignal }) => {
 *     const cityName = track(city);
 *     const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
 *       signal: abortSignal,
 *     });
 *     const temp = (await res.json()) as { temp: number };
 *     return temp;
 *   });
 *
 *   return (
 *     <div>
 *       <input name="city" bind:value={city} />
 *       <div>
 *         Temperature:{' '}
 *         {weather.loading
 *           ? 'Loading...'
 *           : weather.error
 *             ? `Error: ${weather.error.message}`
 *             : weather.value.temp}
 *       </div>
 *     </div>
 *   );
 * });
 * ```
 *
 * @deprecated Use `useAsync$` instead, which is more efficient, and has a more flexible API. Just
 *   read the `loading` and `error` properties from the returned signal to determine the status.
 * @public
 */
export const Resource = <T>({
  value,
  onResolved,
  onPending,
  onRejected,
}: ResourceProps<T>): JSXOutput => {
  if (isPromise<T>(value)) {
    DEBUG && log('value is a promise, awaiting it');
    return value.then(onResolved, onRejected) as unknown as JSXOutput;
  }
  const isRes = isResourceReturn<T>(value);
  const signal = isRes ? value.signal : (value as any as AsyncSignal<number>);
  if (onPending && (signal as AsyncSignal<T>).loading) {
    return onPending() as unknown as JSXOutput;
  }
  if (onRejected && (signal as AsyncSignal<T>).error) {
    return onRejected((signal as AsyncSignal<T>).error!) as unknown as JSXOutput;
  }
  const val = isRes ? (signal as AsyncSignal<{ r: T }>).value?.r : (signal as AsyncSignal<T>).value;
  return (isPromise<T>(val!)
    ? val.then(onResolved, onRejected)
    : onResolved(val!)) as unknown as JSXOutput;
};

const isResourceReturn = <T>(obj: any): obj is ResourceReturnInternal<T> => {
  return obj && (obj as any).__brand === 'resource';
};
