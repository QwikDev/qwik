import {
  addStoreEffect,
  getStoreHandler,
  getStoreTarget,
  isStore,
} from '../../reactive-primitives/impl/store';
import type { Signal } from '../../reactive-primitives/signal.public';
import { getSubscriber } from '../../reactive-primitives/subscriber';
import { EffectProperty, STORE_ALL_PROPS, type Consumer } from '../../reactive-primitives/types';
import { isSignal } from '../../reactive-primitives/utils';
import { qError, QError } from '../../shared/error/error';
import type { Container } from '../../shared/types';
import { isPromise, safeCall } from '../../shared/utils/promises';
import { isFunction, isObject, type ValueOrPromise } from '../../shared/utils/types';
import { invoke, newInvokeContext } from '../use-core';
import { type Tracker } from '../use-task';
import type { Destroyable } from './destroyable';

export const trackFn =
  (target: Consumer, container: Container | null, isCurrent?: () => boolean): Tracker =>
  (obj: (() => unknown) | object | Signal<unknown>, prop?: string) => {
    const ctx = newInvokeContext();
    if (!isCurrent || isCurrent()) {
      ctx.$effectSubscriber$ = getSubscriber(target, EffectProperty.COMPONENT);
    }
    ctx.$container$ = container || undefined;
    return invoke(ctx, () => {
      if (isFunction(obj)) {
        return obj();
      }
      if (prop) {
        return (obj as Record<string, unknown>)[prop];
      } else if (isSignal(obj)) {
        return obj.value;
      } else if (isObject(obj) && isStore(obj)) {
        // TODO: handle props proxy
        // track whole store
        if (ctx.$effectSubscriber$) {
          addStoreEffect(
            getStoreTarget(obj)!,
            STORE_ALL_PROPS,
            getStoreHandler(obj)!,
            ctx.$effectSubscriber$
          );
        }
        return obj;
      } else {
        throw qError(QError.trackObjectWithoutProp);
      }
    });
  };

/**
 * This adds $destroy$ to the target if a cleanup function is registered. It must be called before
 * running any computations again.
 */
export const cleanupFn = (
  target: Destroyable,
  handleError: (err: unknown) => void,
  isCurrent: () => boolean
) => {
  let cleanupFns: (() => ValueOrPromise<void>)[] | null = null;
  const runCleanup = (fn: () => ValueOrPromise<void>) => safeCall(fn, () => undefined, handleError);
  return (fn: () => ValueOrPromise<void>) => {
    if (typeof fn == 'function') {
      if (!isCurrent()) {
        return runCleanup(fn);
      }
      if (!cleanupFns) {
        cleanupFns = [];
        target.$destroy$ = () => {
          target.$destroy$ = null;
          let cleanupPromises: Promise<void>[] | null = null;
          for (let i = 0; i < cleanupFns!.length; i++) {
            const result = runCleanup(cleanupFns![i]);
            if (isPromise(result)) {
              (cleanupPromises ||= []).push(result);
            }
          }
          cleanupFns = null;
          if (cleanupPromises?.length) {
            return Promise.all(cleanupPromises).then(() => undefined);
          }
        };
      }
      cleanupFns.push(fn);
    }
  };
};
