import { pad, qwikDebugToString } from '../../debug';
import { assertTrue } from '../../error/assert';
import { _wrapProp } from '../../state/signal';
import { tryGetInvokeContext } from '../../use/use-core';
import { isSerializableObject } from '../../util/types';
import { SERIALIZER_PROXY_UNWRAP } from '../shared/shared-serialization';
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

const storeWeakMap = new WeakMap<object, Store2<object>>();

const STORE = Symbol('store');

export const enum Store2Flags {
  NONE = 0,
  RECURSIVE = 1,
  IMMUTABLE = 2,
}

export type Store2<T> = T & {
  __BRAND__: 'Store';
};

let _lastHandler: undefined | StoreHandler<any>;

export const getStoreHandler2 = <T extends object>(value: T): StoreHandler<T> | null => {
  _lastHandler = undefined as any;
  return typeof value === 'object' && value && STORE in value // this implicitly sets the `_lastHandler` as a side effect.
    ? _lastHandler!
    : null;
};

export const getStoreTarget2 = <T extends object>(value: T): T | null => {
  const handler = getStoreHandler2(value);
  return handler ? handler.$target$ : null;
};

export const unwrapStore2 = <T>(value: T): T => {
  return (getStoreTarget2(value as fixMeAny) as T) || value;
};

export const isStore2 = <T extends object>(value: T): value is Store2<T> => {
  return value instanceof Store;
};

export function createStore2<T extends object>(
  container: Container2 | null | undefined,
  obj: T & Record<string, unknown>,
  flags: Store2Flags
) {
  return new Proxy(new Store(), new StoreHandler<T>(obj, flags, container || null)) as Store2<T>;
}

export const getOrCreateStore2 = <T extends object>(
  obj: T,
  flags: Store2Flags,
  container?: Container2 | null
): Store2<T> => {
  if (isSerializableObject(obj)) {
    let store: Store2<T> | undefined = storeWeakMap.get(obj) as Store2<T> | undefined;
    if (!store) {
      store = createStore2<T>(container, obj, flags);
      storeWeakMap.set(obj, store);
    }
    return store as Store2<T>;
  }
  return obj as Store2<T>;
};

class Store {
  toString() {
    return '[Store]';
  }
}

export const Store2 = Store;

export class StoreHandler<T extends Record<string | symbol, any>> implements ProxyHandler<T> {
  $effects$: null | Record<string, EffectSubscriptions[]> = null;
  constructor(
    public $target$: T,
    public $flags$: Store2Flags,
    public $container$: Container2 | null
  ) {}

  toString() {
    const flags = [];
    if (this.$flags$ & Store2Flags.RECURSIVE) {
      flags.push('RECURSIVE');
    }
    if (this.$flags$ & Store2Flags.IMMUTABLE) {
      flags.push('IMMUTABLE');
    }
    let str = '[Store: ' + flags.join('|') + '\n';
    for (const key in this.$target$) {
      const value = this.$target$[key];
      str += '  ' + key + ': ' + qwikDebugToString(value) + ',\n';
      const effects = this.$effects$?.[key];
      effects?.forEach(([effect, prop, ...subs]) => {
        str += '    ' + qwikDebugToString(effect) + '\n';
        str += '    ' + qwikDebugToString(prop) + '\n';
        // str += '    ' + subs.map(qwikDebugToString).join(';') + '\n';
      });
    }
    return str + ']';
  }

  get(_: T, p: string | symbol) {
    if (p === SERIALIZER_PROXY_UNWRAP) {
      // SERIALIZER_PROXY_UNWRAP is used by v2 serialization to unwrap proxies.
      // Our target may be a v2 serialization proxy so if we let it through
      // we will return the naked object which removes ourselves,
      // and that is not the intention so prevent of SERIALIZER_PROXY_UNWRAP.
      return undefined;
    } else if (p === 'toJSON') {
      return () => {
        // we need to add subscription to all properties
        // TODO: could this be done another way?
        for (const key in this.$target$) {
          if (isStore2(this.$target$[key])) {
            continue;
          }
          this.get(this.$target$, key);
        }
        return this.$target$;
      };
    }
    const target = this.$target$;
    const ctx = tryGetInvokeContext();
    let value = target[p];
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
        const effectsMap = (this.$effects$ ||= {});
        const effects =
          (Object.prototype.hasOwnProperty.call(effectsMap, p) && effectsMap[p as fixMeAny]) ||
          (effectsMap[p as fixMeAny] = []);
        // Let's make sure that we have a reference to this effect.
        // Adding reference is essentially adding a subscription, so if the signal
        // changes we know who to notify.
        ensureContainsEffect(effects, effectSubscriber);
        // But when effect is scheduled in needs to be able to know which signals
        // to unsubscribe from. So we need to store the reference from the effect back
        // to this signal.
        ensureContains(effectSubscriber, this.$target$);
        DEBUG && log('read->sub', pad('\n' + this.toString(), '  '));
      }
    }
    if (p === 'toString' && value === Object.prototype.toString) {
      return Store.prototype.toString;
    }
    const flags = this.$flags$;
    if (flags & Store2Flags.RECURSIVE && typeof value === 'object' && value !== null) {
      value = getOrCreateStore2(value, this.$flags$, this.$container$);
      (target as Record<string | symbol, any>)[p] = value;
    }
    return value;
  }

  set(_: T, p: string | symbol, value: any): boolean {
    const target = this.$target$;
    const oldValue = target[p];
    if (value !== oldValue) {
      DEBUG && log('Signal.set', oldValue, '->', value, pad('\n' + this.toString(), '  '));
      (target as any)[p] = value;
      triggerEffects(
        this.$container$,
        this,
        this.$effects$
          ? Array.isArray(target)
            ? Object.values(this.$effects$).flatMap((effects) => effects)
            : this.$effects$[String(p)]
          : null
      );
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
      _lastHandler = this;
      return true;
    }
    return Object.prototype.hasOwnProperty.call(this.$target$, p);
  }

  ownKeys(): ArrayLike<string | symbol> {
    return Reflect.ownKeys(this.$target$);
  }

  getOwnPropertyDescriptor(_: T, prop: string | symbol): PropertyDescriptor | undefined {
    if (Array.isArray(this.$target$) || typeof prop === 'symbol') {
      return Object.getOwnPropertyDescriptor(this.$target$, prop);
    }
    return {
      enumerable: true,
      configurable: true,
    };
  }
}
