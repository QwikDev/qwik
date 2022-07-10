import { createProxy } from '../object/q-object';
import { getContext } from '../props/props';
import { useSequentialScope } from './use-store.public';
import { $, QRL } from '../import/qrl.public';
import { assertQrl } from '../import/qrl-class';
import {
  Resource,
  ResourceDescriptor,
  ResourceFn,
  runResource,
  WatchFlagsIsDirty,
  WatchFlagsIsResource,
} from './use-watch';
import { assertDefined } from '../assert/assert';
import { Fragment, jsx } from '../render/jsx/jsx-runtime';
import type { JSXNode } from '../render/jsx/types/jsx-node';
import { qDev } from '../util/qdev';
import { getPlatform } from '../platform/platform';
import { getInvokeContext } from './use-core';

/**
 * @alpha
 */
export const useResourceQrl = <T>(qrl: QRL<ResourceFn<T>>): Resource<T> => {
  const { get, set, i, ctx } = useSequentialScope<Resource<T>>();
  if (get != null) {
    return get;
  }
  assertQrl(qrl);

  const containerState = ctx.$renderCtx$.$containerState$;
  const result: Resource<T> = {
    promise: undefined as never,
    resolved: undefined as never,
    error: undefined as never,
    state: 'pending',
  };
  const resource = createProxy(result, containerState, 0, undefined);
  const el = ctx.$hostElement$;
  const watch: ResourceDescriptor<T> = {
    qrl,
    el,
    f: WatchFlagsIsDirty | WatchFlagsIsResource,
    i,
    r: resource,
  };
  const previousWait = Promise.all(ctx.$waitOn$.slice());
  runResource(watch, containerState, previousWait);
  getContext(el).$watches$.push(watch);
  assertDefined(result.promise, `useResource: resource.promise must be defined ${result}`);
  set(resource);

  return resource;
};

/**
 * @alpha
 */
export const useResource$ = <T>(generatorFn: ResourceFn<T>): Resource<T> => {
  return useResourceQrl<T>($(generatorFn));
};

export const useIsServer = () => {
  const ctx = getInvokeContext();
  assertDefined(ctx.$doc$, 'doc must be defined');
  return getPlatform(ctx.$doc$).isServer;
};

/**
 * @alpha
 */
export interface AsyncProps<T> {
  resource: Resource<T>;
  onResolved: (value: T) => JSXNode;
  onPending?: () => JSXNode;
  onRejected?: (reason: any) => JSXNode;
}

/**
 * @alpha
 */
export const Async = <T>(props: AsyncProps<T>): JSXNode => {
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

  // Async path
  return jsx(Fragment, {
    children: props.resource.promise.then(props.onResolved, props.onRejected),
  });
};
