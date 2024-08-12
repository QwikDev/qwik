import { isServerPlatform } from '../platform/platform';
import { assertQrl } from '../qrl/qrl-class';
import { dollar, type QRL } from '../qrl/qrl.public';
import { Fragment, _jsxSorted } from '../render/jsx/jsx-runtime';
import { untrack, useBindInvokeContext } from './use-core';
import {
  Task,
  TaskFlags,
  runResource,
  type ResourceDescriptor,
  type ResourceFn,
  type ResourceReturn,
  type ResourceReturnInternal,
} from './use-task';

import type { Container2, fixMeAny } from '../../server/qwik-types';
import type { GetObjID } from '../container/container';
import type { JSXOutput } from '../render/jsx/types/jsx-node';
import { isSignal, type Signal } from '../state/signal';
import { isPromise } from '../util/promises';
import { isObject } from '../util/types';
import { Store2Flags, createStore2, getStoreTarget2 } from '../v2/signal/v2-store';
import { useSequentialScope } from './use-sequential-scope';

const DEBUG: boolean = false;

function debugLog(...arg: any) {
  // eslint-disable-next-line no-console
  console.log(arg.join(', '));
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

  const container = iCtx.$container2$;
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
export const useResource$ = <T>(
  generatorFn: ResourceFn<T>,
  opts?: ResourceOptions
): ResourceReturn<T> => {
  return useResourceQrl<T>(dollar(generatorFn), opts);
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
    // create a subscription for the resource._state changes
    const state = resource._state;
    if (isBrowser) {
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
  container: Container2,
  opts?: ResourceOptions,
  initialPromise?: Promise<T>
): ResourceReturnInternal<T> => {
  const result = _createResourceReturn<T>(opts);
  result.value = initialPromise as Promise<T>;

  return createStore2(container, result, Store2Flags.RECURSIVE);
};

export const getInternalResource = <T>(resource: ResourceReturn<T>): ResourceReturnInternal<T> => {
  return getStoreTarget2(resource) as any;
};

export const isResourceReturn = (obj: any): obj is ResourceReturn<unknown> => {
  return isObject(obj) && (getStoreTarget2(obj as any) || obj).__brand === 'resource';
};

// TODO: to remove - serializers v1
export const serializeResource = (
  resource: ResourceReturnInternal<unknown>,
  getObjId: GetObjID
) => {
  const state = resource._state;
  if (state === 'resolved') {
    return `0 ${getObjId(resource._resolved)}`;
  } else if (state === 'pending') {
    return `1`;
  } else {
    return `2 ${getObjId(resource._error)}`;
  }
};

// TODO: to remove - serializers v1
export const parseResourceReturn = <T>(data: string): ResourceReturnInternal<T> => {
  const [first, id] = data.split(' ');
  const result = _createResourceReturn<T>();
  result.value = Promise.resolve() as any;
  if (first === '0') {
    result._state = 'resolved';
    result._resolved = id as any;
    result.loading = false;
  } else if (first === '1') {
    result._state = 'pending';
    result.value = new Promise(() => {});
    result.loading = true;
  } else if (first === '2') {
    result._state = 'rejected';
    result._error = id as any;
    result.loading = false;
  }
  return result;
};
