import { assertEqual } from '../assert/assert';
import {
  qError,
  QError_onlyLiteralWrapped,
  QError_onlyObjectWrapped,
  QError_verifySerializable,
} from '../error/error';
import { isQrl } from '../import/qrl-class';
import {
  getContainerState,
  notifyRender,
  ContainerState,
  scheduleFrame,
} from '../render/notify-render';
import { getContainer, tryGetInvokeContext } from '../use/use-core';
import { isDocument, isElement, isNode } from '../util/element';
import { logWarn } from '../util/log';
import { qDev, qTest } from '../util/qdev';
import { WatchDescriptor, WatchFlagsIsDirty } from '../use/use-watch';
import { Subscriber, unwrapSubscriber } from '../use/use-subscriber';
import { tryGetContext } from '../props/props';
import { RenderEvent } from '../util/markers';
import { getProxyTarget } from './store';
import { isArray, isFunction, isObject } from '../util/types';

export type ObjToProxyMap = WeakMap<any, any>;
export type QObject<T extends {}> = T & { __brand__: 'QObject' };

export const qObject = <T extends Object>(obj: T, proxyMap: ContainerState): T => {
  assertEqual(unwrapProxy(obj), obj, 'Unexpected proxy at this location');
  if (obj == null || typeof obj !== 'object') {
    // TODO(misko): centralize
    throw qError(QError_onlyObjectWrapped, obj);
  }
  if (obj.constructor !== Object) {
    throw qError(QError_onlyLiteralWrapped, obj);
  }
  return readWriteProxy(obj as any as QObject<T>, proxyMap);
};

export const _restoreQObject = <T>(
  obj: T,
  containerState: ContainerState,
  subs: Map<Element, Set<string>>
): T => {
  return readWriteProxy(obj as any as QObject<T>, containerState, subs);
};

/**
 * Creates a proxy which notifies of any writes.
 */
export const readWriteProxy = <T extends object>(
  target: T,
  containerState: ContainerState,
  subs?: Map<Element, Set<string>>
): T => {
  if (!target || typeof target !== 'object') return target;
  const proxyMap = containerState.$proxyMap$;
  let proxy = proxyMap.get(target);
  if (proxy) return proxy;

  const manager = containerState.$subsManager$.$getLocal$(target, subs);
  proxy = new Proxy(target, new ReadWriteProxyHandler(containerState, manager)) as any as T;
  proxyMap.set(target, proxy);
  return proxy;
};

export const QOjectTargetSymbol = ':target:';
export const QOjectAllSymbol = ':all:';
export const QOjectSubsSymbol = ':subs:';
export const QOjectOriginalProxy = ':proxy:';
export const SetSubscriber = Symbol('SetSubscriber');

/**
 * @alpha
 */
export const unwrapProxy = <T>(proxy: T): T => {
  return getProxyTarget(proxy) ?? proxy;
};

export const wrap = <T>(value: T, containerState: ContainerState): T => {
  if (isObject(value)) {
    if (isQrl(value)) {
      return value;
    }
    if (Object.isFrozen(value)) {
      return value;
    }
    const nakedValue = unwrapProxy(value);
    if (nakedValue !== value) {
      // already a proxy return;
      return value;
    }
    if (isNode(nakedValue)) {
      return value;
    }
    if (!shouldSerialize(nakedValue)) {
      return value;
    }
    if (qDev) {
      verifySerializable<T>(value);
    }
    const proxy = containerState.$proxyMap$.get(value);
    return proxy ? proxy : readWriteProxy(value as any, containerState);
  } else {
    return value;
  }
};

export type TargetType = Record<string | symbol, any>;

export type SubscriberMap = Map<Subscriber, Set<string> | null>;
export type ObjToSubscriberMap = WeakMap<any, LocalSubscriptionManager>;
export type SubscriberToSubscriberMap = Map<Subscriber, Set<SubscriberMap>>;

export interface SubscriptionManager {
  $tryGetLocal$(obj: any): LocalSubscriptionManager | undefined;
  $getLocal$(obj: any, map?: SubscriberMap): LocalSubscriptionManager;
  $clearSub$: (sub: Subscriber) => void;
}

export interface LocalSubscriptionManager {
  $subs$: SubscriberMap;
  $notifySubs$: (key?: string | undefined) => void;
  $addSub$: (subscriber: Subscriber, key?: string) => void;
}

export const createSubscriptionManager = (): SubscriptionManager => {
  const objToSubs: ObjToSubscriberMap = new Map();
  const subsToObjs: SubscriberToSubscriberMap = new Map();

  const clearSub = (sub: Subscriber) => {
    const subs = subsToObjs.get(sub);
    if (subs) {
      subs.forEach((s) => {
        s.delete(sub);
      });
      subsToObjs.delete(sub);
      subs.clear();
    }
  };

  const tryGetLocal = (obj: any) => {
    assertEqual(getProxyTarget(obj), undefined);
    return objToSubs.get(obj);
  };

  const trackSubToObj = (subscriber: Subscriber, map: SubscriberMap) => {
    let set = subsToObjs.get(subscriber);
    if (!set) {
      subsToObjs.set(subscriber, (set = new Set()));
    }
    set.add(map);
  };

  const getLocal = (obj: any, initialMap?: SubscriberMap) => {
    let local = tryGetLocal(obj);
    if (!local) {
      const map = !initialMap ? (new Map() as SubscriberMap) : initialMap;
      map.forEach((_, key) => {
        trackSubToObj(key, map);
      });
      objToSubs.set(
        obj,
        (local = {
          $subs$: map,
          $addSub$(subscriber: Subscriber, key?: string) {
            if (key == null) {
              map.set(subscriber, null);
            } else {
              let sub = map.get(subscriber);
              if (sub === undefined) {
                map.set(subscriber, (sub = new Set()));
              }
              if (sub) {
                sub.add(key);
              }
            }
            trackSubToObj(subscriber, map);
          },
          $notifySubs$(key?: string) {
            map.forEach((value, subscriber) => {
              if (value === null || !key) {
                notifyChange(subscriber);
              } else if (value.has(key)) {
                notifyChange(subscriber);
              }
            });
          },
        })
      );
    }
    return local;
  };

  return {
    $tryGetLocal$: tryGetLocal,
    $getLocal$: getLocal,
    $clearSub$: clearSub,
  };
};

class ReadWriteProxyHandler implements ProxyHandler<TargetType> {
  private $subscriber$?: Subscriber;
  constructor(
    private $containerState$: ContainerState,
    private $manager$: LocalSubscriptionManager
  ) {}

  get(target: TargetType, prop: string | symbol): any {
    let subscriber = this.$subscriber$;
    this.$subscriber$ = undefined;
    if (typeof prop === 'symbol') {
      return target[prop];
    }
    if (prop === QOjectTargetSymbol) return target;
    if (prop === QOjectSubsSymbol) return this.$manager$.$subs$;
    if (prop === QOjectOriginalProxy) return this.$containerState$.$proxyMap$.get(target);
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      if (invokeCtx.$subscriber$ === null) {
        subscriber = undefined;
      } else if (!subscriber) {
        subscriber = invokeCtx.$subscriber$;
      }
    } else if (qDev && !qTest && !subscriber) {
      // logWarn(`State assigned outside invocation context. Getting prop "${prop}" of:`, target);
    }

    if (prop === QOjectAllSymbol) {
      if (subscriber) {
        this.$manager$.$addSub$(subscriber);
      }
      return target;
    }

    const value = target[prop];
    if (subscriber) {
      const isA = isArray(target);
      this.$manager$.$addSub$(subscriber, isA ? undefined : prop);
    }
    return wrap(value, this.$containerState$);
  }

  set(target: TargetType, prop: string | symbol, newValue: any): boolean {
    if (typeof prop === 'symbol') {
      if (prop === SetSubscriber) {
        this.$subscriber$ = newValue;
      } else {
        target[prop] = newValue;
      }
      return true;
    }
    const unwrappedNewValue = unwrapProxy(newValue);
    if (qDev) {
      verifySerializable(unwrappedNewValue);
      const invokeCtx = tryGetInvokeContext();
      if (invokeCtx && invokeCtx.$event$ === RenderEvent) {
        logWarn(
          'State mutation inside render function. Move mutation to useWatch(), useClientEffect() or useServerMount()',
          invokeCtx.$hostElement$,
          prop
        );
      }
    }
    const isA = isArray(target);
    if (isA) {
      target[prop as any] = unwrappedNewValue;
      this.$manager$.$notifySubs$();
      return true;
    }

    const oldValue = target[prop];
    if (oldValue !== unwrappedNewValue) {
      target[prop] = unwrappedNewValue;
      this.$manager$.$notifySubs$(prop);
    }
    return true;
  }

  has(target: TargetType, property: string | symbol) {
    if (property === QOjectTargetSymbol) return true;
    if (property === QOjectSubsSymbol) return true;

    return Object.prototype.hasOwnProperty.call(target, property);
  }

  ownKeys(target: TargetType): ArrayLike<string | symbol> {
    let subscriber = this.$subscriber$;
    const invokeCtx = tryGetInvokeContext();
    if (invokeCtx) {
      if (invokeCtx.$subscriber$ === null) {
        subscriber = undefined;
      } else if (!subscriber) {
        subscriber = invokeCtx.$subscriber$;
      }
    } else if (qDev && !qTest && !subscriber) {
      // logWarn(`State assigned outside invocation context. OwnKeys of:`, target);
    }

    if (subscriber) {
      this.$manager$.$addSub$(subscriber);
    }
    return Object.getOwnPropertyNames(target);
  }
}

export const removeSub = (obj: any, subscriber: any) => {
  if (isObject(obj)) {
    const subs = obj[QOjectSubsSymbol] as Map<Subscriber, Set<string>> | undefined;
    if (subs) {
      subs.delete(subscriber);
    }
  }
};

export const notifyChange = (subscriber: Subscriber) => {
  if (isElement(subscriber)) {
    notifyRender(subscriber);
  } else {
    notifyWatch(subscriber as WatchDescriptor);
  }
};

export const notifyWatch = (watch: WatchDescriptor) => {
  const containerEl = getContainer(watch.el)!;
  const state = getContainerState(containerEl);
  watch.f |= WatchFlagsIsDirty;

  const activeRendering = state.$hostsRendering$ !== undefined;
  if (activeRendering) {
    state.$watchStaging$.add(watch);
  } else {
    state.$watchNext$.add(watch);
    scheduleFrame(containerEl, state);
  }
};

export const verifySerializable = <T>(value: T) => {
  if (value == null) {
    return;
  }
  if (shouldSerialize(value)) {
    switch (typeof value) {
      case 'object':
        if (isArray(value)) return;
        if (Object.getPrototypeOf(value) === Object.prototype) return;
        if (isQrl(value)) return;
        if (isElement(value)) return;
        if (isDocument(value)) return;
        break;
      case 'boolean':
      case 'string':
      case 'number':
        return;
    }
    throw qError(QError_verifySerializable, value);
  }
};

const noSerializeSet = /*#__PURE__*/ new WeakSet<any>();

export const shouldSerialize = (obj: any): boolean => {
  if (isObject(obj) || isFunction(obj)) {
    return !noSerializeSet.has(obj);
  }
  return true;
};

/**
 * @alpha
 */
export type NoSerialize<T> = (T & { __no_serialize__: true }) | undefined;

// <docs markdown="../readme.md#noSerialize">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#noSerialize instead)
/**
 * @alpha
 */
// </docs>
export const noSerialize = <T extends {}>(input: T): NoSerialize<T> => {
  noSerializeSet.add(input);
  return input as any;
};

/**
 * @alpha
 */
export const immutable = <T extends {}>(input: T): Readonly<T> => {
  return Object.freeze(input);
};

/**
 * @alpha
 */
export const mutable = <T>(v: T): MutableWrapper<T> => {
  return {
    [MUTABLE]: true,
    v: unwrapSubscriber(v),
  };
};

export const isConnected = (sub: Subscriber): boolean => {
  if (isElement(sub)) {
    return !!tryGetContext(sub) || sub.isConnected;
  } else {
    return isConnected(sub.el);
  }
};

const MUTABLE = Symbol('mutable');

/**
 * @public
 */
export interface MutableWrapper<T> {
  [MUTABLE]: true;
  v: T;
}

export const isMutable = (v: any): v is MutableWrapper<any> => {
  return isObject(v) && v[MUTABLE] === true;
};
