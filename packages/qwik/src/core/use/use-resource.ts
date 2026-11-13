import type { QRLInternal, ValueOrPromise } from '../../server/qwik-types';
import { qwikDebugToString } from '../debug';
import { _capturesObj } from '../internal';
import { createStore, unwrapStore } from '../reactive-primitives/impl/store';
import {
  createAsyncQrl,
  type ComputedSignalInternal,
  type Signal,
} from '../reactive-primitives/signal.public';
import type { ComputeCtx } from '../reactive-primitives/types';
import { StoreFlags } from '../reactive-primitives/types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { createQRL } from '../shared/qrl/qrl-class';
import { assertQrl } from '../shared/qrl/qrl-utils';
import { type QRL } from '../shared/qrl/qrl.public';
import { isPromise } from '../shared/utils/promises';
import { isObject } from '../shared/utils/types';
import { useSequentialScope } from './use-sequential-scope';

const DEBUG = false;
// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('RESOURCE', ...args.map(qwikDebugToString));

/** @public */
export interface ResourceCtx<T = unknown> extends ComputeCtx<T> {
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
  signal: ComputedSignalInternal<{ r: T }>;
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

const _propertyIsEnumerable = Object.prototype.propertyIsEnumerable;

const assignOwnEnumerableProps = (target: object, source: object): void => {
  const unwrappedSource = unwrapStore(source);
  const keys = Reflect.ownKeys(unwrappedSource);
  const unwrappedTarget = unwrapStore(target);
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (!_propertyIsEnumerable.call(unwrappedSource, key)) {
      continue;
    }
    const value = (unwrappedSource as Record<PropertyKey, unknown>)[key];
    if (key === '__proto__') {
      Object.defineProperty(unwrappedTarget, key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
      continue;
    }
    (target as Record<PropertyKey, unknown>)[key] = value;
  }
};

const copyResourceResult = <T extends object>(result: T): T => {
  if (Array.isArray(result)) {
    return result.slice() as T;
  }
  const copy = {} as T;
  assignOwnEnumerableProps(copy, result);
  return copy;
};

const syncResourceStore = (current: object, next: object): void => {
  if (Array.isArray(current) && Array.isArray(next)) {
    current.length = unwrapStore(next).length;
    assignOwnEnumerableProps(current, next);
    return;
  }
  const unwrappedNext = unwrapStore(next);
  const currentKeys = Object.keys(unwrapStore(current));
  for (let index = 0; index < currentKeys.length; index++) {
    const key = currentKeys[index];
    if (!Object.hasOwn(unwrappedNext, key)) {
      Reflect.deleteProperty(current, key);
    }
  }
  assignOwnEnumerableProps(current, next);
};

/** @internal */
export const _copyResourceResult = copyResourceResult;

/** @internal */
export const _syncResourceStore = syncResourceStore;

/**
 * The resource function wrapper
 *
 * @internal
 */
export const _rsc = async <T>(arg: ResourceCtx<T>) => {
  const [fn, ref] = _capturesObj._ as [QRLInternal<ResourceFn<T>>, { r: T; i: number }];
  DEBUG && log('invoke resource function');
  const result = await fn(arg);
  DEBUG && log('resource function resolved', result);
  if (isObject(result)) {
    const current = ref.r;
    if (isObject(current) && Array.isArray(current) === Array.isArray(result)) {
      syncResourceStore(current, result);
    } else {
      // Copy so later results never mutate the caller's object.
      ref.r = createStore(fn.$container$, copyResourceResult(result), StoreFlags.RECURSIVE);
      DEBUG && log('store created', ref.r);
    }
  } else {
    ref.r = result;
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
  const wrapped = createQRL(null, '_rsc', _rsc, null, [qrl, ref], iCtx.$container$);
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
 *   const weather = useComputed$(async ({ track, cleanup, abortSignal }) => {
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
 *       <div>Temperature: {weather.value.temp}</div>
 *     </div>
 *   );
 * });
 * ```
 *
 * @deprecated Use `useComputed$` instead.
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
  const signal = (isRes ? value.signal : value) as ComputedSignalInternal<unknown>;
  if (onPending && signal.loading) {
    return onPending() as unknown as JSXOutput;
  }
  if (onRejected && signal.error) {
    return onRejected(signal.error) as unknown as JSXOutput;
  }
  const val = isRes ? (signal.value as { r: T } | undefined)?.r : (signal.value as T);
  return (isPromise<T>(val!)
    ? val.then(onResolved, onRejected)
    : onResolved(val!)) as unknown as JSXOutput;
};

const isResourceReturn = <T>(obj: any): obj is ResourceReturnInternal<T> => {
  return obj && (obj as any).__brand === 'resource';
};
