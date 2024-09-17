import { pad, qwikDebugToString } from '../../debug';
import { assertTrue } from '../../error/assert';
import { _wrapProp } from '../../state/signal';
import { tryGetInvokeContext } from '../../use/use-core';
import { isSerializableObject } from '../../util/types';
import { SERIALIZER_PROXY_UNWRAP, unwrapDeserializerProxy } from '../shared/shared-serialization';
import type { Container2, fixMeAny } from '../shared/types';
import {
  ensureContains,
  ensureContainsEffect,
  triggerEffects,
  type EffectSubscriptions,
} from './v2-signal';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('STORE', ...args.map(qwikDebugToString));

export const storeWeakMap = new WeakMap<object, any>();

const STORE_TARGET = Symbol('store.target');
const STORE_HANDLER = Symbol('store.handler');
export const STORE_ARRAY_PROP = Symbol('store.array');

export type TargetType = Record<string | symbol, any>;

export const enum Store2Flags {
  NONE = 0,
  RECURSIVE = 1,
  IMMUTABLE = 2,
}

export const getStoreHandler2 = (value: TargetType): StoreHandler | null => {
  return value[STORE_HANDLER] as StoreHandler | null;
};

export const getStoreTarget2 = <T extends TargetType>(value: T): T | null => {
  return value?.[STORE_TARGET] || null;
};

export const unwrapStore2 = <T>(value: T): T => {
  return getStoreTarget2<any>(value) || value;
};

export const isStore2 = (value: TargetType): boolean => {
  const unwrap = unwrapStore2(value);
  return unwrap !== value;
};

export function createStore2<T extends object>(
  container: Container2 | null | undefined,
  obj: T,
  flags: Store2Flags
): T {
  return new Proxy(obj, new StoreHandler(flags, container || null)) as T;
}

export const getOrCreateStore2 = <T extends object>(
  obj: T,
  flags: Store2Flags,
  container?: Container2 | null
): T => {
  if (isSerializableObject(obj)) {
    let store: T | undefined = storeWeakMap.get(obj);
    if (!store) {
      store = createStore2(container, obj, flags);
      storeWeakMap.set(obj, store);
    }
    return store;
  }
  return obj;
};

export class StoreHandler implements ProxyHandler<TargetType> {
  $effects$: null | Record<string | symbol, EffectSubscriptions[]> = null;

  constructor(
    public $flags$: Store2Flags,
    public $container$: Container2 | null
  ) {}

  toString(): string {
    return '[Store]';
  }

  get(target: TargetType, prop: string | symbol) {
    if (typeof prop === 'symbol') {
      if (prop === STORE_TARGET) {
        return target;
      }
      if (prop === STORE_HANDLER) {
        return this;
      }
      if (prop === SERIALIZER_PROXY_UNWRAP) {
        // SERIALIZER_PROXY_UNWRAP is used by v2 serialization to unwrap proxies.
        // Our target may be a v2 serialization proxy so if we let it through
        // we will return the naked object which removes ourselves,
        // and that is not the intention so prevent of SERIALIZER_PROXY_UNWRAP.
        return undefined;
      }
      return target[prop];
    }
    const ctx = tryGetInvokeContext();
    let value = target[prop];
    if (ctx) {
      if (this.$container$ === null) {
        if (!ctx.$container2$) {
          return value;
        }
        // Grab the container now we have access to it
        this.$container$ = ctx.$container2$;
      } else {
        assertTrue(
          !ctx.$container2$ || ctx.$container2$ === this.$container$,
          'Do not use signals across containers'
        );
      }
      const effectSubscriber = ctx.$effectSubscriber$;
      if (effectSubscriber) {
        addEffect(target, Array.isArray(target) ? STORE_ARRAY_PROP : prop, this, effectSubscriber);
      }
    }

    if (prop === 'toString' && value === Object.prototype.toString) {
      return this.toString;
    }

    const flags = this.$flags$;
    if (
      flags & Store2Flags.RECURSIVE &&
      typeof value === 'object' &&
      value !== null &&
      !Object.isFrozen(value) &&
      !isStore2(value) &&
      !Object.isFrozen(target)
    ) {
      value = getOrCreateStore2(value, this.$flags$, this.$container$);
      (target as Record<string | symbol, any>)[prop] = value;
    }
    return value;
  }

  /** In the case of oldValue and value are the same, the effects are not triggered. */
  set(target: TargetType, prop: string | symbol, value: any): boolean {
    target = unwrapDeserializerProxy(target) as TargetType;
    if (typeof prop === 'symbol') {
      target[prop] = value;
      return true;
    }
    const newValue = this.$flags$ & Store2Flags.RECURSIVE ? unwrapStore2(value) : value;
    if (prop in target) {
      const oldValue = target[prop];

      if (newValue !== oldValue) {
        DEBUG && log('Signal.set', oldValue, '->', newValue, pad('\n' + this.toString(), '  '));
        setNewValueAndTriggerEffects(prop, newValue, target, this);
      }
    } else {
      DEBUG && log('Signal.set', 'create property', newValue, pad('\n' + this.toString(), '  '));
      setNewValueAndTriggerEffects(prop, newValue, target, this);
    }
    return true;
  }

  deleteProperty(target: TargetType, prop: string | symbol): boolean {
    if (typeof prop != 'string' || !delete target[prop]) {
      return false;
    }
    return true;
  }

  has(target: TargetType, prop: string | symbol) {
    if (prop === STORE_TARGET) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(target, prop);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    const ctx = tryGetInvokeContext();
    const effectSubscriber = ctx?.$effectSubscriber$;
    if (effectSubscriber) {
      addEffect(target, STORE_ARRAY_PROP, this, effectSubscriber);
    }
    return Reflect.ownKeys(target);
  }

  getOwnPropertyDescriptor(
    target: TargetType,
    prop: string | symbol
  ): PropertyDescriptor | undefined {
    if (Array.isArray(target) || typeof prop === 'symbol') {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return {
      enumerable: true,
      configurable: true,
    };
  }
}

function addEffect<T extends Record<string | symbol, any>>(
  target: T,
  prop: string | symbol,
  store: StoreHandler,
  effectSubscriber: EffectSubscriptions
) {
  const effectsMap = (store.$effects$ ||= {});
  const effects =
    (Object.prototype.hasOwnProperty.call(effectsMap, prop) && effectsMap[prop as fixMeAny]) ||
    (effectsMap[prop] = []);
  // Let's make sure that we have a reference to this effect.
  // Adding reference is essentially adding a subscription, so if the signal
  // changes we know who to notify.
  ensureContainsEffect(effects, effectSubscriber);
  // But when effect is scheduled in needs to be able to know which signals
  // to unsubscribe from. So we need to store the reference from the effect back
  // to this signal.
  ensureContains(effectSubscriber, target);

  DEBUG && log('sub', pad('\n' + store.$effects$.toString(), '  '));
}

function setNewValueAndTriggerEffects<T extends Record<string | symbol, any>>(
  prop: string | symbol,
  value: any,
  target: T,
  currentStore: StoreHandler
): void {
  (target as any)[prop] = value;
  triggerEffects(
    currentStore.$container$,
    currentStore,
    getEffects(target, prop, currentStore.$effects$)
  );
}

function getEffects<T extends Record<string | symbol, any>>(
  target: T,
  prop: string | symbol,
  storeEffects: Record<string | symbol, EffectSubscriptions[]> | null
) {
  let effectsToTrigger = storeEffects
    ? Array.isArray(target)
      ? Object.values(storeEffects).flatMap((effects) => effects)
      : storeEffects[prop]
    : null;
  const storeArrayValue = storeEffects?.[STORE_ARRAY_PROP as fixMeAny];
  if (storeArrayValue) {
    effectsToTrigger ||= [];
    effectsToTrigger.push(...storeArrayValue);
  }
  return effectsToTrigger;
}
