import { getStoreTarget, isStore } from '../../reactive-primitives/impl/store';
import { SubscriptionData } from '../../reactive-primitives/subscription-data';
import { NEEDS_COMPUTATION, STORE_ALL_PROPS } from '../../reactive-primitives/types';
import { untrack } from '../../use/use-core';
import { isTask } from '../../use/use-task';
import { isQwikComponent } from '../component.public';
import { isJSXNode } from '../jsx/jsx-node';
import { isPropsProxy } from '../jsx/props-proxy';
import { Slot } from '../jsx/slot.public';
import { isQrl } from '../qrl/qrl-utils';
import { _UNINITIALIZED } from '../utils/constants';
import { isPromise } from '../utils/promises';
import { isDomRef } from './serialization-context';
// Keep last
import { Fragment } from '../jsx/jsx-runtime';

export const canSerialize = (value: any, seen: WeakSet<any> = new WeakSet()): boolean => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  } else if (typeof value === 'object') {
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (isStore(value)) {
      value = getStoreTarget(value);
    }
    if (proto == Object.prototype) {
      for (const key in value) {
        // if the value is a props proxy, then sometimes we could create a component-level subscription,
        // so we should call untrack here to avoid tracking the value
        if (
          !canSerialize(
            untrack(() => value[key]),
            seen
          )
        ) {
          return false;
        }
      }
      return true;
    } else if (proto == Array.prototype) {
      for (let i = 0; i < value.length; i++) {
        if (!canSerialize(value[i], seen)) {
          return false;
        }
      }
      return true;
    } else if (isTask(value)) {
      return true;
    } else if (isPropsProxy(value)) {
      return true;
    } else if (isPromise(value)) {
      return true;
    } else if (isJSXNode(value)) {
      return true;
    } else if (value instanceof Error) {
      return true;
    } else if (value instanceof URL) {
      return true;
    } else if (value instanceof Date) {
      return true;
    } else if (value instanceof RegExp) {
      return true;
    } else if (value instanceof URLSearchParams) {
      return true;
    } else if (value instanceof FormData) {
      return true;
    } else if (value instanceof Set) {
      return true;
    } else if (value instanceof Map) {
      return true;
    } else if (value instanceof Uint8Array) {
      return true;
    } else if (value instanceof SubscriptionData) {
      return true;
    } else if (isDomRef?.(value)) {
      return true;
    }
  } else if (typeof value === 'function') {
    if (isQrl(value) || isQwikComponent(value) || value === Slot || value === Fragment) {
      return true;
    }
  } else if (value === _UNINITIALIZED || value === NEEDS_COMPUTATION || value === STORE_ALL_PROPS) {
    return true;
  }
  return false;
};
