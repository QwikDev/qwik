import { Fragment } from '../shared/jsx/jsx-runtime';
import { _jsxSorted } from '../shared/jsx/jsx-internal';
import { isServerPlatform } from '../shared/platform/platform';
import { assertQrl } from '../shared/qrl/qrl-utils';
import { type QRL } from '../shared/qrl/qrl.public';
import { invoke, newInvokeContext, untrack, useBindInvokeContext } from './use-core';
import { Task, TaskFlags, cleanupTask, type DescriptorBase, type Tracker } from './use-task';

import type { Container, HostElement, ValueOrPromise } from '../../server/qwik-types';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import {
  createStore,
  forceStoreEffects,
  getStoreTarget,
  unwrapStore,
} from '../reactive-primitives/impl/store';
import type { Signal } from '../reactive-primitives/signal.public';
import { StoreFlags } from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { assertDefined } from '../shared/error/assert';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { ResourceEvent } from '../shared/utils/markers';
import { delay, isPromise, retryOnPromise, safeCall } from '../shared/utils/promises';
import { isObject } from '../shared/utils/types';
import { useSequentialScope } from './use-sequential-scope';
import { cleanupFn, trackFn } from './utils/tracker';

const DEBUG: boolean = false;

function debugLog(...arg: any) {
  // eslint-disable-next-line no-console
  console.log(arg.join(', '));
}

/** @public */
export interface ResourceCtx<T> {
  readonly track: Tracker;
  cleanup(callback: () => void): void;
  cache(policyOrMilliseconds: number | 'immutable'): void;
  readonly previous: T | undefined;
}

/** @public */
export type ResourceFn<T> = (ctx: ResourceCtx<unknown>) => ValueOrPromise<T>;

/** @public */
export type ResourceReturn<T> = ResourcePending<T> | ResourceResolved<T> | ResourceRejected<T>;

/** @public */
export interface ResourcePending<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

/** @public */
export interface ResourceResolved<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

/** @public */
export interface ResourceRejected<T> {
  readonly value: Promise<T>;
  readonly loading: boolean;
}

export interface ResourceReturnInternal<T> {
  __brand: 'resource';
  _state: 'pending' | 'resolved' | 'rejected';
  _resolved: T | undefined;
  _error: Error | undefined;
  _cache: number;
  _timeout: number;
  value: Promise<T>;
  loading: boolean;
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

/** @internal */
export const useResourceQrl = <T>(
  qrl: QRL<ResourceFn<T>>,
  opts?: ResourceOptions
): ResourceReturn<T> => {
  const { val, set, i, iCtx } = useSequentialScope<ResourceReturn<T>>();
  if (val != null) {
    return val;
  }
  assertQrl(qrl);

  const container = iCtx.$container$;
  const resource = createResourceReturn<T>(container, opts);
  const el = iCtx.$hostElement$;
  const task = new Task(
    TaskFlags.DIRTY | TaskFlags.RESOURCE,
    i,
    el,
    qrl,
    resource,
    null
  ) as ResourceDescriptor<any>;
  set(resource);
  runResource(task, container, el);

  return resource;
};

/** @public */
export interface ResourceProps<T> {
  readonly value: ResourceReturn<T> | Signal<Promise<T> | T> | Promise<T>;
  onResolved: (value: T) => JSXOutput | Promise<JSXOutput>;
  onPending?: () => JSXOutput | Promise<JSXOutput>;
  onRejected?: (reason: Error) => JSXOutput | Promise<JSXOutput>;
}

// <docs markdown="../readme.md#useResource">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResource instead and run `pnpm docs.sync`)
/**
 * This method works like an async memoized function that runs whenever some tracked value changes
 * and returns some data.
 *
 * `useResource` however returns immediate a `ResourceReturn` object that contains the data and a
 * state that indicates if the data is available or not.
 *
 * The status can be one of the following:
 *
 * - `pending` - the data is not yet available.
 * - `resolved` - the data is available.
 * - `rejected` - the data is not available due to an error or timeout.
 *
 * Be careful when using a `try/catch` statement in `useResource$`. If you catch the error and don't
 * re-throw it (or a new Error), the resource status will never be `rejected`.
 *
 * ### Example
 *
 * Example showing how `useResource` to perform a fetch to request the weather, whenever the input
 * city name changes.
 *
 * ```tsx
 * const Cmp = component$(() => {
 *   const cityS = useSignal('');
 *
 *   const weatherResource = useResource$(async ({ track, cleanup }) => {
 *     const cityName = track(cityS);
 *     const abortController = new AbortController();
 *     cleanup(() => abortController.abort('cleanup'));
 *     const res = await fetch(`http://weatherdata.com?city=${cityName}`, {
 *       signal: abortController.signal,
 *     });
 *     const data = await res.json();
 *     return data as { temp: number };
 *   });
 *
 *   return (
 *     <div>
 *       <input name="city" bind:value={cityS} />
 *       <Resource
 *         value={weatherResource}
 *         onResolved={(weather) => {
 *           return <div>Temperature: {weather.temp}</div>;
 *         }}
 *       />
 *     </div>
 *   );
 * });
 * ```
 *
 * @public
 * @see Resource
 * @see ResourceReturn
 */
// </docs>
export const Resource = <T>(props: ResourceProps<T>): JSXOutput => {
  // Resource path
  return _jsxSorted(Fragment, null, null, getResourceValueAsPromise(props), 0, null);
};

function getResourceValueAsPromise<T>(props: ResourceProps<T>): Promise<JSXOutput> | JSXOutput {
  const resource = props.value as ResourceReturnInternal<T> | Promise<T> | Signal<T>;
  if (isResourceReturn(resource)) {
    // create a subscription for the resource._state changes
    const state = resource._state;
    const isBrowser = !isServerPlatform();
    if (isBrowser) {
      DEBUG && debugLog(`RESOURCE_CMP.${state}`, 'VALUE: ' + untrack(() => resource._resolved));

      if (state === 'pending' && props.onPending) {
        return Promise.resolve().then(useBindInvokeContext(props.onPending));
      } else if (state === 'rejected' && props.onRejected) {
        return Promise.resolve(resource._error!).then(useBindInvokeContext(props.onRejected));
      } else {
        const resolvedValue = untrack(() => resource._resolved) as T;
        if (resolvedValue !== undefined) {
          // resolved, pending without onPending prop or rejected without onRejected prop
          return Promise.resolve(resolvedValue).then(useBindInvokeContext(props.onResolved));
        }
      }
    }
    return untrack(() => resource.value).then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  } else if (isPromise(resource)) {
    return resource.then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  } else if (isSignal(resource)) {
    const value = retryOnPromise(() => resource.value);
    const promise = isPromise(value) ? value : Promise.resolve(value);
    return promise.then(useBindInvokeContext(props.onResolved));
  } else {
    return Promise.resolve(resource as T).then(useBindInvokeContext(props.onResolved));
  }
}

export const _createResourceReturn = <T>(opts?: ResourceOptions): ResourceReturnInternal<T> => {
  const resource: ResourceReturnInternal<T> = {
    __brand: 'resource',
    value: undefined as never,
    loading: !isServerPlatform(),
    _resolved: undefined as never,
    _error: undefined as never,
    _state: 'pending',
    _timeout: opts?.timeout ?? -1,
    _cache: 0,
  };
  return resource;
};

export const createResourceReturn = <T>(
  container: Container,
  opts?: ResourceOptions,
  initialPromise?: Promise<T>
): ResourceReturnInternal<T> => {
  const result = _createResourceReturn<T>(opts);
  result.value = initialPromise as Promise<T>;

  return createStore(container, result, StoreFlags.RECURSIVE);
};

export const isResourceReturn = (obj: any): obj is ResourceReturn<unknown> => {
  return isObject(obj) && (getStoreTarget(obj as any) || obj).__brand === 'resource';
};

export interface ResourceDescriptor<T>
  extends DescriptorBase<ResourceFn<T>, ResourceReturnInternal<T>> {}

export const runResource = <T>(
  task: ResourceDescriptor<T>,
  container: Container,
  host: HostElement
): ValueOrPromise<void> => {
  task.$flags$ &= ~TaskFlags.DIRTY;
  cleanupTask(task);

  const iCtx = newInvokeContext(container.$locale$, host, undefined, ResourceEvent);
  iCtx.$container$ = container;

  const taskFn = task.$qrl$.getFn(iCtx, () => clearAllEffects(container, task));

  const resource = task.$state$;
  assertDefined(
    resource,
    'useResource: when running a resource, "task.resource" must be a defined.',
    task
  );

  const track = trackFn(task, container);
  const [cleanup, cleanups] = cleanupFn(task, (reason: unknown) =>
    container.handleError(reason, host)
  );

  const resourceTarget = unwrapStore(resource);
  const opts: ResourceCtx<T> = {
    track,
    cleanup,
    cache(policy) {
      let milliseconds = 0;
      if (policy === 'immutable') {
        milliseconds = Infinity;
      } else {
        milliseconds = policy;
      }
      resource._cache = milliseconds;
    },
    previous: resourceTarget._resolved,
  };

  let resolve: (v: T) => void;
  let reject: (v: unknown) => void;
  let done = false;

  const setState = (resolved: boolean, value: T | Error) => {
    if (!done) {
      done = true;
      if (resolved) {
        done = true;
        resourceTarget.loading = false;
        resourceTarget._state = 'resolved';
        resourceTarget._resolved = value as T;
        resourceTarget._error = undefined;
        resolve(value as T);
      } else {
        done = true;
        resourceTarget.loading = false;
        resourceTarget._state = 'rejected';
        resourceTarget._error = value as Error;
        reject(value as Error);
      }

      if (!isServerPlatform()) {
        forceStoreEffects(resource, '_state');
      }
      return true;
    }
    return false;
  };

  /**
   * Add cleanup to resolve the resource if we are trying to run the same resource again while the
   * previous one is not resolved yet. The next `runResource` run will call this cleanup
   */
  cleanups.push(() => {
    if (untrack(() => resource.loading) === true) {
      const value = untrack(() => resource._resolved) as T;
      setState(true, value);
    }
  });

  // Execute mutation inside empty invocation
  // TODO: is it right? why we need to invoke inside context and trigger effects?
  invoke(iCtx, () => {
    // console.log('RESOURCE.pending: ');
    resource._state = 'pending';
    resource.loading = !isServerPlatform();
    resource.value = new Promise((r, re) => {
      resolve = r;
      reject = re;
    });
  });

  const promise: ValueOrPromise<void> = safeCall(
    () => taskFn(opts),
    (value) => {
      setState(true, value);
    },
    (err) => {
      if (isPromise(err)) {
        return err.then(() => runResource(task, container, host));
      } else {
        setState(false, err);
      }
    }
  );

  const timeout = resourceTarget._timeout;
  if (timeout > 0) {
    return Promise.race([
      promise,
      delay(timeout).then(() => {
        if (setState(false, new Error('timeout'))) {
          cleanupTask(task);
        }
      }),
    ]);
  }
  return promise;
};
