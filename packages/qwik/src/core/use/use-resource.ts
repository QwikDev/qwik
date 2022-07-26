import { createProxy, getProxyTarget } from '../object/q-object';
import { getContext } from '../props/props';
import { useSequentialScope } from './use-store.public';
import { $, QRL } from '../import/qrl.public';
import { assertQrl } from '../import/qrl-class';
import {
  ResourceReturn,
  ResourceDescriptor,
  ResourceFn,
  runResource,
  WatchFlagsIsDirty,
  WatchFlagsIsResource,
  ResourceReturnInternal,
  Watch,
} from './use-watch';
import { assertDefined } from '../assert/assert';
import { Fragment, jsx } from '../render/jsx/jsx-runtime';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { qDev } from '../util/qdev';
import { isServer } from '../platform/platform';
import { getInvokeContext } from './use-core';
import type { ContainerState } from '../render/notify-render';

import { isObject } from '../util/types';
import type { GetObjID } from '../object/store';

export const _createResourceReturn = <T>(opts?: ResourceOptions): ResourceReturn<T> => {
  const resource: ResourceReturn<T> = {
    __brand: 'resource',
    promise: undefined as never,
    resolved: undefined as never,
    error: undefined as never,
    state: 'pending',
    timeout: opts?.timeout,
  };
  return resource;
};

export const createResourceReturn = <T>(
  containerState: ContainerState,
  opts?: ResourceOptions,
  initialPromise?: Promise<T>
): ResourceReturn<T> => {
  const result = _createResourceReturn<T>(opts);
  result.promise = initialPromise as any;
  const resource = createProxy(result, containerState, 0, undefined);
  return resource;
};

/**
 * @alpha
 */
export interface ResourceOptions {
  // Timeout in milliseconds
  timeout?: number;
}

/**
 * @alpha
 */
export const useResourceQrl = <T>(
  qrl: QRL<ResourceFn<T>>,
  opts?: ResourceOptions
): ResourceReturn<T> => {
  const { get, set, i, ctx } = useSequentialScope<ResourceReturn<T>>();
  if (get != null) {
    return get;
  }
  assertQrl(qrl);

  const containerState = ctx.$renderCtx$.$containerState$;
  const resource = createResourceReturn<T>(containerState, opts);
  const el = ctx.$hostElement$;
  const watch = new Watch(
    WatchFlagsIsDirty | WatchFlagsIsResource,
    i,
    el,
    qrl,
    resource
  ) as ResourceDescriptor<any>;
  const previousWait = Promise.all(ctx.$waitOn$.slice());
  runResource(watch, containerState, previousWait);
  getContext(el).$watches$.push(watch);
  set(resource);

  return resource;
};

/**
 * @alpha
 */
export const useResource$ = <T>(generatorFn: ResourceFn<T>): ResourceReturn<T> => {
  return useResourceQrl<T>($(generatorFn));
};

export const useIsServer = () => {
  const ctx = getInvokeContext();
  assertDefined(ctx.$doc$, 'doc must be defined', ctx);
  return isServer(ctx.$doc$);
};

/**
 * @alpha
 */
export interface ResourceProps<T> {
  resource: ResourceReturn<T>;
  onResolved: (value: T) => JSXNode;
  onPending?: () => JSXNode;
  onRejected?: (reason: any) => JSXNode;
}

export const getInternalResource = <T>(resource: ResourceReturn<T>): ResourceReturnInternal<T> => {
  return getProxyTarget(resource) as any;
};

/**
 * @alpha
 */
export const Resource = <T>(props: ResourceProps<T>): JSXNode => {
  const isBrowser = !qDev || !useIsServer();
  if (isBrowser) {
    if (props.onRejected) {
      props.resource.promise.catch(() => {});
      if (props.resource.state === 'rejected') {
        return props.onRejected(props.resource.error);
      }
    }
    if (props.onPending) {
      const state = props.resource.state;
      if (state === 'pending') {
        return props.onPending();
      } else if (state === 'resolved') {
        return props.onResolved(props.resource.resolved);
      }
    }
  }

  const promise: any = props.resource.promise.then(props.onResolved, props.onRejected);
  // if (isServer) {
  //   const onPending = props.onPending;
  //   if (props.ssrWait && onPending) {
  //     promise = Promise.race([
  //       delay(props.ssrWait).then(() => {
  //         getInternalResource(props.resource).dirty = true;
  //         return onPending();
  //       }),
  //       promise,
  //     ]);
  //   }
  // }

  // Resource path
  return jsx(Fragment, {
    children: promise,
  });
};

export const isResourceReturn = (obj: any): obj is ResourceReturn<any> => {
  return isObject(obj) && obj.__brand === 'resource';
};

export const serializeResource = (resource: ResourceReturn<any>, getObjId: GetObjID) => {
  const state = resource.state;
  if (state === 'resolved') {
    return `0 ${getObjId(resource.resolved)}`;
  } else if (state === 'pending') {
    return `1`;
  } else {
    return `2`;
  }
};

export const parseResourceReturn = <T>(data: string): ResourceReturn<T> => {
  const [first, id] = data.split(' ');
  const result = _createResourceReturn<T>(undefined);
  result.promise = Promise.resolve() as any;
  if (first === '0') {
    result.state = 'resolved';
    result.resolved = id as any;
  } else if (first === '1') {
    result.state = 'pending';
    result.promise = new Promise(() => {});
  } else if (first === '2') {
    result.state = 'rejected';
    result.promise = Promise.reject();
  }
  return result;
};
