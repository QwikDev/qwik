import { pad, qwikDebugToString } from '../debug';
import { assertTrue } from '../shared/error/assert';
import { tryGetInvokeContext } from '../use/use-core';
import { isSerializableObject } from '../shared/utils/types';
import type { Container } from '../shared/types';
import {
  EffectSubscriptionsProp,
  addQrlToSerializationCtx,
  ensureContains,
  ensureContainsEffect,
  ensureEffectContainsSubscriber,
  triggerEffects,
  type EffectSubscriptions,
} from './signal';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('STORE', ...args.map(qwikDebugToString));

const STORE_TARGET = Symbol('store.target');
const STORE_HANDLER = Symbol('store.handler');
export const STORE_ARRAY_PROP = Symbol('store.array');

export type TargetType = Record<string | symbol, any>;

export const enum StoreFlags {
  NONE = 0,
  RECURSIVE = 1,
  IMMUTABLE = 2,
}

export const getStoreHandler = (value: TargetType): StoreHandler | null => {
  return value[STORE_HANDLER] as StoreHandler | null;
};

export const getStoreTarget = <T extends TargetType>(value: T): T | null => {
  return value?.[STORE_TARGET] || null;
};

/**
 * Get the original object that was wrapped by the store. Useful if you want to clone a store
 * (structuredClone, IndexedDB,...)
 *
 * @public
 */
export const unwrapStore = <T>(value: T): T => {
  return getStoreTarget<any>(value) || value;
};

export const isStore = (value: TargetType): boolean => {
  return STORE_TARGET in value;
};

export function createStore<T extends object>(
  container: Container | null | undefined,
  obj: T,
  flags: StoreFlags
): T {
  return new Proxy(obj, new StoreHandler(flags, container || null)) as T;
}

export const getOrCreateStore = <T extends object>(
  obj: T,
  flags: StoreFlags,
  container: Container | null
): T => {
  if (isSerializableObject(obj) && container) {
    let store: T | undefined = container.$storeProxyMap$.get(obj);
    if (!store) {
      store = createStore(container, obj, flags);
      container.$storeProxyMap$.set(obj, store);
    }
    return store;
  }
  return obj;
};

export class StoreHandler implements ProxyHandler<TargetType> {
  $effects$: null | Record<string | symbol, Set<EffectSubscriptions>> = null;

  constructor(
    public $flags$: StoreFlags,
    public $container$: Container | null
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
      return target[prop];
    }
    const ctx = tryGetInvokeContext();
    const value = target[prop];
    if (ctx) {
      if (this.$container$ === null) {
        if (!ctx.$container$) {
          return value;
        }
        // Grab the container now we have access to it
        this.$container$ = ctx.$container$;
      } else {
        assertTrue(
          !ctx.$container$ || ctx.$container$ === this.$container$,
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
      flags & StoreFlags.RECURSIVE &&
      typeof value === 'object' &&
      value !== null &&
      !Object.isFrozen(value) &&
      !isStore(value) &&
      !Object.isFrozen(target)
    ) {
      return getOrCreateStore(value, this.$flags$, this.$container$);
    }
    return value;
  }

  /** In the case of oldValue and value are the same, the effects are not triggered. */
  set(target: TargetType, prop: string | symbol, value: any): boolean {
    if (typeof prop === 'symbol') {
      target[prop] = value;
      return true;
    }
    const newValue = this.$flags$ & StoreFlags.RECURSIVE ? unwrapStore(value) : value;
    if (prop in target) {
      const oldValue = target[prop];

      if (newValue !== oldValue) {
        DEBUG && log('Store.set', oldValue, '->', newValue, pad('\n' + this.toString(), '  '));
        setNewValueAndTriggerEffects(prop, newValue, target, this);
      }
    } else {
      DEBUG && log('Store.set', 'create property', newValue, pad('\n' + this.toString(), '  '));
      setNewValueAndTriggerEffects(prop, newValue, target, this);
    }
    return true;
  }

  deleteProperty(target: TargetType, prop: string | symbol): boolean {
    if (typeof prop != 'string' || !delete target[prop]) {
      return false;
    }
    triggerEffects(this.$container$, this, getEffects(target, prop, this.$effects$));
    return true;
  }

  has(target: TargetType, prop: string | symbol) {
    if (prop === STORE_TARGET) {
      return true;
    }
    if (typeof prop === 'string') {
      const ctx = tryGetInvokeContext();
      if (ctx) {
        const effectSubscriber = ctx.$effectSubscriber$;
        if (effectSubscriber) {
          addEffect(
            target,
            Array.isArray(target) ? STORE_ARRAY_PROP : prop,
            this,
            effectSubscriber
          );
        }
      }
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
    const descriptor = Reflect.getOwnPropertyDescriptor(target, prop);
    if (Array.isArray(target) || typeof prop === 'symbol') {
      return descriptor;
    }
    if (descriptor && !descriptor.configurable) {
      return descriptor;
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
    (Object.prototype.hasOwnProperty.call(effectsMap, prop) && effectsMap[prop]) ||
    (effectsMap[prop] = new Set());
  // Let's make sure that we have a reference to this effect.
  // Adding reference is essentially adding a subscription, so if the signal
  // changes we know who to notify.
  ensureContainsEffect(effects, effectSubscriber);
  // But when effect is scheduled in needs to be able to know which signals
  // to unsubscribe from. So we need to store the reference from the effect back
  // to this signal.
  const isMissing = ensureContains(effectSubscriber, target);
  // We need to add the subscriber to the effect so that we can clean it up later
  ensureEffectContainsSubscriber(
    effectSubscriber[EffectSubscriptionsProp.EFFECT],
    target,
    store.$container$
  );
  addQrlToSerializationCtx(effectSubscriber, isMissing, store.$container$);

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
  storeEffects: Record<string | symbol, Set<EffectSubscriptions>> | null
) {
  let effectsToTrigger: Set<EffectSubscriptions> | null = null;

  if (storeEffects) {
    if (Array.isArray(target)) {
      for (const effects of Object.values(storeEffects)) {
        effectsToTrigger ||= new Set();
        effects.forEach((effect) => effectsToTrigger!.add(effect));
      }
    } else {
      effectsToTrigger = storeEffects[prop];
    }
  }

  const storeArrayValue = storeEffects?.[STORE_ARRAY_PROP];
  if (storeArrayValue) {
    effectsToTrigger ||= new Set();
    storeArrayValue.forEach((effect) => effectsToTrigger!.add(effect));
  }
  return effectsToTrigger;
}
