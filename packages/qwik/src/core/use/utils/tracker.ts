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
import { noSerialize } from '../../shared/serdes/verify';
import type { Container } from '../../shared/types';
import { isFunction, isObject } from '../../shared/utils/types';
import { invoke, newInvokeContext } from '../use-core';
import { type Tracker } from '../use-task';
import type { Destroyable } from './destroyable';

export const trackFn =
  (target: Consumer, container: Container | null): Tracker =>
  (obj: (() => unknown) | object | Signal<unknown>, prop?: string) => {
    const ctx = newInvokeContext();
    ctx.$effectSubscriber$ = getSubscriber(target, EffectProperty.COMPONENT);
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
        addStoreEffect(
          getStoreTarget(obj)!,
          STORE_ALL_PROPS,
          getStoreHandler(obj)!,
          ctx.$effectSubscriber$!
        );
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
export const cleanupFn = <T extends Destroyable>(
  target: T,
  handleError: (err: unknown) => void
): [(callback: () => void) => void, (() => void)[]] => {
  let cleanupFns: (() => void)[] | null = null;
  const cleanup = (fn: () => void) => {
    if (typeof fn == 'function') {
      if (!cleanupFns) {
        cleanupFns = [];
        target.$destroy$ = noSerialize(() => {
          target.$destroy$ = null;
          // TODO handle promises
          for (const fn of cleanupFns!) {
            try {
              fn();
            } catch (err) {
              handleError(err);
            }
          }
        });
      }
      cleanupFns.push(fn);
    }
  };
  return [cleanup, cleanupFns ?? []];
};
