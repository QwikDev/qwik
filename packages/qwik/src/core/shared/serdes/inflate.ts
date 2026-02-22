import { isServer } from '@qwik.dev/core/build';
import {
  vnode_getFirstChild,
  vnode_getProp,
  vnode_getText,
  vnode_isTextVNode,
  vnode_isVNode,
} from '../../client/vnode-utils';
import { _EFFECT_BACK_REF } from '../../internal';
import type { BackRef } from '../../reactive-primitives/backref';
import type { AsyncSignalImpl } from '../../reactive-primitives/impl/async-signal-impl';
import type { ComputedSignalImpl } from '../../reactive-primitives/impl/computed-signal-impl';
import { SignalImpl } from '../../reactive-primitives/impl/signal-impl';
import { getStoreHandler, unwrapStore } from '../../reactive-primitives/impl/store';
import type { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import type { SubscriptionData } from '../../reactive-primitives/subscription-data';
import {
  AsyncSignalFlags,
  EffectProperty,
  NEEDS_COMPUTATION,
  SignalFlags,
  type AllSignalFlags,
  type AsyncQRL,
  type Consumer,
  type EffectBackRef,
  type EffectSubscription,
  type StoreFlags,
} from '../../reactive-primitives/types';
import type { Task } from '../../use/use-task';
import { SERIALIZABLE_STATE } from '../component.public';
import { qError, QError } from '../error/error';
import { JSXNodeImpl } from '../jsx/jsx-node';
import { Fragment, Props } from '../jsx/jsx-runtime';
import { PropsProxy } from '../jsx/props-proxy';
import { isServerPlatform } from '../platform/platform';
import type { QRLInternal } from '../qrl/qrl-class';
import type { DeserializeContainer, HostElement } from '../types';
import { _OWNER, _PROPS_HANDLER, _UNINITIALIZED } from '../utils/constants';
import { isString } from '../utils/types';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import { allocate, pendingStoreTargets, resolvers } from './allocate';
import { TypeIds } from './constants';
import { needsInflation } from './deser-proxy';

export let loading = Promise.resolve();

export const inflate = (
  container: DeserializeContainer,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): void => {
  if (typeId === TypeIds.Plain) {
    // Already processed
    return;
  }
  // Restore the complex data, special case for Array
  if (typeId !== TypeIds.Array && Array.isArray(data)) {
    data = _eagerDeserializeArray(container, data);
  }
  switch (typeId) {
    case TypeIds.Array:
      // Arrays are special, we need to fill the array in place
      _eagerDeserializeArray(container, data as unknown[], target as unknown[]);
      break;
    case TypeIds.Object:
      if (data === 0) {
        // Special case, was an empty object
        break;
      }
      for (let i = 0; i < (data as any[]).length; i += 2) {
        const key = (data as string[])[i];
        const value = (data as unknown[])[i + 1];
        (target as Record<string, unknown>)[key] = value;
      }
      break;
    case TypeIds.Task:
      const task = target as Task;
      const v = data as any[];
      task.$qrl$ = v[0];
      task.$flags$ = v[1];
      task.$index$ = v[2];
      task.$el$ = v[3] as HostElement;
      task.$state$ = v[4];
      break;
    case TypeIds.Component:
      (target as any)[SERIALIZABLE_STATE][0] = (data as any[])[0];
      break;
    case TypeIds.Store: {
      // Inflate the store target
      const store = unwrapStore(target) as object;
      const storeTarget = pendingStoreTargets.get(store);
      if (storeTarget) {
        pendingStoreTargets.delete(store);
        inflate(container, store, storeTarget.t, storeTarget.v);
      }
      /**
       * Note that we don't do anything with the innerstores we added during serialization, because
       * they are already inflated in the deserialize of the data, above.
       */
      const [, flags, effects] = data as unknown[];
      const storeHandler = getStoreHandler(target as object)!;
      storeHandler.$flags$ = flags as StoreFlags;
      storeHandler.$effects$ = effects as any;
      restoreEffectBackRefForEffectsMap(storeHandler.$effects$, store);
      break;
    }
    case TypeIds.Signal: {
      const signal = target as SignalImpl<unknown>;
      const d = data as [unknown, ...EffectSubscription[]];
      signal.$untrackedValue$ = d[0];
      signal.$effects$ = new Set(d.slice(1) as EffectSubscription[]);
      restoreEffectBackRefForEffects(signal.$effects$, signal);
      break;
    }
    case TypeIds.WrappedSignal: {
      const signal = target as WrappedSignalImpl<unknown>;
      const d = data as [number, unknown[], AllSignalFlags, HostElement, ...EffectSubscription[]];
      signal.$func$ = container.getSyncFn(d[0]);
      signal.$args$ = d[1];
      signal.$untrackedValue$ = NEEDS_COMPUTATION;
      signal.$flags$ = d[2];
      signal.$flags$ |= SignalFlags.INVALID;
      signal.$hostElement$ = d[3];
      signal.$effects$ = new Set(d.slice(4) as EffectSubscription[]);
      inflateWrappedSignalValue(signal);
      restoreEffectBackRefForEffects(signal.$effects$, signal);
      break;
    }
    case TypeIds.AsyncSignal: {
      const asyncSignal = target as AsyncSignalImpl<unknown>;
      const d = data as [
        AsyncQRL<unknown>,
        Array<EffectSubscription> | undefined,
        Array<EffectSubscription> | undefined,
        Array<EffectSubscription> | undefined,
        Error,
        number?,
        unknown?,
        number?,
        number?,
        number?,
      ];
      asyncSignal.$computeQrl$ = d[0] as AsyncQRL<unknown>;
      asyncSignal.$effects$ = new Set(d[1] as EffectSubscription[]);
      asyncSignal.$loadingEffects$ = new Set(d[2] as EffectSubscription[]);
      asyncSignal.$errorEffects$ = new Set(d[3] as EffectSubscription[]);
      asyncSignal.$untrackedError$ = d[4] as Error;

      asyncSignal.$flags$ = (d[5] as number) ?? 0;

      if (asyncSignal.$flags$ & AsyncSignalFlags.CLIENT_ONLY) {
        // If it's client only, it was serialized because it pretended to be loading
        asyncSignal.$untrackedLoading$ = true;
      }

      const hasValue = d.length > 6;
      if (hasValue) {
        asyncSignal.$untrackedValue$ = d[6];
      }
      // can happen when never serialize etc
      if (asyncSignal.$untrackedValue$ === NEEDS_COMPUTATION) {
        asyncSignal.$flags$ |= SignalFlags.INVALID;
      }

      // Note, we use the setter so that it schedules polling if needed
      asyncSignal.interval = (d[7] ?? 0) as number;

      asyncSignal.$concurrency$ = (d[8] ?? 1) as number;
      asyncSignal.$timeoutMs$ = (d[9] ?? 0) as number;
      restoreEffectBackRefForEffects(asyncSignal.$effects$, asyncSignal);
      restoreEffectBackRefForEffects(asyncSignal.$loadingEffects$, asyncSignal);
      restoreEffectBackRefForEffects(asyncSignal.$errorEffects$, asyncSignal);
      break;
    }
    // Inflating a SerializerSignal is the same as inflating a ComputedSignal
    case TypeIds.SerializerSignal:
    case TypeIds.ComputedSignal: {
      const computed = target as ComputedSignalImpl<unknown>;
      const d = data as [QRLInternal<() => {}>, EffectSubscription[] | undefined, unknown?];
      computed.$computeQrl$ = d[0];
      /**
       * If we try to compute value and the qrl is not resolved, then system throws an error with
       * the resolve promise. To prevent that we load it now and qrls wait for the loading to
       * finish.
       */
      const p = computed.$computeQrl$.resolve(container as any).catch(() => {
        // ignore preload errors
      });
      loading = loading.finally(() => p);
      if (d[1]) {
        computed.$effects$ = new Set(d[1]);
      }
      const hasValue = d.length > 2;
      if (hasValue) {
        computed.$untrackedValue$ = d[2];
      }
      if (typeId !== TypeIds.SerializerSignal && computed.$untrackedValue$ !== NEEDS_COMPUTATION) {
        // If we have a value after SSR, it will always be mean the signal was not invalid
        // The serialized signal is always left invalid so it can recreate the custom object
        computed.$flags$ &= ~SignalFlags.INVALID;
      }
      restoreEffectBackRefForEffects(computed.$effects$, computed);
      break;
    }
    case TypeIds.Error: {
      const d = data as string[];
      (target as Error).message = d[0] as string;
      for (let i = 1; i < d.length; i += 2) {
        (target as any)[d[i]] = d[i + 1];
      }
      break;
    }
    case TypeIds.FormData: {
      const formData = target as FormData;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        formData.append(d[i++], d[i]);
      }
      break;
    }
    case TypeIds.JSXNode: {
      const jsx = target as JSXNodeImpl<unknown>;
      const [type, key, varProps, constProps, children, toSort] = data as any[];
      jsx.type = type;
      jsx.key = key;
      jsx.varProps = varProps;
      jsx.constProps = constProps || null;
      jsx.children = children;
      jsx.toSort = !!toSort;
      break;
    }
    case TypeIds.Set: {
      const set = target as Set<unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        set.add(d[i]);
      }
      break;
    }
    case TypeIds.Map: {
      const map = target as Map<unknown, unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        map.set(d[i++], d[i]);
      }
      break;
    }
    case TypeIds.Promise: {
      const promise = target as Promise<unknown>;
      const [resolved, result] = data as [boolean, unknown];
      const [resolve, reject] = resolvers.get(promise)!;
      if (resolved) {
        resolve(result);
      } else {
        reject(result);
      }
      break;
    }
    case TypeIds.Uint8Array:
      const bytes = target as Uint8Array;
      const buf = atob(data as string);
      let i = 0;
      for (const s of buf) {
        bytes[i++] = s.charCodeAt(0);
      }
      break;
    case TypeIds.PropsProxy:
      const propsProxy = target as PropsProxy;
      const d = data as [
        JSXNodeImpl | typeof _UNINITIALIZED,
        Props,
        Props | null,
        Map<string | symbol, Set<EffectSubscription>> | undefined,
      ];
      let owner = d[0];
      if (owner === _UNINITIALIZED) {
        owner = new JSXNodeImpl(Fragment, d[1], d[2], null, null);
        owner._proxy = propsProxy;
      }
      propsProxy[_OWNER] = owner;
      const propsHandler = propsProxy[_PROPS_HANDLER];
      propsHandler.$effects$ = d[3];
      restoreEffectBackRefForEffectsMap(propsHandler.$effects$, propsProxy);
      break;
    case TypeIds.SubscriptionData: {
      const effectData = target as SubscriptionData;
      effectData.data.$scopedStyleIdPrefix$ = (data as any[])[0];
      effectData.data.$isConst$ = (data as any[])[1];
      break;
    }
    case TypeIds.EffectSubscription: {
      const effectSub = target as EffectSubscription;
      const d = data as [Consumer, EffectProperty | string, SubscriptionData | null];
      effectSub.consumer = d[0];
      effectSub.property = d[1];
      effectSub.data = d[2];
      restoreEffectBackRefForConsumer(effectSub);
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
};

/**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */
export const _eagerDeserializeArray = (
  container: DeserializeContainer,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): unknown[] => {
  for (let i = 0; i < data.length; i += 2) {
    output[i / 2] = deserializeData(container, data[i] as TypeIds, data[i + 1]);
  }
  return output;
};

export function deserializeData(container: DeserializeContainer, typeId: number, value: unknown) {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  const propValue = allocate(container, typeId, value);
  if (needsInflation(typeId)) {
    inflate(container, propValue, typeId, value);
  }
  return propValue;
}

export function inflateWrappedSignalValue(signal: WrappedSignalImpl<unknown>) {
  if (signal.$hostElement$ !== null && vnode_isVNode(signal.$hostElement$)) {
    const hostVNode = signal.$hostElement$ as VirtualVNode;
    const effects = signal.$effects$;
    let hasAttrValue = false;
    if (effects) {
      // Find string keys (attribute names) in the effect back refs
      for (const effect of effects) {
        const key = effect.property;
        if (isString(key)) {
          // This is an attribute name, try to read its value
          const attrValue = vnode_getProp(hostVNode, key, null);
          if (attrValue !== null) {
            signal.$untrackedValue$ = attrValue;
            hasAttrValue = true;
            break; // Take first non-null attribute value
          }
        }
      }
    }

    if (!hasAttrValue) {
      // If no attribute value found, check if this is a text content signal
      const firstChild = vnode_getFirstChild(hostVNode);
      if (
        firstChild &&
        hostVNode.firstChild === hostVNode.lastChild &&
        vnode_isTextVNode(firstChild)
      ) {
        signal.$untrackedValue$ = vnode_getText(firstChild);
      }
    }
  }
}

function restoreEffectBackRefForConsumer(effect: EffectSubscription): void {
  const isServerSide = import.meta.env.TEST ? isServerPlatform() : isServer;
  const consumerBackRef = effect.consumer as BackRef;
  if (isServerSide && !consumerBackRef) {
    // on browser, we don't serialize for example VNodes, so then on server side we don't have consumer
    return;
  }
  consumerBackRef[_EFFECT_BACK_REF] ||= new Map();
  consumerBackRef[_EFFECT_BACK_REF].set(effect.property, effect);
}

function restoreEffectBackRefForEffects(
  effects: Set<EffectSubscription> | null | undefined,
  consumer: EffectBackRef
): void {
  if (effects) {
    for (const effect of effects) {
      effect.backRef ||= new Set();
      effect.backRef.add(consumer);
    }
  }
}

function restoreEffectBackRefForEffectsMap(
  effectsMap: Map<string | symbol, Set<EffectSubscription>> | null | undefined,
  consumer: EffectBackRef
): void {
  if (effectsMap) {
    for (const [, effects] of effectsMap) {
      restoreEffectBackRefForEffects(effects, consumer);
    }
  }
}
