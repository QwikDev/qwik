import { pad, qwikDebugToString } from "../../debug";
import { assertDefined, assertTrue } from "../../error/assert";
import { tryGetInvokeContext } from "../../use/use-core";
import type { VNode } from "../client/types";
import type { Container2, fixMeAny } from "../shared/types";
import { EffectProperty, ensureContains, ensureContainsEffect, triggerEffects, type EffectSubscriptions } from "./v2-signal";

const DEBUG = false;

// eslint-disable-next-line no-console
const log = (...args: any[]) => console.log('STORE', ...(args).map(qwikDebugToString));


const storeWeakMap = new WeakMap<object, Store2<object>>();

const STORE = Symbol('store');

export const enum Store2Flags {
  NONE = 0,
  RECURSIVE = 1,
  IMMUTABLE = 2,
}

export type Store2<T> = T & {
  __BRAND__: 'Store'
};

let _lastTarget: undefined | StoreHandler<object>;

export const getStoreTarget2 = <T extends object>(value: T): T | null => {
  _lastTarget = undefined as any;
  return typeof value === 'object' && value && (STORE in value) // this implicitly sets the `_lastTarget` as a side effect.
    ? _lastTarget!.$target$ as T : null;
}

export const unwrapStore2 = <T>(value: T): T => {
  return getStoreTarget2(value as fixMeAny) as T || value;
}

export const isStore2 = <T extends object>(value: T): value is Store2<T> => {
  return value instanceof Store;
}

export const getOrCreateStore2 = <T extends object>(obj: T, flags: Store2Flags, container?: Container2 | null): Store2<T> => {
  let store: Store2<T> | undefined = storeWeakMap.get(obj) as Store2<T> | undefined;
  if (!store) {
    store = new Proxy(new Store(), new StoreHandler<T>(obj, flags, container || null)) as Store2<T>;
    storeWeakMap.set(obj, store as any);
  }
  return store as Store2<T>;
}

class Store {
  toString() {
    return '[Store]';
  }
}

export const Store2 = Store;

class StoreHandler<T extends Record<string | symbol, any>> implements ProxyHandler<T> {
  $effects$: null | EffectSubscriptions[] = null;
  constructor(public $target$: T, public $flags$: Store2Flags, public $container$: Container2 | null) {
  }

  get(_: T, p: string | symbol) {
    const target = this.$target$;
    const ctx = tryGetInvokeContext();
    if (ctx) {
      if (this.$container$ === null) {
        assertDefined(ctx.$container2$, 'container should be in context ');
        // Grab the container now we have access to it
        this.$container$ = ctx.$container2$;
      } else {
        assertTrue(
          !ctx.$container2$ || ctx.$container2$ === this.$container$,
          'Do not use signals across containers'
        );
      }
      let effectSubscriber = ctx.$effectSubscriber$;
      if (!effectSubscriber && ctx.$hostElement$) {
        const host: VNode | null = ctx.$hostElement$ as any;
        if (host) {
          effectSubscriber = [host, EffectProperty.COMPONENT];
        }
      }
      if (effectSubscriber) {
        const effects = (this.$effects$ ||= []);
        // Let's make sure that we have a reference to this effect.
        // Adding reference is essentially adding a subscription, so if the signal
        // changes we know who to notify.
        ensureContainsEffect(effects, effectSubscriber);
        // But when effect is scheduled in needs to be able to know which signals
        // to unsubscribe from. So we need to store the reference from the effect back
        // to this signal.
        ensureContains(effectSubscriber, this);
        DEBUG && log("read->sub", pad('\n' + this.toString(), "  "))
      }
    }
    let value = target[p];
    if (p === 'toString' && value === Object.prototype.toString) {
      return Store.prototype.toString;
    }
    if (typeof value === 'object' && value !== null) {
      value = getOrCreateStore2(value, this.$flags$, this.$container$);
    }
    return value;
  }


  set(_: T, p: string | symbol, value: any): boolean {
    const target = this.$target$;
    const oldValue = target[p];
    if (value !== oldValue) {
      DEBUG && log('Signal.set', oldValue, '->', value, pad('\n' + this.toString(), "  "));
      (target as any)[p] = value;
      triggerEffects(this.$container$, this, this.$effects$);
    }
    return true;
  }

  deleteProperty(_: T, prop: string | symbol): boolean {
    if (typeof prop != 'string' || !delete this.$target$[prop]) {
      return false;
    }
    return true;
  }

  has(_: T, p: string | symbol) {
    if (p === STORE) {
      _lastTarget = this;
      return true;
    }
    return Object.prototype.hasOwnProperty.call(this.$target$, p);
  }

  ownKeys(): ArrayLike<string | symbol> {
    return Reflect.ownKeys(this.$target$);
  }
}