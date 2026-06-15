import { isServer } from '@qwik.dev/core/build';
import { qTest } from '../utils/qdev';
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
  EffectSubscription,
  type EffectBackRef,
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
import { needsInflation, wrapDeserializerProxy } from './deser-proxy';
import type { SubscriptionPatch } from './subscription-patch';

export let loading = Promise.resolve();

const dangerousObjectKeys = new Set([
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'toJSON',
  'then',
]);
const isSafeObjectKV = (key: unknown, value: unknown): key is string | number => {
  if (typeof key === 'number') {
    return true;
  }
  return (
    typeof key === 'string' &&
    key !== '__proto__' &&
    (typeof value !== 'function' || !dangerousObjectKeys.has(key))
  );
};

export const inflate = (
  container: DeserializeContainer,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): void => {
  const iterator = inflateIterator(container, target, typeId, data);
  while (!iterator.next().done) {
    // Run synchronously for lazy deserialization paths.
  }
};

function* eagerDeserializeArrayIterator(
  container: DeserializeContainer,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): Generator<void, unknown[], void> {
  for (let i = 0; i < data.length; i += 2) {
    output[i / 2] = yield* deserializeDataIterator(container, data[i] as TypeIds, data[i + 1]);
    yield;
  }
  return output;
}

export function* eagerDeserializeStateIterator(
  container: DeserializeContainer,
  data: unknown[],
  output: unknown[] = Array(data.length / 2)
): Generator<void, unknown[], void> {
  const length = data.length / 2;
  const allocated = new Uint8Array(length);
  const previousGetObjectById = container.$getObjectById$;

  const allocateRoot = (index: number): unknown => {
    if (!allocated[index]) {
      allocated[index] = 1;
      const typeIndex = index * 2;
      const typeId = data[typeIndex] as TypeIds;
      const value = data[typeIndex + 1];
      output[index] = typeId === TypeIds.Plain ? value : allocate(container, typeId, value);
    }
    return output[index];
  };

  container.$getObjectById$ = (id) => allocateRoot(typeof id === 'string' ? parseInt(id, 10) : id);
  try {
    for (let i = 0; i < length; i++) {
      allocateRoot(i);
      yield;
    }
    for (let i = 0; i < length; i++) {
      const typeIndex = i * 2;
      const typeId = data[typeIndex] as TypeIds;
      const value = data[typeIndex + 1];
      const propValue = output[i];
      data[typeIndex] = TypeIds.Plain;
      data[typeIndex + 1] = propValue;
      if (needsInflation(typeId)) {
        yield* inflateIterator(container, propValue, typeId, value);
      }
      yield;
    }
  } finally {
    container.$getObjectById$ = previousGetObjectById;
  }
  return output;
}

function* deserializeDataIterator(
  container: DeserializeContainer,
  typeId: number,
  value: unknown
): Generator<void, unknown, void> {
  if (typeId === TypeIds.Plain) {
    return value;
  }
  const propValue = allocate(container, typeId, value);
  if (needsInflation(typeId)) {
    yield* inflateIterator(container, propValue, typeId, value);
  }
  return propValue;
}

const createLazyEffects = (
  container: DeserializeContainer,
  data: unknown[],
  start: number,
  producer?: EffectBackRef
) => {
  const effects = new Set<EffectSubscription>();
  const d = wrapDeserializerProxy(container as any, data) as EffectSubscription[];
  let materialized = false;
  const materialize = () => {
    if (!materialized) {
      materialized = true;
      for (let i = start; i < data.length / 2; i++) {
        const effect = d[i];
        if (producer) {
          (effect.backRef ||= new Set()).add(producer);
        }
        restoreEffectBackRefForConsumer(effect);
        effects.add(effect);
      }
    }
  };
  return new Proxy(effects, {
    get(target, prop, receiver) {
      if (prop === 'add') {
        return (value: EffectSubscription) => (target.add(value), receiver);
      }
      if (prop === 'clear') {
        return () => {
          materialized = true;
          target.clear();
        };
      }
      materialize();
      if (prop === 'size') {
        return target.size;
      }
      const value = (target as any)[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const createLazyEffectsField = (
  container: DeserializeContainer,
  data: unknown[],
  index: number,
  producer?: EffectBackRef
) => {
  if (index * 2 >= data.length) {
    return undefined;
  }
  if (data[index * 2] === TypeIds.Set) {
    return createLazyEffects(container, data[index * 2 + 1] as unknown[], 0, producer);
  }
  const effects = (wrapDeserializerProxy(container as any, data) as any[])[index] as
    | Set<EffectSubscription>
    | undefined;
  if (producer) {
    restoreEffectBackRefForEffects(effects, producer);
  }
  return effects;
};

const createLazyEffectsMapField = (
  container: DeserializeContainer,
  data: unknown[],
  index: number,
  producer?: EffectBackRef
) => {
  if (index * 2 >= data.length) {
    return undefined;
  }
  if (data[index * 2] !== TypeIds.Map) {
    const effectsMap = (wrapDeserializerProxy(container as any, data) as any[])[index] as
      | Map<string | symbol, Set<EffectSubscription>>
      | undefined;
    if (producer) {
      restoreEffectBackRefForEffectsMap(effectsMap, producer);
    }
    return effectsMap;
  }
  const mapData = data[index * 2 + 1] as unknown[];
  const d = wrapDeserializerProxy(container as any, mapData) as unknown[];
  const map = new Map<string | symbol, Set<EffectSubscription>>();
  let materialized = false;
  const materialize = () => {
    if (!materialized) {
      materialized = true;
      for (let i = 0; i < mapData.length / 2; i += 2) {
        map.set(
          d[i] as string | symbol,
          createLazyEffectsField(container, mapData, i + 1, producer)!
        );
      }
    }
  };
  return new Proxy(map, {
    get(target, prop, receiver) {
      if (prop === 'set') {
        return (key: string | symbol, value: Set<EffectSubscription>) => (
          target.set(key, value),
          receiver
        );
      }
      if (prop === 'clear') {
        return () => {
          materialized = true;
          target.clear();
        };
      }
      materialize();
      if (prop === 'size') {
        return target.size;
      }
      const value = (target as any)[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

const createLazySubscriptionsField = (
  container: DeserializeContainer,
  data: unknown[],
  index: number
) => {
  if (data[index * 2] === TypeIds.Set) {
    return createLazyEffectsField(container, data, index)!;
  }
  if (data[index * 2] === TypeIds.Map) {
    return createLazyEffectsMapField(container, data, index)!;
  }
  return (wrapDeserializerProxy(container as any, data) as any[])[index] as
    | Set<EffectSubscription>
    | Map<string | symbol, Set<EffectSubscription>>;
};

const hasLazyEffects = (typeId: TypeIds) =>
  typeId === TypeIds.WrappedSignal ||
  typeId === TypeIds.AsyncSignal ||
  typeId === TypeIds.ComputedSignal ||
  typeId === TypeIds.SerializerSignal ||
  typeId === TypeIds.SubscriptionPatch;

function* inflateIterator(
  container: DeserializeContainer,
  target: unknown,
  typeId: TypeIds,
  data: unknown
): Generator<void, void, void> {
  if (typeId === TypeIds.Plain) {
    return;
  }
  if (typeId !== TypeIds.Array && !hasLazyEffects(typeId) && Array.isArray(data)) {
    data = yield* eagerDeserializeArrayIterator(container, data);
  }
  switch (typeId) {
    case TypeIds.Array:
      yield* eagerDeserializeArrayIterator(container, data as unknown[], target as unknown[]);
      break;
    case TypeIds.Object:
      if (data === 0) {
        break;
      }
      for (let i = 0; i < (data as any[]).length; i += 2) {
        const key = (data as unknown[])[i];
        const value = (data as unknown[])[i + 1];
        if (isSafeObjectKV(key, value)) {
          (target as Record<string, unknown>)[key] = value;
        }
        yield;
      }
      break;
    case TypeIds.Set: {
      const set = target as Set<unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        set.add(d[i]);
        yield;
      }
      break;
    }
    case TypeIds.Map: {
      const map = target as Map<unknown, unknown>;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        map.set(d[i++], d[i]);
        yield;
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
    case TypeIds.Error: {
      const d = data as string[];
      (target as Error).message = d[0] as string;
      for (let i = 1; i < d.length; i += 2) {
        (target as any)[d[i]] = d[i + 1];
        yield;
      }
      break;
    }
    case TypeIds.Task: {
      const task = target as Task;
      const v = data as any[];
      task.$qrl$ = v[0];
      task.$flags$ = v[1];
      task.$index$ = v[2];
      task.$el$ = v[3] as HostElement;
      task.$state$ = v[4];
      break;
    }
    case TypeIds.Component:
      (target as any)[SERIALIZABLE_STATE][0] = (data as any[])[0];
      break;
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
      const d = wrapDeserializerProxy(container as any, data) as [
        number,
        unknown[],
        AllSignalFlags,
        HostElement,
        ...EffectSubscription[],
      ];
      signal.$func$ = container.getSyncFn(d[0]);
      signal.$args$ = d[1];
      signal.$untrackedValue$ = NEEDS_COMPUTATION;
      signal.$flags$ = d[2];
      signal.$flags$ |= SignalFlags.INVALID;
      signal.$hostElement$ = d[3];
      signal.$effects$ = createLazyEffects(container, data as unknown[], 4, signal);
      inflateWrappedSignalValue(signal);
      break;
    }
    case TypeIds.AsyncSignal: {
      const asyncSignal = target as AsyncSignalImpl<unknown>;
      const d = wrapDeserializerProxy(container as any, data) as [
        AsyncQRL<unknown>,
        Array<EffectSubscription> | undefined,
        Array<EffectSubscription> | undefined,
        Array<EffectSubscription> | undefined,
        Error | undefined,
        number?,
        unknown?,
        number?,
        number?,
        number?,
      ];
      asyncSignal.$computeQrl$ = d[0] as AsyncQRL<unknown>;
      asyncSignal.$effects$ = createLazyEffectsField(container, data as unknown[], 1, asyncSignal);
      asyncSignal.$loadingEffects$ = createLazyEffectsField(
        container,
        data as unknown[],
        2,
        asyncSignal
      );
      asyncSignal.$errorEffects$ = createLazyEffectsField(
        container,
        data as unknown[],
        3,
        asyncSignal
      );
      if (d[4]) {
        asyncSignal.$untrackedError$ = d[4];
      }

      asyncSignal.$flags$ = (d[5] as number) ?? 0;

      if (asyncSignal.$flags$ & AsyncSignalFlags.CLIENT_ONLY) {
        asyncSignal.$untrackedLoading$ = true;
      }

      const hasValue = d.length > 6;
      if (hasValue) {
        asyncSignal.$untrackedValue$ = d[6];
      }
      if (asyncSignal.$untrackedValue$ === NEEDS_COMPUTATION) {
        asyncSignal.$flags$ |= SignalFlags.INVALID;
      }

      const rawExpires = (d[7] ?? 0) as number;
      asyncSignal.expires = Math.abs(rawExpires);
      if (rawExpires < 0) {
        asyncSignal.$flags$ |= AsyncSignalFlags.NO_POLL;
      }

      if (d[8] !== undefined && d[8] !== 1) {
        asyncSignal.$concurrency$ = (d[8] ?? 1) as number;
        asyncSignal.$jobs$ = [];
      }
      asyncSignal.$timeoutMs$ = (d[9] ?? 0) as number;
      break;
    }
    case TypeIds.SerializerSignal:
    case TypeIds.ComputedSignal: {
      const computed = target as ComputedSignalImpl<unknown>;
      const d = wrapDeserializerProxy(container as any, data) as [
        QRLInternal<() => {}>,
        EffectSubscription[] | undefined,
        unknown?,
      ];
      computed.$computeQrl$ = d[0];
      const p = computed.$computeQrl$.resolve(container as any).catch(() => {
        // ignore preload errors
      });
      loading = loading.finally(() => p);
      computed.$effects$ = createLazyEffectsField(container, data as unknown[], 1, computed);
      const hasValue = d.length > 2;
      if (hasValue) {
        computed.$untrackedValue$ = d[2];
      }
      if (typeId !== TypeIds.SerializerSignal && computed.$untrackedValue$ !== NEEDS_COMPUTATION) {
        computed.$flags$ &= ~SignalFlags.INVALID;
      }
      break;
    }
    case TypeIds.FormData: {
      const formData = target as FormData;
      const d = data as any[];
      for (let i = 0; i < d.length; i++) {
        formData.append(d[i++], d[i]);
        yield;
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
    case TypeIds.PropsProxy: {
      const propsProxy = target as PropsProxy;
      const d = data as [
        JSXNodeImpl | typeof _UNINITIALIZED,
        Props,
        Props | null,
        Map<string | symbol, Set<EffectSubscription>> | undefined,
      ];
      let owner = d[0];
      if (owner === _UNINITIALIZED) {
        owner = new JSXNodeImpl(Fragment, d[1], d[2], null, 0, null);
        owner._proxy = propsProxy;
      }
      propsProxy[_OWNER] = owner;
      const propsHandler = propsProxy[_PROPS_HANDLER];
      propsHandler.$effects$ = d[3];
      restoreEffectBackRefForEffectsMap(propsHandler.$effects$, propsProxy);
      break;
    }
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
    case TypeIds.SubscriptionPatch: {
      const patch = target as SubscriptionPatch;
      const d = wrapDeserializerProxy(container as any, data) as [
        number,
        Set<EffectSubscription> | Map<string | symbol, Set<EffectSubscription>>,
      ];
      patch.rootId = d[0];
      patch.subscriptions = createLazySubscriptionsField(container, data as unknown[], 1);
      break;
    }
    case TypeIds.Uint8Array: {
      const bytes = target as Uint8Array;
      const buf = atob(data as string);
      for (let j = 0; j < buf.length; j++) {
        bytes[j] = buf.charCodeAt(j);
        if ((j & 31) === 31) {
          yield;
        }
      }
      break;
    }
    case TypeIds.Store: {
      const store = unwrapStore(target) as object;
      const storeTarget = pendingStoreTargets.get(store);
      if (storeTarget) {
        pendingStoreTargets.delete(store);
        yield* inflateIterator(container, store, storeTarget.t, storeTarget.v);
      }
      const [, flags, effects] = data as unknown[];
      const storeHandler = getStoreHandler(target as object)!;
      storeHandler.$flags$ = flags as StoreFlags;
      storeHandler.$effects$ = effects as any;
      restoreEffectBackRefForEffectsMap(storeHandler.$effects$, store);
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
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
  const isServerSide = qTest ? isServerPlatform() : isServer;
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
