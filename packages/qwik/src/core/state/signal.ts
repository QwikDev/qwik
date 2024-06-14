import { assertEqual, assertTrue } from '../error/assert';
import { tryGetInvokeContext } from '../use/use-core';
import { logWarn } from '../util/log';
import { qDev, qSerialize } from '../util/qdev';
import { ComputedEvent, RenderEvent, ResourceEvent } from '../util/markers';
import { isObject } from '../util/types';
import type { ContainerState } from '../container/container';
import {
  getSubscriptionManager,
  getProxyTarget,
  LocalSubscriptionManager,
  type Subscriptions,
  verifySerializable,
} from './common';
import { QObjectManagerSymbol, _IMMUTABLE, _IMMUTABLE_PREFIX } from './constants';
import { _fnSignal } from '../qrl/inlined-fn';

/**
 * A signal is a reactive value which can be read and written. When the signal is written, all tasks
 * which are tracking the signal will be re-run and all components that read the signal will be
 * re-rendered.
 *
 * Furthermore, when a signal value is passed as a prop to a component, the optimizer will
 * automatically forward the signal. This means that `return <div title={signal.value}>hi</div>`
 * will update the `title` attribute when the signal changes without having to re-render the
 * component.
 *
 * @public
 */
export interface Signal<T = any> {
  value: T;
}

/** @public */
export type ReadonlySignal<T = unknown> = Readonly<Signal<T>>;

/** @public */
export type ValueOrSignal<T> = T | Signal<T>;

/** @internal */
export const _createSignal = <T>(
  value: T,
  containerState: ContainerState,
  flags: number,
  subscriptions?: Subscriptions[]
): SignalInternal<T> => {
  const manager = containerState.$subsManager$.$createManager$(subscriptions);
  const signal = new SignalImpl<T>(value, manager, flags);
  return signal;
};

export const QObjectSignalFlags = Symbol('proxy manager');

export const SIGNAL_IMMUTABLE = 1 << 0;
export const SIGNAL_UNASSIGNED = 1 << 1;

export const SignalUnassignedException = Symbol('unassigned signal');

export interface SignalInternal<T> extends Signal<T> {
  untrackedValue: T;
  [QObjectManagerSymbol]: LocalSubscriptionManager;
  [QObjectSignalFlags]: number;
}

export class SignalBase {}

export class SignalImpl<T> extends SignalBase implements Signal<T> {
  untrackedValue: T;
  [QObjectManagerSymbol]: LocalSubscriptionManager;
  [QObjectSignalFlags]: number = 0;

  constructor(v: T, manager: LocalSubscriptionManager, flags: number) {
    super();
    this.untrackedValue = v;
    this[QObjectManagerSymbol] = manager;
    this[QObjectSignalFlags] = flags;
  }

  // prevent accidental use as value
  valueOf() {
    if (qDev) {
      throw new TypeError('Cannot coerce a Signal, use `.value` instead');
    }
  }
  toString() {
    return `[Signal ${String(this.value)}]`;
  }
  toJSON() {
    return { value: this.value };
  }

  get value() {
    if (this[QObjectSignalFlags] & SIGNAL_UNASSIGNED) {
      throw SignalUnassignedException;
    }
    const sub = tryGetInvokeContext()?.$subscriber$;
    if (sub) {
      this[QObjectManagerSymbol].$addSub$(sub);
    }
    return this.untrackedValue;
  }

  set value(v: T) {
    if (qDev) {
      if (this[QObjectSignalFlags] & SIGNAL_IMMUTABLE) {
        throw new Error('Cannot mutate immutable signal');
      }
      if (qSerialize) {
        verifySerializable(v);
      }
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx) {
        if (invokeCtx.$event$ === RenderEvent) {
          logWarn(
            'State mutation inside render function. Use useTask$() instead.',
            invokeCtx.$hostElement$
          );
        } else if (invokeCtx.$event$ === ComputedEvent) {
          logWarn(
            'State mutation inside useComputed$() is an antipattern. Use useTask$() instead',
            invokeCtx.$hostElement$
          );
        } else if (invokeCtx.$event$ === ResourceEvent) {
          logWarn(
            'State mutation inside useResource$() is an antipattern. Use useTask$() instead',
            invokeCtx.$hostElement$
          );
        }
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

export class SignalDerived<RETURN = unknown, ARGS extends any[] = unknown[]> extends SignalBase {
  constructor(
    public $func$: (...args: ARGS) => RETURN,
    public $args$: ARGS,
    public $funcStr$?: string
  ) {
    super();
  }

  get value(): RETURN {
    return this.$func$.apply(undefined, this.$args$);
  }
}

export class SignalWrapper<T extends Record<string, any>, P extends keyof T> extends SignalBase {
  constructor(
    public ref: T,
    public prop: P
  ) {
    super();
  }

  get [QObjectManagerSymbol]() {
    return getSubscriptionManager(this.ref);
  }

  get value(): T[P] {
    return this.ref[this.prop];
  }

  set value(value: T[P]) {
    this.ref[this.prop] = value;
  }
}

/**
 * Checks if a given object is a `Signal`.
 *
 * @param obj - The object to check if `Signal`.
 * @returns Boolean - True if the object is a `Signal`.
 * @public
 */
export const isSignal = <T = unknown>(obj: any): obj is Signal<T> => {
  return obj instanceof SignalBase;
};

/** @internal */
export const _wrapProp = <T extends Record<any, any>, P extends keyof T>(obj: T, prop: P): any => {
  if (!isObject(obj)) {
    return obj[prop];
  }
  if (obj instanceof SignalBase) {
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
  return _IMMUTABLE;
};

/** @internal */
export const _wrapSignal = <T extends Record<any, any>, P extends keyof T>(
  obj: T,
  prop: P
): any => {
  const r = _wrapProp(obj, prop);
  if (r === _IMMUTABLE) {
    return obj[prop];
  }
  return r;
};
