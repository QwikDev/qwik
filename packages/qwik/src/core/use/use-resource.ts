import { isServerPlatform } from '../shared/platform/platform';
import { assertQrl } from '../shared/qrl/qrl-class';
import { type QRL } from '../shared/qrl/qrl.public';
import { Fragment, _jsxSorted } from '../shared/jsx/jsx-runtime';
import { invoke, newInvokeContext, untrack, useBindInvokeContext } from './use-core';
import { Task, TaskFlags, cleanupTask, type DescriptorBase, type Tracker } from './use-task';

import type { Container, HostElement, ValueOrPromise, fixMeAny } from '../../server/qwik-types';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { delay, isPromise, safeCall } from '../shared/utils/promises';
import { isFunction, isObject } from '../shared/utils/types';
import { StoreFlags, createStore, getStoreTarget, unwrapStore } from '../signal/store';
import { useSequentialScope } from './use-sequential-scope';
import { EffectProperty, isSignal } from '../signal/signal';
import type { Signal } from '../signal/signal.public';
import { clearSubscriberEffectDependencies } from '../signal/signal-subscriber';
import { ResourceEvent } from '../shared/utils/markers';
import { assertDefined } from '../shared/error/assert';
import { noSerialize } from '../shared/utils/serialize-utils';

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

// <docs markdown="../readme.md#useResource">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResource instead)
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
 * Avoid using a `try/catch` statement in `useResource$`. If you catch the error instead of passing
 * it, the resource status will never be `rejected`.
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
  runResource(task, container, iCtx.$hostElement$ as fixMeAny);
  set(resource);

  return resource;
};

/** @public */
export interface ResourceProps<T> {
  readonly value: ResourceReturn<T> | Signal<Promise<T> | T> | Promise<T>;
  onResolved: (value: T) => JSXOutput;
  onPending?: () => JSXOutput;
  onRejected?: (reason: Error) => JSXOutput;
}

// <docs markdown="../readme.md#useResource">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#useResource instead)
/**
 * This method works like an async memoized function that runs whenever some tracked value changes
 * and returns some data.
 *
 * `useResource` however returns immediate a `ResourceReturn` object that contains the data and a
 * state that indicates if the data is available or not.
 *
 * The status can be one of the following:
 *
 * - 'pending' - the data is not yet available.
 * - 'resolved' - the data is available.
 * - 'rejected' - the data is not available due to an error or timeout.
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
    const isBrowser = !isServerPlatform();
    if (isBrowser) {
      // create a subscription for the resource._state changes
      const state = resource._state;
      DEBUG && debugLog(`RESOURCE_CMP.${state}`, 'VALUE: ' + untrack(() => resource._resolved));

      if (state === 'pending' && props.onPending) {
        return Promise.resolve(props.onPending());
      } else if (state === 'rejected' && props.onRejected) {
        return Promise.resolve(resource._error!).then(props.onRejected);
      } else {
        // resolved, pending without onPending prop or rejected with onRejected prop
        return Promise.resolve(untrack(() => resource._resolved) as T).then(props.onResolved);
      }
    }
    return resource.value.then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  } else if (isPromise(resource)) {
    return resource.then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  } else if (isSignal(resource)) {
    return Promise.resolve(resource.value).then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  } else {
    return Promise.resolve(resource as T).then(
      useBindInvokeContext(props.onResolved),
      useBindInvokeContext(props.onRejected)
    );
  }
}

export const _createResourceReturn = <T>(opts?: ResourceOptions): ResourceReturnInternal<T> => {
  const resource: ResourceReturnInternal<T> = {
    __brand: 'resource',
    value: undefined as never,
    loading: isServerPlatform() ? false : true,
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

export const getInternalResource = <T>(resource: ResourceReturn<T>): ResourceReturnInternal<T> => {
  return getStoreTarget(resource) as any;
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

  const iCtx = newInvokeContext(container.$locale$, host as fixMeAny, undefined, ResourceEvent);
  iCtx.$container$ = container;

  const taskFn = task.$qrl$.getFn(iCtx, () => clearSubscriberEffectDependencies(task));

  const resource = task.$state$;
  assertDefined(
    resource,
    'useResource: when running a resource, "task.resource" must be a defined.',
    task
  );

  const track: Tracker = (obj: (() => unknown) | object | Signal<unknown>, prop?: string) => {
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = [task, EffectProperty.COMPONENT];
    ctx.$container$ = container;
    return invoke(ctx, () => {
      if (isFunction(obj)) {
        return obj();
      }
      if (prop) {
        return (obj as Record<string, unknown>)[prop];
      } else if (isSignal(obj)) {
        return obj.value;
      } else {
        return obj;
      }
    });
  };

  const handleError = (reason: unknown) => container.handleError(reason, host);

  const cleanups: (() => void)[] = [];
  task.$destroy$ = noSerialize(() => {
    cleanups.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        handleError(err);
      }
    });
    done = true;
  });

  const resourceTarget = unwrapStore(resource);
  const opts: ResourceCtx<T> = {
    track,
    cleanup(fn) {
      if (typeof fn === 'function') {
        cleanups.push(fn);
      }
    },
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
        resource.loading = false;
        resource._state = 'resolved';
        resource._resolved = value as T;
        resource._error = undefined;
        // console.log('RESOURCE.resolved: ', value);

        resolve(value as T);
      } else {
        done = true;
        resource.loading = false;
        resource._state = 'rejected';
        resource._error = value as Error;
        reject(value as Error);
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
  invoke(iCtx, () => {
    // console.log('RESOURCE.pending: ');
    resource._state = 'pending';
    resource.loading = !isServerPlatform();
    const promise = (resource.value = new Promise((r, re) => {
      resolve = r;
      reject = re;
    }));
    promise.catch(ignoreErrorToPreventNodeFromCrashing);
  });

  const promise: ValueOrPromise<void> = safeCall(
    () => Promise.resolve(taskFn(opts)),
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

const ignoreErrorToPreventNodeFromCrashing = (err: unknown) => {
  // ignore error to prevent node from crashing
  // node will crash in promise is rejected and no one is listening to the rejection.
};
