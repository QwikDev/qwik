import { assertEqual, assertTrue } from '../error/assert';
import { tryGetInvokeContext } from '../use/use-core';
import { logWarn } from '../util/log';
import { qDev } from '../util/qdev';
import { RenderEvent } from '../util/markers';
import { isObject } from '../util/types';
import type { ContainerState } from '../container/container';
import type { QwikElement } from '../render/dom/virtual-element';
import {
  getProxyManager,
  getProxyTarget,
  LocalSubscriptionManager,
  Subscriptions,
  verifySerializable,
} from './common';
import { QObjectManagerSymbol, _IMMUTABLE, _IMMUTABLE_PREFIX } from './constants';

/**
 * @alpha
 */
export interface Signal<T = any> {
  value: T;
}

/**
 * @alpha
 */
export type ValueOrSignal<T> = T | Signal<T>;

/**
 * @internal
 */
export const _createSignal = <T>(
  value: T,
  containerState: ContainerState,
  subcriptions?: Subscriptions[]
): Signal<T> => {
  const manager = containerState.$subsManager$.$createManager$(subcriptions);
  const signal = new SignalImpl<T>(value, manager);
  return signal;
};

export class SignalImpl<T> implements Signal<T> {
  untrackedValue: T;
  [QObjectManagerSymbol]: LocalSubscriptionManager;

  constructor(v: T, manager: LocalSubscriptionManager) {
    this.untrackedValue = v;
    this[QObjectManagerSymbol] = manager;
  }

  // prevent accidental use as value
  valueOf() {
    throw new TypeError('Cannot coerce a Signal, use `.value` instead');
  }
  toString() {
    return `[Signal ${String(this.value)}]`;
  }
  toJSON() {
    return { value: this.value };
  }

  get value() {
    const sub = tryGetInvokeContext()?.$subscriber$;
    if (sub) {
      this[QObjectManagerSymbol].$addSub$([0, sub, undefined]);
    }
    return this.untrackedValue;
  }
  set value(v: T) {
    if (qDev) {
      verifySerializable(v);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.$event$ === RenderEvent) {
        logWarn(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
          invokeCtx.$hostElement$
        );
      }
    }
    const manager = this[QObjectManagerSymbol];
    const oldValue = this.untrackedValue;
    if (manager && oldValue !== v) {
      this.untrackedValue = v;
      manager.$notifySubs$();
    }
  }
}

export const isSignal = (obj: any): obj is Signal<any> => {
  return obj instanceof SignalImpl || obj instanceof SignalWrapper;
};

interface AddSignal {
  (type: 1, hostEl: QwikElement, signal: Signal, elm: QwikElement, property: string): void;
  (type: 2, hostEl: QwikElement, signal: Signal, elm: Node | string, property: string): void;
}
export const addSignalSub: AddSignal = (type, hostEl, signal, elm, property) => {
  const subscription =
    signal instanceof SignalWrapper
      ? [
          type,
          hostEl,
          getProxyTarget(signal.ref),
          elm as any,
          property,
          signal.prop === 'value' ? undefined : signal.prop,
        ]
      : [type, hostEl, signal, elm, property, undefined];
  getProxyManager(signal)!.$addSub$(subscription as any);
};

export class SignalWrapper<T extends Record<string, any>, P extends keyof T> {
  constructor(public ref: T, public prop: P) {}

  get [QObjectManagerSymbol]() {
    return getProxyManager(this.ref);
  }

  get value(): T[P] {
    return this.ref[this.prop];
  }

  set value(value: T[P]) {
    this.ref[this.prop] = value;
  }
}

/**
 * @internal
 */
export const _wrapSignal = <T extends Record<any, any>, P extends keyof T>(
  obj: T,
  prop: P
): any => {
  if (!isObject(obj)) {
    return obj[prop];
  }
  if (obj instanceof SignalImpl) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    return obj;
  }
  if (obj instanceof SignalWrapper) {
    assertEqual(prop, 'value', 'Left side is a signal, prop must be value');
    return obj;
  }
  const target = getProxyTarget(obj);
  if (target) {
    const signal = target[_IMMUTABLE_PREFIX + (prop as any)];
    if (signal) {
      assertTrue(isSignal(signal), `${_IMMUTABLE_PREFIX} has to be a signal kind`);
      return signal;
    }
    if ((target as any)[_IMMUTABLE]?.[prop] !== true) {
      return new SignalWrapper(obj, prop);
    }
  }
  const immutable = (obj as any)[_IMMUTABLE]?.[prop];
  if (isSignal(immutable)) {
    return immutable;
  }
  return obj[prop];
};
