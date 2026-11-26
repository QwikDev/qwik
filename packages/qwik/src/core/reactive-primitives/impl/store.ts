import { pad, qwikDebugToString } from '../../debug';
import { qTest } from '../../shared/utils/qdev';
import { assertTrue } from '../../shared/error/assert';
import { tryGetInvokeContext } from '../../use/use-core';
import { isObject, isSerializableObject } from '../../shared/utils/types';
import type { Container } from '../../shared/types';
import { isSameContainer } from '../../shared/utils/container';
import {
  ensureContainsBackRef,
  ensureContainsSubscription,
  getEffectSerializationContainer,
  scheduleEffects,
} from '../utils';
import {
  STORE_ALL_PROPS,
  STORE_HANDLER,
  STORE_TARGET,
  StoreFlags,
  type EffectSubscription,
  type StoreTarget,
} from '../types';
import type { PropsProxy, PropsProxyHandler } from '../../shared/jsx/props-proxy';
import { isDev, isServer } from '@qwik.dev/core/build';
import { isServerPlatform } from '../../shared/platform/platform';
import { Brand, brandClass } from '../../shared/utils/brand';

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('STORE', ...args.map(qwikDebugToString));

/** @internal */
export const getStoreHandler = (value: StoreTarget): StoreHandler | null => {
  return value[STORE_HANDLER] as StoreHandler | null;
};

/** @internal */
export const getStoreTarget = <T extends StoreTarget>(value: T): T | null => {
  try {
    return value?.[STORE_TARGET] || null;
  } catch {
    return null;
  }
};

/**
 * Force a store to recompute and schedule effects.
 *
 * @public
 */
export const forceStoreEffects = (value: StoreTarget, prop: keyof StoreTarget): void => {
  const handler = getStoreHandler(value);
  if (handler) {
    handler.force(prop);
  }
};

/**
 * @returns True if the store has effects for the given prop
 * @internal
 */
export const _hasStoreEffects = (value: StoreTarget, prop: keyof StoreTarget): boolean => {
  const handler = getStoreHandler(value);
  if (handler) {
    return (handler.$effects$?.get(prop)?.size ?? 0) > 0;
  }
  return false;
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

/** @internal */
export const isStore = (value: object): boolean => {
  return STORE_TARGET in value;
};

/** @internal */
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

export class StoreHandler implements ProxyHandler<StoreTarget> {
  $effects$: undefined | Map<string | symbol, Set<EffectSubscription>> = undefined;
  private $arrayMutationChanges$: boolean[] = [];
  private $arrayMethodWrappers$: Map<string, { method: Function; wrapper: Function }> | undefined =
    undefined;

  constructor(
    public $flags$: StoreFlags,
    public $container$: Container | null
  ) {}

  toString(): string {
    return '[Store]';
  }

  force(prop: keyof StoreTarget): void {
    const target = getStoreTarget(this)!;
    scheduleEffects(this.$container$, this, getEffects(target, prop, this.$effects$));
  }

  get(target: StoreTarget, prop: string | symbol) {
    // TODO(perf): handle better `slice` calls
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
        isDev &&
          assertTrue(
            !ctx.$container$ || isSameContainer(ctx.$container$, this.$container$),
            'Do not use signals across containers'
          );
      }
      const effectSubscriber = ctx.$effectSubscriber$;
      if (effectSubscriber) {
        addStoreEffect(
          target,
          Array.isArray(target) ? STORE_ALL_PROPS : prop,
          this,
          effectSubscriber,
          ctx.$container$
        );
      }
    }

    if (prop === 'toString' && value === Object.prototype.toString) {
      return this.toString;
    }

    if (Array.isArray(target) && isArrayMutatingMethod(prop, value)) {
      return this.getArrayMethod(target, prop, value);
    }

    const flags = this.$flags$;
    let shouldWrapRecursively = false;
    if (flags & StoreFlags.RECURSIVE && isObject(value)) {
      try {
        shouldWrapRecursively =
          !Object.isFrozen(value) && !isStore(value) && !Object.isFrozen(target);
      } catch {
        // ignore
      }
    }
    if (shouldWrapRecursively) {
      return getOrCreateStore(value, this.$flags$, this.$container$);
    }
    return value;
  }

  /** In the case of oldValue and value are the same, the effects are not triggered. */
  set(target: StoreTarget, prop: string | symbol, value: any): boolean {
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

  deleteProperty(target: StoreTarget, prop: string | symbol): boolean {
    if (typeof prop != 'string' || !delete target[prop]) {
      return false;
    }
    this.scheduleStoreEffects(target, prop);
    return true;
  }

  private getArrayMethod(target: StoreTarget, prop: string, method: Function): Function {
    const wrappers = (this.$arrayMethodWrappers$ ||= new Map());
    const existing = wrappers.get(prop);
    if (existing?.method === method) {
      return existing.wrapper;
    }

    const wrapper = new Proxy(method, {
      apply: (arrayMethod, thisArg, args) => {
        if (
          !thisArg ||
          (typeof thisArg !== 'object' && typeof thisArg !== 'function') ||
          getStoreHandler(thisArg as StoreTarget) !== this
        ) {
          return Reflect.apply(arrayMethod, thisArg, args);
        }

        this.$arrayMutationChanges$.push(false);
        try {
          return Reflect.apply(arrayMethod, thisArg, args);
        } finally {
          const didChange = this.$arrayMutationChanges$.pop()!;
          if (didChange) {
            scheduleEffects(
              this.$container$,
              this,
              getEffects(target, STORE_ALL_PROPS, this.$effects$)
            );
          }
        }
      },
    });
    wrappers.set(prop, { method, wrapper });
    return wrapper;
  }

  scheduleStoreEffects(target: StoreTarget, prop: string | symbol): void {
    if (this.$arrayMutationChanges$.length > 0) {
      this.$arrayMutationChanges$[this.$arrayMutationChanges$.length - 1] = true;
      return;
    }
    scheduleEffects(this.$container$, this, getEffects(target, prop, this.$effects$));
  }

  has(target: StoreTarget, prop: string | symbol) {
    if (prop === STORE_TARGET) {
      return true;
    }
    if (typeof prop === 'string') {
      const ctx = tryGetInvokeContext();
      if (ctx) {
        const effectSubscriber = ctx.$effectSubscriber$;
        if (effectSubscriber) {
          addStoreEffect(
            target,
            Array.isArray(target) ? STORE_ALL_PROPS : prop,
            this,
            effectSubscriber,
            ctx.$container$
          );
        }
      }
    }
    return Object.prototype.hasOwnProperty.call(target, prop);
  }

  ownKeys(target: StoreTarget): ArrayLike<string | symbol> {
    const ctx = tryGetInvokeContext();
    const effectSubscriber = ctx?.$effectSubscriber$;
    if (effectSubscriber) {
      addStoreEffect(target, STORE_ALL_PROPS, this, effectSubscriber, ctx.$container$);
    }
    return Reflect.ownKeys(target);
  }

  getOwnPropertyDescriptor(
    target: StoreTarget,
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
brandClass(StoreHandler, Brand.StoreHandler);

function isArrayMutatingMethod(prop: string | symbol, value: unknown): value is Function {
  return (
    (prop === 'pop' && value === Array.prototype.pop) ||
    (prop === 'shift' && value === Array.prototype.shift) ||
    (prop === 'splice' && value === Array.prototype.splice)
  );
}

export function addStoreEffect(
  target: StoreTarget | PropsProxy,
  prop: string | symbol,
  store: StoreHandler | PropsProxyHandler,
  effectSubscription: EffectSubscription,
  renderContainer?: Container
) {
  const effectsMap = (store.$effects$ ||= new Map());
  let effects = effectsMap.get(prop);
  if (!effects) {
    effects = new Set();
    effectsMap.set(prop, effects);
  }
  // Let's make sure that we have a reference to this effect.
  // Adding reference is essentially adding a subscription, so if the signal
  // changes we know who to notify.
  ensureContainsSubscription(effects, effectSubscription);
  // But when effect is scheduled in needs to be able to know which signals
  // to unsubscribe from. So we need to store the reference from the effect back
  // to this signal.
  ensureContainsBackRef(effectSubscription, target);
  if (qTest ? isServerPlatform() : isServer) {
    getEffectSerializationContainer(renderContainer, store.$container$)?.$recordEffect$?.(
      target,
      effectSubscription,
      prop
    );
  }

  DEBUG &&
    log(
      'sub',
      pad(
        '\n' +
          [...(store.$effects$?.entries() || [])]
            .map(([key, value]) => `${String(key)}: ${String(value)}`)
            .join(','),
        '  '
      )
    );
}

function setNewValueAndTriggerEffects<T extends Record<string | symbol, any>>(
  prop: keyof T,
  value: any,
  target: T,
  currentStore: StoreHandler
): void {
  target[prop] = value;
  currentStore.scheduleStoreEffects(target as StoreTarget, prop as string | symbol);
}

function getEffects<T extends Record<string | symbol, any>>(
  target: T,
  prop: string | symbol,
  storeEffects: Map<string | symbol, Set<EffectSubscription>> | undefined
) {
  let effectsToTrigger: Set<EffectSubscription> | undefined;

  if (storeEffects) {
    if (Array.isArray(target)) {
      for (const effects of storeEffects.values()) {
        effectsToTrigger ||= new Set();
        for (const effect of effects) {
          effectsToTrigger.add(effect);
        }
      }
    } else {
      effectsToTrigger = storeEffects.get(prop);
    }
  }

  const storeArrayValue = storeEffects?.get(STORE_ALL_PROPS);
  if (storeArrayValue) {
    effectsToTrigger ||= new Set();
    for (const effect of storeArrayValue) {
      effectsToTrigger!.add(effect);
    }
  }
  return effectsToTrigger;
}
