import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import { SsrDomSubscription } from '../../vdomless/dom/effect/ssr-effect';
import { ComputedQrl } from '../../vdomless/reactive/computed-qrl';
import { Signal } from '../../vdomless/reactive/signal';
import { isStore, StorePropSource } from '../../vdomless/reactive/store';
import { isQrl } from '../qrl/qrl-utils';
import { _UNINITIALIZED } from '../utils/constants';
import { isPromise } from '../utils/promises';

export const canSerialize = (value: unknown, seen: WeakSet<any> = new WeakSet()): boolean => {
  const hasTemporal = typeof Temporal !== 'undefined';
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
    if (isStore(value) || value instanceof StorePropSource) {
      return true;
    }
    const proto = Object.getPrototypeOf(value);
    if (proto == Object.prototype) {
      for (const key in value as object) {
        if (!canSerialize((value as Record<string, unknown>)[key], seen)) {
          return false;
        }
      }
      return true;
    } else if (proto == Array.prototype) {
      for (let i = 0; i < (value as unknown[]).length; i++) {
        // ignore sparse array holes
        if (!(i in (value as unknown[]))) {
          return false;
        }
        if (!canSerialize((value as unknown[])[i], seen)) {
          return false;
        }
      }
      return true;
    } else if (isPromise(value)) {
      return true;
    } else if (value instanceof Signal) {
      return true;
    } else if (value instanceof ComputedQrl) {
      return true;
    } else if (value instanceof SsrDomSubscription) {
      return true;
    } else if (value instanceof Error) {
      return true;
    } else if (value instanceof URL) {
      return true;
    } else if (value instanceof Date) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.Duration) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.Instant) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.PlainDate) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.PlainDateTime) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.PlainMonthDay) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.PlainTime) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.PlainYearMonth) {
      return true;
    } else if (hasTemporal && value instanceof Temporal.ZonedDateTime) {
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
    }
  } else if (typeof value === 'function') {
    if (isQrl(value)) {
      return true;
    }
  } else if (value === _UNINITIALIZED || value === NEEDS_COMPUTATION) {
    return true;
  }
  return false;
};
