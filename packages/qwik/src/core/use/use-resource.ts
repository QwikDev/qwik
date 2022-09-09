import { createProxy, getProxyTarget } from '../object/q-object';
import { getContext } from '../props/props';
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
import { Fragment, jsx } from '../render/jsx/jsx-runtime';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { qDev } from '../util/qdev';
import { isServer } from '../platform/platform';
import { useBindInvokeContext } from './use-core';

import { isObject } from '../util/types';
import type { GetObjID } from '../object/store';
import type { ContainerState } from '../render/container';
import { useSequentialScope } from './use-sequential-scope';

/**
 * @public
 */
export interface ResourceOptions {
  // Timeout in milliseconds
  timeout?: number;
}

/**
 * @public
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

  const containerState = ctx.$renderCtx$.$static$.$containerState$;
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
  const elCtx = getContext(el);
  runResource(watch, containerState, previousWait);
  if (!elCtx.$watches$) {
    elCtx.$watches$ = [];
  }
  elCtx.$watches$.push(watch);
  set(resource);

  return resource;
};

/**
 * @public
 */
export const useResource$ = <T>(
  generatorFn: ResourceFn<T>,
  opts?: ResourceOptions
): ResourceReturn<T> => {
  return useResourceQrl<T>($(generatorFn), opts);
};

/**
 * @public
 */
export interface ResourceProps<T> {
  value: ResourceReturn<T>;
  onResolved: (value: T) => JSXNode;
  onPending?: () => JSXNode;
  onRejected?: (reason: any) => JSXNode;
}

/**
 * @public
 */
export const Resource = <T>(props: ResourceProps<T>): JSXNode => {
  const isBrowser = !qDev || !isServer();
  if (isBrowser) {
    if (props.onRejected) {
      props.value.promise.catch(() => {});
      if (props.value.state === 'rejected') {
        return props.onRejected(props.value.error);
      }
    }
    if (props.onPending) {
      const state = props.value.state;
      if (state === 'pending') {
        return props.onPending();
      } else if (state === 'resolved') {
        return props.onResolved(props.value.resolved);
      }
    }
  }

  const promise: any = props.value.promise.then(
    useBindInvokeContext(props.onResolved),
    useBindInvokeContext(props.onRejected)
  );
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

export const getInternalResource = <T>(resource: ResourceReturn<T>): ResourceReturnInternal<T> => {
  return getProxyTarget(resource) as any;
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
    return `2 ${getObjId(resource.error)}`;
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
    result.error = id as any;
  }
  return result;
};
