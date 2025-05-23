/** There's [documentation](./serialization.md) */
import { isDev } from '../../build/index.dev';
import type { StreamWriter } from '../../server/types';
import { VNodeDataFlag } from '../../server/types';
import type { VNodeData } from '../../server/vnode-data';
import { type DomContainer } from '../client/dom-container';
import type { VNode } from '../client/types';
import { vnode_getNode, vnode_isVNode, vnode_locate, vnode_toString } from '../client/vnode';
import { isSerializerObj } from '../reactive-primitives/utils';
import type { SerializerArg } from '../reactive-primitives/types';
import {
  getOrCreateStore,
  getStoreHandler,
  getStoreTarget,
  isStore,
} from '../reactive-primitives/impl/store';
import type { ISsrNode, SsrAttrs, SymbolToChunkResolver } from '../ssr/ssr-types';
import { untrack } from '../use/use-core';
import { createResourceReturn, type ResourceReturnInternal } from '../use/use-resource';
import { isTask, Task } from '../use/use-task';
import { componentQrl, isQwikComponent, SERIALIZABLE_STATE } from './component.public';
import { assertDefined, assertTrue } from './error/assert';
import { QError, qError } from './error/error';
import {
  createPropsProxy,
  Fragment,
  isJSXNode,
  isPropsProxy,
  JSXNodeImpl,
} from './jsx/jsx-runtime';
import { Slot } from './jsx/slot.public';
import { getPlatform } from './platform/platform';
import { createQRL, type QRLInternal, type SyncQRLInternal } from './qrl/qrl-class';
import { isQrl, isSyncQrl } from './qrl/qrl-utils';
import type { QRL } from './qrl/qrl.public';
import { ChoreType } from './util-chore-type';
import type { DeserializeContainer, HostElement, ObjToProxyMap } from './types';
import { _CONST_PROPS, _VAR_PROPS } from './utils/constants';
import { isElement, isNode } from './utils/element';
import { EMPTY_ARRAY, EMPTY_OBJ } from './utils/flyweight';
import { ELEMENT_ID, ELEMENT_PROPS, QBackRefs } from './utils/markers';
import { isPromise } from './utils/promises';
import { SerializerSymbol, fastSkipSerialize } from './utils/serialize-utils';
import {
  _EFFECT_BACK_REF,
  EffectSubscriptionProp,
  NEEDS_COMPUTATION,
  SignalFlags,
  STORE_ALL_PROPS,
  type AllSignalFlags,
  type EffectProperty,
  type EffectSubscription,
} from '../reactive-primitives/types';
import { SubscriptionData, type NodePropData } from '../reactive-primitives/subscription-data';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { SerializerSignalImpl } from '../reactive-primitives/impl/serializer-signal-impl';

const deserializedProxyMap = new WeakMap<object, unknown[]>();

type DeserializerProxy<T extends object = object> = T & { [SERIALIZER_PROXY_UNWRAP]: object };

export const isDeserializerProxy = (value: unknown): value is DeserializerProxy => {
  return typeof value === 'object' && value !== null && SERIALIZER_PROXY_UNWRAP in value;
};

export const SERIALIZER_PROXY_UNWRAP = Symbol('UNWRAP');
/** Call this on the serialized root state */
export const wrapDeserializerProxy = (container: DomContainer, data: unknown): unknown[] => {
  if (
    !Array.isArray(data) || // must be an array
    vnode_isVNode(data) || // and not a VNode or Slot
    isDeserializerProxy(data) // and not already wrapped
  ) {
    return data as any;
  }
  let proxy = deserializedProxyMap.get(data);
  if (!proxy) {
    const target = Array(data.length / 2).fill(undefined);
    proxy = new Proxy(target, new DeserializationHandler(container, data)) as unknown[];
    deserializedProxyMap.set(data, proxy);
  }
  return proxy;
};

class DeserializationHandler implements ProxyHandler<object> {
  public $length$: number;

  constructor(
    public $container$: DomContainer,
    public $data$: unknown[]
  ) {
    this.$length$ = this.$data$.length / 2;
  }

  get(target: unknown[], property: PropertyKey, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      // Note that this will only be partially filled in
      return target;
    }
    const i =
      typeof property === 'number'
        ? property
        : typeof property === 'string'
          ? parseInt(property as string, 10)
          : NaN;
    if (Number.isNaN(i) || i < 0 || i >= this.$length$) {
      return Reflect.get(target, property, receiver);
    }
    // The serialized data is an array with 2 values for each item
    const idx = i * 2;
    const typeId = this.$data$[idx] as number;
    const value = this.$data$[idx + 1];
    if (typeId === undefined) {
      // The value is already cached
      return value;
    }

    const container = this.$container$;
    let propValue = allocate(container, typeId, value);
    /** We stored the reference, so now we can inflate, allowing cycles. */
    if (typeId >= TypeIds.Error) {
      propValue = inflate(container, propValue, typeId, value);
    }

    Reflect.set(target, property, propValue);
    this.$data$[idx] = undefined;
    this.$data$[idx + 1] = propValue;

    return propValue;
  }

  has(target: object, property: PropertyKey) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  set(target: object, property: PropertyKey, value: any, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return false;
    }
    const out = Reflect.set(target, property, value, receiver);
    const i = typeof property === 'number' ? property : parseInt(property as string, 10);
    if (Number.isNaN(i) || i < 0 || i >= this.$data$.length / 2) {
      return out;
    }
    const idx = i * 2;
    this.$data$[idx] = undefined;
    this.$data$[idx + 1] = value;
    return true;
  }
}

/**
 * Restores an array eagerly. If you need it lazily, use `deserializeData(container, TypeIds.Array,
 * array)` instead
 */
export const _eagerDeserializeArray = (
  container: DeserializeContainer,
  data: unknown[]
): unknown[] => {
  const out = Array(data.length / 2);
  for (let i = 0; i < data.length; i += 2) {
    out[i / 2] = deserializeData(container, data[i] as TypeIds, data[i + 1]);
  }
  return out;
};

const resolvers = new WeakMap<Promise<any>, [Function, Function]>();

const inflate = (
  container: DeserializeContainer,
  target: any,
  typeId: TypeIds,
  data: unknown
): unknown => {
  if (typeId === undefined) {
    // Already processed
    return target;
  }
  // restore the complex data, except for plain objects
  if (typeId !== TypeIds.Object && Array.isArray(data)) {
    data = _eagerDeserializeArray(container, data);
  }
  switch (typeId) {
    case TypeIds.Object:
      // We use getters for making complex values lazy
      for (let i = 0; i < (data as any[]).length; i += 4) {
        const key = deserializeData(
          container,
          (data as any[])[i] as TypeIds,
          (data as any[])[i + 1]
        );
        const valType = (data as TypeIds[])[i + 2];
        const valData = (data as any[])[i + 3];
        if (valType === TypeIds.RootRef || valType >= TypeIds.Error) {
          Object.defineProperty(target, key, {
            get() {
              const value = deserializeData(container, valType, valData);
              // after first deserialize, we can replace the Object.defineProperty with the value
              target[key] = value;
              return value;
            },
            set(value: unknown) {
              Object.defineProperty(target, key, {
                value,
                writable: true,
                enumerable: true,
                configurable: true,
              });
            },
            enumerable: true,
            configurable: true,
          });
        } else {
          target[key] = deserializeData(container, valType, valData);
        }
      }
      break;
    case TypeIds.QRL:
    case TypeIds.PreloadQRL:
      inflateQRL(container, target);
      break;
    case TypeIds.Task:
      const task = target as Task;
      const v = data as any[];
      task.$qrl$ = inflateQRL(container, v[0]);
      task.$flags$ = v[1];
      task.$index$ = v[2];
      task.$el$ = v[3] as HostElement;
      task[_EFFECT_BACK_REF] = v[4] as Map<EffectProperty | string, EffectSubscription> | null;
      task.$state$ = v[5];
      break;
    case TypeIds.Resource:
      const [resolved, result, effects] = data as [boolean, unknown, any];
      const resource = target as ResourceReturnInternal<unknown>;
      if (resolved) {
        resource.value = Promise.resolve(result);
        resource._resolved = result;
        resource._state = 'resolved';
      } else {
        resource.value = Promise.reject(result);
        resource._error = result as Error;
        resource._state = 'rejected';
      }
      getStoreHandler(target)!.$effects$ = effects;
      break;
    case TypeIds.Component:
      target[SERIALIZABLE_STATE][0] = (data as any[])[0];
      break;
    case TypeIds.Store:
    case TypeIds.StoreArray: {
      const [value, flags, effects] = data as unknown[];
      const store = getOrCreateStore(value as object, flags as number, container as DomContainer);
      const storeHandler = getStoreHandler(store)!;
      storeHandler.$effects$ = effects as any;
      target = store;

      break;
    }
    case TypeIds.Signal: {
      const signal = target as SignalImpl<unknown>;
      const d = data as [unknown, ...EffectSubscription[]];
      signal.$untrackedValue$ = d[0];
      signal.$effects$ = new Set(d.slice(1) as EffectSubscription[]);
      break;
    }
    case TypeIds.WrappedSignal: {
      const signal = target as WrappedSignalImpl<unknown>;
      const d = data as [
        number,
        unknown[],
        Map<EffectProperty | string, EffectSubscription> | null,
        AllSignalFlags,
        HostElement,
        ...EffectSubscription[],
      ];
      signal.$func$ = container.getSyncFn(d[0]);
      signal.$args$ = d[1];
      signal[_EFFECT_BACK_REF] = d[2];
      signal.$untrackedValue$ = NEEDS_COMPUTATION;
      signal.$flags$ = d[3];
      signal.$flags$ |= SignalFlags.INVALID;
      signal.$hostElement$ = d[4];
      signal.$effects$ = new Set(d.slice(5) as EffectSubscription[]);
      break;
    }
    // Inflating a SerializerSignal is the same as inflating a ComputedSignal
    case TypeIds.SerializerSignal:
    case TypeIds.ComputedSignal: {
      const computed = target as ComputedSignalImpl<unknown>;
      const d = data as [QRLInternal<() => {}>, EffectSubscription[] | null, unknown?];
      computed.$computeQrl$ = d[0];
      computed.$effects$ = new Set(d[1]);
      const hasValue = d.length > 2;
      if (hasValue) {
        computed.$untrackedValue$ = d[2];
        // The serialized signal is always invalid so it can recreate the custom object
        if (typeId === TypeIds.SerializerSignal) {
          computed.$flags$ |= SignalFlags.INVALID;
        }
      } else {
        computed.$flags$ |= SignalFlags.INVALID;
        /**
         * If we try to compute value and the qrl is not resolved, then system throws an error with
         * qrl promise. To prevent that we should early resolve computed qrl while computed
         * deserialization. This also prevents anything from firing while computed qrls load,
         * because of scheduler
         */
        // try to download qrl in this tick
        computed.$computeQrl$.resolve();
        (container as DomContainer).$scheduler$?.(
          ChoreType.QRL_RESOLVE,
          null,
          computed.$computeQrl$
        );
      }
      break;
    }
    case TypeIds.Error: {
      const d = data as unknown[];
      target.message = d[0];
      for (let i = 1; i < d.length; i += 2) {
        target[d[i] as string] = d[i + 1];
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
      const [type, varProps, constProps, children, flags, key] = data as any[];
      jsx.type = type;
      jsx.varProps = varProps;
      jsx.constProps = constProps;
      jsx.children = children;
      jsx.flags = flags;
      jsx.key = key;
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
      const propsProxy = target as any;
      propsProxy[_VAR_PROPS] = data === 0 ? {} : (data as any)[0];
      propsProxy[_CONST_PROPS] = (data as any)[1];
      break;
    case TypeIds.EffectData: {
      const effectData = target as SubscriptionData;
      effectData.data.$scopedStyleIdPrefix$ = (data as any[])[0];
      effectData.data.$isConst$ = (data as any[])[1];
      break;
    }
    default:
      throw qError(QError.serializeErrorNotImplemented, [typeId]);
  }
  return target;
};

export const _constants = [
  undefined,
  null,
  true,
  false,
  '',
  EMPTY_ARRAY,
  EMPTY_OBJ,
  NEEDS_COMPUTATION,
  STORE_ALL_PROPS,
  Slot,
  Fragment,
  NaN,
  Infinity,
  -Infinity,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER - 1,
  Number.MIN_SAFE_INTEGER,
] as const;
const _constantNames = [
  'undefined',
  'null',
  'true',
  'false',
  "''",
  'EMPTY_ARRAY',
  'EMPTY_OBJ',
  'NEEDS_COMPUTATION',
  'STORE_ALL_PROPS',
  'Slot',
  'Fragment',
  'NaN',
  'Infinity',
  '-Infinity',
  'MAX_SAFE_INTEGER',
  'MAX_SAFE_INTEGER-1',
  'MIN_SAFE_INTEGER',
] as const;

const allocate = (container: DeserializeContainer, typeId: number, value: unknown): any => {
  if (value === undefined) {
    // When a value was already processed, the result is stored in type
    return typeId;
  }
  switch (typeId) {
    case TypeIds.RootRef:
      return container.$getObjectById$(value as number);
    case TypeIds.ForwardRef:
      if (!container.$forwardRefs$) {
        throw qError(QError.serializeErrorCannotAllocate, ['forward ref']);
      }
      return container.$getObjectById$(container.$forwardRefs$[value as number]);
    case TypeIds.ForwardRefs:
      return value;
    case TypeIds.Constant:
      return _constants[value as Constants];
    case TypeIds.Number:
      return value as number;
    case TypeIds.Array:
      return wrapDeserializerProxy(container as any, value as any[]);
    case TypeIds.Object:
      return {};
    case TypeIds.QRL:
    case TypeIds.PreloadQRL:
      const qrl =
        typeof value === 'number'
          ? // root reference
            container.$getObjectById$(value)
          : value;
      return parseQRL(qrl as string);
    case TypeIds.Task:
      return new Task(-1, -1, null!, null!, null!, null);
    case TypeIds.Resource: {
      const res = createResourceReturn(
        container as any,
        // we don't care about the timeout value
        undefined,
        undefined
      );
      res.loading = false;
      return res;
    }
    case TypeIds.URL:
      return new URL(value as string);
    case TypeIds.Date:
      return new Date(value as number);
    case TypeIds.Regex:
      const idx = (value as string).lastIndexOf('/');
      return new RegExp((value as string).slice(1, idx), (value as string).slice(idx + 1));
    case TypeIds.Error:
      return new Error();
    case TypeIds.Component:
      return componentQrl(null!);
    case TypeIds.Signal:
      return new SignalImpl(container as any, 0);
    case TypeIds.WrappedSignal:
      return new WrappedSignalImpl(container as any, null!, null!, null!);
    case TypeIds.ComputedSignal:
      return new ComputedSignalImpl(container as any, null!);
    case TypeIds.SerializerSignal:
      return new SerializerSignalImpl(container as any, null!);
    case TypeIds.Store:
    case TypeIds.StoreArray:
      // ignore allocate, we need to assign target while creating store
      return null;
    case TypeIds.URLSearchParams:
      return new URLSearchParams(value as string);
    case TypeIds.FormData:
      return new FormData();
    case TypeIds.JSXNode:
      return new JSXNodeImpl(null!, null!, null!, null!, -1, null);
    case TypeIds.BigInt:
      return BigInt(value as string);
    case TypeIds.Set:
      return new Set();
    case TypeIds.Map:
      return new Map();
    case TypeIds.String:
      return value as string;
    case TypeIds.Promise:
      let resolve!: (value: any) => void;
      let reject!: (error: any) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      resolvers.set(promise, [resolve, reject]);
      // Don't leave unhandled promise rejections
      promise.catch(() => {});
      return promise;
    case TypeIds.Uint8Array:
      const encodedLength = (value as string).length;
      const blocks = encodedLength >>> 2;
      const rest = encodedLength & 3;
      const decodedLength = blocks * 3 + (rest ? rest - 1 : 0);
      return new Uint8Array(decodedLength);
    case TypeIds.PropsProxy:
      return createPropsProxy(null!, null);
    case TypeIds.VNode:
      return retrieveVNodeOrDocument(container, value);
    case TypeIds.RefVNode:
      const vNode = retrieveVNodeOrDocument(container, value);
      if (vnode_isVNode(vNode)) {
        return vnode_getNode(vNode);
      } else {
        throw qError(QError.serializeErrorExpectedVNode, [typeof vNode]);
      }
    case TypeIds.EffectData:
      return new SubscriptionData({} as NodePropData);

    default:
      throw qError(QError.serializeErrorCannotAllocate, [typeId]);
  }
};

function retrieveVNodeOrDocument(
  container: DeserializeContainer,
  value: unknown | null
): VNode | Document | undefined {
  return value
    ? (container as any).rootVNode
      ? vnode_locate((container as any).rootVNode, value as string)
      : undefined
    : container.element?.ownerDocument;
}

/** Parses "chunk#hash[...rootRef]" */
export function parseQRL(qrl: string): QRLInternal<any> {
  const hashIdx = qrl.indexOf('#');
  const captureStart = qrl.indexOf('[', hashIdx);
  const captureEnd = qrl.indexOf(']', captureStart);
  const chunk = hashIdx > -1 ? qrl.slice(0, hashIdx) : qrl.slice(0, captureStart);

  const symbol = captureStart > -1 ? qrl.slice(hashIdx + 1, captureStart) : qrl.slice(hashIdx + 1);
  const captureIds =
    captureStart > -1 && captureEnd > -1
      ? qrl
          .slice(captureStart + 1, captureEnd)
          .split(' ')
          .filter((v) => v.length)
          .map((s) => parseInt(s, 10))
      : null;
  let qrlRef = null;
  if (isDev && chunk === QRL_RUNTIME_CHUNK) {
    const backChannel: Map<string, Function> = (globalThis as any).__qrl_back_channel__;
    assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    qrlRef = backChannel.get(symbol);
  }
  return createQRL(chunk, symbol, qrlRef, null, captureIds, null);
}

export function inflateQRL(container: DeserializeContainer, qrl: QRLInternal<any>) {
  const captureIds = qrl.$capture$;
  qrl.$captureRef$ = captureIds ? captureIds.map((id) => container.$getObjectById$(id)) : null;
  if (container.element) {
    qrl.$setContainer$(container.element);
  }
  return qrl;
}

/** A selection of attributes of the real thing */
type SsrNode = {
  id: string;
  children: ISsrNode[] | null;
  vnodeData: VNodeData;
  [_EFFECT_BACK_REF]: Map<EffectProperty | string, EffectSubscription> | null;
};

type DomRef = {
  $ssrNode$: SsrNode;
};

type SeenRef = {
  $parent$: unknown | null;
  $index$: number;
  $rootIndex$: number;
};

let isDomRef = (obj: unknown): obj is DomRef => false;

export interface SerializationContext {
  $serialize$: () => void;

  $symbolToChunkResolver$: SymbolToChunkResolver;

  /**
   * Map from object to parent and index reference.
   *
   * If object is found in `objMap` will return the parent reference and index path.
   *
   * `objMap` return:
   *
   * - `{ parent, index }` - The parent object and the index within that parent.
   * - `undefined` - Object has not been seen yet.
   */
  $wasSeen$: (obj: unknown) => SeenRef | undefined;

  $hasRootId$: (obj: unknown) => number | undefined;

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   *
   * Returns a path string representing the path from roots through all parents to the object.
   * Format: "3 2 0" where each number is the index within its parent, from root to leaf.
   */
  $addRoot$: (obj: unknown, parent?: unknown) => number;

  /**
   * Get root path of the object without creating a new root.
   *
   * This is used during serialization, as new roots can't be created during serialization.
   *
   * The function throws if the root was not found.
   */
  $addRootPath$: (obj: any) => string | number;

  $seen$: (obj: unknown, parent: unknown | null, index: number) => void;

  $roots$: unknown[];
  $pathMap$: Map<unknown, string | number>;

  $addSyncFn$($funcStr$: string | null, argsCount: number, fn: Function): number;

  $isSsrNode$: (obj: unknown) => obj is SsrNode;
  $isDomRef$: (obj: unknown) => obj is DomRef;

  $writer$: StreamWriter;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $resources$: Set<ResourceReturnInternal<unknown>>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;

  $getProp$: (obj: any, prop: string) => any;
  $setProp$: (obj: any, prop: string, value: any) => void;
}

export const createSerializationContext = (
  /**
   * Node constructor, for instanceof checks.
   *
   * A node constructor can be null. For example on the client we can't serialize DOM nodes as
   * server will not know what to do with them.
   */
  NodeConstructor: {
    new (...rest: any[]): { __brand__: 'SsrNode' };
  } | null,
  /** DomRef constructor, for instanceof checks. */
  DomRefConstructor: {
    new (...rest: any[]): { __brand__: 'DomRef' };
  } | null,
  symbolToChunkResolver: SymbolToChunkResolver,
  getProp: (obj: any, prop: string) => any,
  setProp: (obj: any, prop: string, value: any) => void,
  storeProxyMap: ObjToProxyMap,
  writer?: StreamWriter
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = {
      write: (text: string) => buffer.push(text),
      toString: () => buffer.join(''),
    } as StreamWriter;
  }
  const seenObjsMap = new Map<unknown, SeenRef>();
  const rootsPathMap = new Map<unknown, string | number>();
  const syncFnMap = new Map<string, number>();
  const syncFns: string[] = [];
  const roots: unknown[] = [];

  const $wasSeen$ = (obj: unknown) => seenObjsMap.get(obj);
  const $seen$ = (obj: unknown, parent: unknown | null, index: number) => {
    return seenObjsMap.set(obj, { $parent$: parent, $index$: index, $rootIndex$: -1 });
  };

  const $addRootPath$ = (obj: unknown) => {
    const rootPath = rootsPathMap.get(obj);
    if (rootPath) {
      return rootPath;
    }
    const seen = seenObjsMap.get(obj);
    if (!seen) {
      throw qError(QError.serializeErrorMissingRootId, [obj]);
    }
    const path = [];
    let current: typeof seen | undefined = seen;

    // Traverse up through parent references to build a path
    while (current && current.$index$ >= 0) {
      path.unshift(current.$index$);
      if (typeof current.$parent$ !== 'object' || current.$parent$ === null) {
        break;
      }
      current = seenObjsMap.get(current.$parent$);
    }

    const pathStr = path.length > 1 ? path.join(' ') : path.length ? path[0] : seen.$index$;
    rootsPathMap.set(obj, pathStr);
    return pathStr;
  };

  const $addRoot$ = (obj: any, parent: unknown = null) => {
    let seen = seenObjsMap.get(obj);
    if (!seen) {
      const rootIndex = roots.length;
      seen = { $parent$: parent, $index$: rootIndex, $rootIndex$: rootIndex };
      seenObjsMap.set(obj, seen);
      roots.push(obj);
    } else if (seen.$rootIndex$ === -1) {
      seen.$rootIndex$ = roots.length;
      roots.push(obj);
    }
    $addRootPath$(obj);
    return seen.$rootIndex$;
  };

  const isSsrNode = (
    NodeConstructor ? (obj) => obj instanceof NodeConstructor : ((() => false) as any)
  ) as (obj: unknown) => obj is SsrNode;

  isDomRef = (
    DomRefConstructor ? (obj) => obj instanceof DomRefConstructor : ((() => false) as any)
  ) as (obj: unknown) => obj is DomRef;

  return {
    async $serialize$(): Promise<void> {
      return await serialize(this);
    },
    $isSsrNode$: isSsrNode,
    $isDomRef$: isDomRef,
    $symbolToChunkResolver$: symbolToChunkResolver,
    $wasSeen$,
    $roots$: roots,
    $seen$,
    $hasRootId$: (obj: any) => {
      const id = seenObjsMap.get(obj);
      return id?.$parent$ === null ? id.$index$ : undefined;
    },
    $addRoot$,
    $addRootPath$,
    $syncFns$: syncFns,
    $addSyncFn$: (funcStr: string | null, argCount: number, fn: Function) => {
      const isFullFn = funcStr == null;
      if (isFullFn) {
        funcStr = ((fn as any).serialized as string) || fn.toString();
      }
      let id = syncFnMap.get(funcStr!);
      if (id === undefined) {
        id = syncFns.length;
        syncFnMap.set(funcStr!, id);
        if (isFullFn) {
          syncFns.push(funcStr!);
        } else {
          let code = '(';
          for (let i = 0; i < argCount; i++) {
            code += (i == 0 ? 'p' : ',p') + i;
          }
          syncFns.push((code += ')=>' + funcStr));
        }
      }
      return id;
    },
    $writer$: writer,
    $eventQrls$: new Set<QRL>(),
    $eventNames$: new Set<string>(),
    $resources$: new Set<ResourceReturnInternal<unknown>>(),
    $renderSymbols$: new Set<string>(),
    $storeProxyMap$: storeProxyMap,
    $getProp$: getProp,
    $setProp$: setProp,
    $pathMap$: rootsPathMap,
  };
};

function $discoverRoots$(
  serializationContext: SerializationContext,
  obj: unknown,
  parent: unknown,
  index: number
): void {
  const { $wasSeen$, $seen$, $addRoot$ } = serializationContext;
  if (!(shouldTrackObj(obj) || frameworkType(obj))) {
    return;
  }
  const seen = $wasSeen$(obj);
  if (seen === undefined) {
    // First time seeing this object, track its parent and index
    $seen$(obj, parent, index);
  } else {
    $addRoot$(obj, parent);
  }
}

const isSsrAttrs = (value: number | SsrAttrs): value is SsrAttrs =>
  Array.isArray(value) && value.length > 0;

const discoverValuesForVNodeData = (vnodeData: VNodeData, callback: (value: unknown) => void) => {
  for (const value of vnodeData) {
    if (isSsrAttrs(value)) {
      for (let i = 1; i < value.length; i += 2) {
        const keyValue = value[i - 1];
        const attrValue = value[i];
        if (
          typeof attrValue === 'string' ||
          // skip empty props
          (keyValue === ELEMENT_PROPS &&
            Object.keys(attrValue as Record<string, unknown>).length === 0)
        ) {
          continue;
        }
        callback(attrValue);
      }
    }
  }
};

class PromiseResult {
  constructor(
    public $type$: number,
    public $resolved$: boolean,
    public $value$: unknown,
    public $effects$:
      | Map<string | symbol, Set<EffectSubscription>>
      | Set<EffectSubscription>
      | null = null,
    public $qrl$: QRLInternal | null = null
  ) {}
}
/**
 * Format:
 *
 * - This encodes the $roots$ array.
 * - The output is a string of comma separated JSON values.
 * - Even values are always numbers, specifying the type of the next value.
 * - Odd values are numbers, strings (JSON stringified with `</` escaping) or arrays (same format).
 * - Therefore root indexes need to be doubled to get the actual index.
 */
async function serialize(serializationContext: SerializationContext): Promise<void> {
  const { $writer$, $isSsrNode$, $isDomRef$, $storeProxyMap$, $addRoot$, $pathMap$, $wasSeen$ } =
    serializationContext;
  let depth = 0;
  const forwardRefs: number[] = [];
  let forwardRefsId = 0;
  const promises: Set<Promise<unknown>> = new Set();
  const preloadQrls = new Set<QRLInternal>();
  let parent: unknown = null;
  const isRootObject = () => depth === 0;

  const outputArray = (value: unknown[], writeFn: (value: unknown, idx: number) => void) => {
    $writer$.write('[');
    let separator = false;
    // TODO only until last non-null value
    for (let i = 0; i < value.length; i++) {
      if (separator) {
        $writer$.write(',');
      } else {
        separator = true;
      }
      writeFn(value[i], i);
    }
    $writer$.write(']');
  };

  const output = (type: number, value: number | string | any[]) => {
    $writer$.write(`${type},`);
    if (typeof value === 'number') {
      $writer$.write(value.toString());
    } else if (typeof value === 'string') {
      const s = JSON.stringify(value);
      let angleBracketIdx: number = -1;
      let lastIdx = 0;
      while ((angleBracketIdx = s.indexOf('</', lastIdx)) !== -1) {
        $writer$.write(s.slice(lastIdx, angleBracketIdx));
        $writer$.write('<\\/');
        lastIdx = angleBracketIdx + 2;
      }
      $writer$.write(lastIdx === 0 ? s : s.slice(lastIdx));
    } else {
      depth++;
      outputArray(value, (valueItem, idx) => {
        $discoverRoots$(serializationContext, valueItem, parent, idx);
        writeValue(valueItem);
      });
      depth--;
    }
  };

  const addPreloadQrl = (qrl: QRLInternal) => {
    preloadQrls.add(qrl);
    serializationContext.$addRoot$(qrl, null);
  };

  const outputRootRef = (value: unknown, rootDepth = 0) => {
    const seen = $wasSeen$(value);
    const rootRefPath = $pathMap$.get(value);
    if (rootDepth === depth && seen && seen.$parent$ !== null && rootRefPath) {
      output(TypeIds.RootRef, rootRefPath);
      return true;
    } else if (depth > rootDepth && seen && seen.$rootIndex$ !== -1) {
      output(TypeIds.RootRef, seen.$rootIndex$);
      return true;
    }
    return false;
  };

  const writeValue = (value: unknown) => {
    if (fastSkipSerialize(value as object | Function)) {
      output(TypeIds.Constant, Constants.Undefined);
    } else if (typeof value === 'bigint') {
      output(TypeIds.BigInt, value.toString());
    } else if (typeof value === 'boolean') {
      output(TypeIds.Constant, value ? Constants.True : Constants.False);
    } else if (typeof value === 'function') {
      if (value === Slot) {
        output(TypeIds.Constant, Constants.Slot);
      } else if (value === Fragment) {
        output(TypeIds.Constant, Constants.Fragment);
      } else if (isQrl(value)) {
        if (!outputRootRef(value)) {
          const qrl = qrlToString(serializationContext, value);
          const type = preloadQrls.has(value) ? TypeIds.PreloadQRL : TypeIds.QRL;
          if (isRootObject()) {
            output(type, qrl);
          } else {
            const id = serializationContext.$addRoot$(qrl);
            output(type, id);
          }
        }
      } else if (isQwikComponent(value)) {
        const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
        serializationContext.$renderSymbols$.add(qrl.$symbol$);
        output(TypeIds.Component, [qrl]);
      } else {
        throw qError(QError.serializeErrorCannotSerializeFunction, [value.toString()]);
      }
    } else if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        output(TypeIds.Constant, Constants.NaN);
      } else if (!Number.isFinite(value)) {
        output(
          TypeIds.Constant,
          value < 0 ? Constants.NegativeInfinity : Constants.PositiveInfinity
        );
      } else if (value === Number.MAX_SAFE_INTEGER) {
        output(TypeIds.Constant, Constants.MaxSafeInt);
      } else if (value === Number.MAX_SAFE_INTEGER - 1) {
        output(TypeIds.Constant, Constants.AlmostMaxSafeInt);
      } else if (value === Number.MIN_SAFE_INTEGER) {
        output(TypeIds.Constant, Constants.MinSafeInt);
      } else {
        output(TypeIds.Number, value);
      }
    } else if (typeof value === 'object') {
      if (value === EMPTY_ARRAY) {
        output(TypeIds.Constant, Constants.EMPTY_ARRAY);
      } else if (value === EMPTY_OBJ) {
        output(TypeIds.Constant, Constants.EMPTY_OBJ);
      } else if (value === null) {
        output(TypeIds.Constant, Constants.Null);
      } else {
        depth++;
        const oldParent = parent;
        parent = value;
        writeObjectValue(value);
        parent = oldParent;
        depth--;
      }
    } else if (typeof value === 'string') {
      if (value.length === 0) {
        output(TypeIds.Constant, Constants.EmptyString);
      } else {
        if (!outputRootRef(value)) {
          output(TypeIds.String, value);
        }
      }
    } else if (typeof value === 'undefined') {
      output(TypeIds.Constant, Constants.Undefined);
    } else if (value === NEEDS_COMPUTATION) {
      output(TypeIds.Constant, Constants.NEEDS_COMPUTATION);
    } else if (value === STORE_ALL_PROPS) {
      output(TypeIds.Constant, Constants.STORE_ALL_PROPS);
    } else {
      throw qError(QError.serializeErrorUnknownType, [typeof value]);
    }
  };

  const writeObjectValue = (value: {}) => {
    /**
     * The object writer outputs an array object (without type prefix) and this increases the depth
     * for the objects within (depth 1).
     */
    // Objects are the only way to create circular dependencies.
    // So the first thing to to is to see if we have a circular dependency.
    // (NOTE: For root objects we need to serialize them regardless if we have seen
    //        them before, otherwise the root object reference will point to itself.)
    // Also note that depth will be 1 for objects in root
    if (outputRootRef(value, 1)) {
      return;
    }

    if (isPropsProxy(value)) {
      const varProps = value[_VAR_PROPS];
      const constProps = value[_CONST_PROPS];
      const out = constProps
        ? [varProps, constProps]
        : Object.keys(varProps).length
          ? [varProps]
          : 0;
      output(TypeIds.PropsProxy, out);
    } else if (value instanceof SubscriptionData) {
      output(TypeIds.EffectData, [value.data.$scopedStyleIdPrefix$, value.data.$isConst$]);
    } else if (isStore(value)) {
      if (isResource(value)) {
        // let render know about the resource
        serializationContext.$resources$.add(value);
        // TODO the effects include the resource return which has duplicate data
        const forwardRefId = $resolvePromise$(value.value, $addRoot$, (resolved, resolvedValue) => {
          return new PromiseResult(
            TypeIds.Resource,
            resolved,
            resolvedValue,
            getStoreHandler(value)!.$effects$
          );
        });
        output(TypeIds.ForwardRef, forwardRefId);
      } else {
        const storeHandler = getStoreHandler(value)!;
        const storeTarget = getStoreTarget(value);
        const flags = storeHandler.$flags$;
        const effects = storeHandler.$effects$;

        const innerStores = [];
        for (const prop in storeTarget) {
          const propValue = (storeTarget as any)[prop];
          if ($storeProxyMap$.has(propValue)) {
            const innerStore = $storeProxyMap$.get(propValue);
            innerStores.push(innerStore);
            serializationContext.$addRoot$(innerStore);
          }
        }

        const out = [storeTarget, flags, effects, ...innerStores];
        while (out[out.length - 1] == null) {
          out.pop();
        }
        output(Array.isArray(storeTarget) ? TypeIds.StoreArray : TypeIds.Store, out);
      }
    } else if (isSerializerObj(value)) {
      const result = value[SerializerSymbol](value);
      if (isPromise(result)) {
        const forwardRef = $resolvePromise$(result, $addRoot$, (resolved, resolvedValue) => {
          return new PromiseResult(TypeIds.SerializerSignal, resolved, resolvedValue, null, null);
        });
        output(TypeIds.ForwardRef, forwardRef);
      } else {
        depth--;
        writeValue(result);
        depth++;
      }
    } else if (isObjectLiteral(value)) {
      if (Array.isArray(value)) {
        output(TypeIds.Array, value);
      } else {
        const out: any[] = [];
        for (const key in value) {
          if (
            Object.prototype.hasOwnProperty.call(value, key) &&
            !fastSkipSerialize((value as any)[key])
          ) {
            out.push(key, (value as any)[key]);
          }
        }
        // TODO if !out.length, output 0 and restore as {}
        output(TypeIds.Object, out);
      }
    } else if ($isDomRef$(value)) {
      value.$ssrNode$.vnodeData[0] |= VNodeDataFlag.SERIALIZE;
      output(TypeIds.RefVNode, value.$ssrNode$.id);
    } else if (value instanceof SignalImpl) {
      if (value instanceof SerializerSignalImpl) {
        addPreloadQrl(value.$computeQrl$);
        const forwardRefId = $resolvePromise$(
          $getCustomSerializerPromise$(value, value.$untrackedValue$),
          $addRoot$,
          (resolved, resolvedValue) => {
            return new PromiseResult(
              TypeIds.SerializerSignal,
              resolved,
              resolvedValue,
              value.$effects$,
              value.$computeQrl$
            );
          }
        );
        output(TypeIds.ForwardRef, forwardRefId);
        return;
      }
      /**
       * Special case: when a Signal value is an SSRNode, it always needs to be a DOM ref instead.
       * It can never be meant to become a vNode, because vNodes are internal only.
       */
      const v: unknown =
        value instanceof ComputedSignalImpl &&
        (value.$flags$ & SignalFlags.INVALID || fastSkipSerialize(value.$untrackedValue$))
          ? NEEDS_COMPUTATION
          : value.$untrackedValue$;

      if (value instanceof WrappedSignalImpl) {
        output(TypeIds.WrappedSignal, [
          ...serializeWrappingFn(serializationContext, value),
          filterEffectBackRefs(value[_EFFECT_BACK_REF]),
          value.$flags$,
          value.$hostElement$,
          ...(value.$effects$ || []),
        ]);
      } else if (value instanceof ComputedSignalImpl) {
        addPreloadQrl(value.$computeQrl$);
        const out: [QRLInternal, Set<EffectSubscription> | null, unknown?] = [
          value.$computeQrl$,
          // TODO check if we can use domVRef for effects
          value.$effects$,
        ];
        if (v !== NEEDS_COMPUTATION) {
          out.push(v);
        }
        output(TypeIds.ComputedSignal, out);
      } else {
        output(TypeIds.Signal, [v, ...(value.$effects$ || [])]);
      }
    } else if (value instanceof URL) {
      output(TypeIds.URL, value.href);
    } else if (value instanceof Date) {
      output(TypeIds.Date, Number.isNaN(value.valueOf()) ? '' : value.valueOf());
    } else if (value instanceof RegExp) {
      output(TypeIds.Regex, value.toString());
    } else if (value instanceof Error) {
      const out: any[] = [value.message];
      // flatten gives us the right output
      out.push(...Object.entries(value).flat());
      /// In production we don't want to leak the stack trace.
      if (isDev) {
        out.push('stack', value.stack);
      }
      output(TypeIds.Error, out);
    } else if ($isSsrNode$(value)) {
      const rootIndex = $addRoot$(value);
      serializationContext.$setProp$(value, ELEMENT_ID, String(rootIndex));
      // we need to output before the vnode overwrites its values
      output(TypeIds.VNode, value.id);
      const vNodeData = value.vnodeData;
      if (vNodeData) {
        discoverValuesForVNodeData(vNodeData, (vNodeDataValue) => $addRoot$(vNodeDataValue));
        vNodeData[0] |= VNodeDataFlag.SERIALIZE;
      }
      if (value.children) {
        // can be static, but we need to save vnode data structure + discover the back refs
        for (const child of value.children) {
          const childVNodeData = child.vnodeData;
          if (childVNodeData) {
            // add all back refs to the roots
            for (const value of childVNodeData) {
              if (isSsrAttrs(value)) {
                const backRefKeyIndex = value.findIndex((v) => v === QBackRefs);
                if (backRefKeyIndex !== -1) {
                  $addRoot$(value[backRefKeyIndex + 1]);
                }
              }
            }
            childVNodeData[0] |= VNodeDataFlag.SERIALIZE;
          }
        }
      }
    } else if (typeof FormData !== 'undefined' && value instanceof FormData) {
      // FormData is generally used only once so don't bother with references
      const array: string[] = [];
      value.forEach((value, key) => {
        if (typeof value === 'string') {
          array.push(key, value);
        } else {
          array.push(key, value.name);
        }
      });
      output(TypeIds.FormData, array);
    } else if (value instanceof URLSearchParams) {
      output(TypeIds.URLSearchParams, value.toString());
    } else if (value instanceof Set) {
      output(TypeIds.Set, [...value.values()]);
    } else if (value instanceof Map) {
      const combined = [];
      for (const [k, v] of value.entries()) {
        combined.push(k, v);
      }
      output(TypeIds.Map, combined);
    } else if (isJSXNode(value)) {
      output(TypeIds.JSXNode, [
        value.type,
        value.varProps,
        value.constProps,
        value.children,
        value.flags,
        value.key,
      ]);
    } else if (value instanceof Task) {
      const out: unknown[] = [
        value.$qrl$,
        value.$flags$,
        value.$index$,
        value.$el$,
        value[_EFFECT_BACK_REF],
        value.$state$,
      ];
      while (out[out.length - 1] == null) {
        out.pop();
      }
      output(TypeIds.Task, out);
    } else if (isPromise(value)) {
      const forwardRefId = $resolvePromise$(value, $addRoot$, (resolved, resolvedValue) => {
        return new PromiseResult(TypeIds.Promise, resolved, resolvedValue);
      });
      output(TypeIds.ForwardRef, forwardRefId);
    } else if (value instanceof PromiseResult) {
      if (value.$type$ === TypeIds.Resource) {
        output(TypeIds.Resource, [value.$resolved$, value.$value$, value.$effects$]);
      } else if (value.$type$ === TypeIds.SerializerSignal) {
        if (value.$qrl$) {
          output(TypeIds.SerializerSignal, [value.$qrl$, value.$effects$, value.$value$]);
        } else if (value.$resolved$) {
          writeValue(value.$value$);
        } else {
          console.error(value.$value$);
          throw qError(QError.serializerSymbolRejectedPromise);
        }
      } else {
        output(TypeIds.Promise, [value.$resolved$, value.$value$]);
      }
    } else if (value instanceof Uint8Array) {
      let buf = '';
      for (const c of value) {
        buf += String.fromCharCode(c);
      }
      const out = btoa(buf).replace(/=+$/, '');
      output(TypeIds.Uint8Array, out);
    } else if (vnode_isVNode(value)) {
      output(TypeIds.Constant, Constants.Undefined);
    } else {
      throw qError(QError.serializeErrorUnknownType, [typeof value]);
    }
  };

  function $resolvePromise$(
    promise: Promise<unknown>,
    $addRoot$: (obj: unknown) => number,
    classCreator: (resolved: boolean, resolvedValue: unknown) => PromiseResult
  ) {
    const forwardRefId = forwardRefsId++;
    promise
      .then((resolvedValue) => {
        promises.delete(promise);
        forwardRefs[forwardRefId] = $addRoot$(classCreator(true, resolvedValue)) as number;
      })
      .catch((err) => {
        promises.delete(promise);
        forwardRefs[forwardRefId] = $addRoot$(classCreator(false, err)) as number;
      });

    promises.add(promise);

    return forwardRefId;
  }

  const outputRoots = async () => {
    $writer$.write('[');

    let lastRootsLength = 0;
    let rootsLength = serializationContext.$roots$.length;
    while (lastRootsLength < rootsLength || promises.size) {
      if (lastRootsLength !== 0) {
        $writer$.write(',');
      }

      let separator = false;
      for (let i = lastRootsLength; i < rootsLength; i++) {
        if (separator) {
          $writer$.write(',');
        } else {
          separator = true;
        }
        writeValue(serializationContext.$roots$[i]);
      }

      if (promises.size) {
        try {
          await Promise.race(promises);
        } catch {
          // ignore rejections, they will be serialized as rejected promises
        }
      }

      lastRootsLength = rootsLength;
      rootsLength = serializationContext.$roots$.length;
    }

    if (forwardRefs.length) {
      $writer$.write(',');
      $writer$.write(TypeIds.ForwardRefs + ',');
      outputArray(forwardRefs, (value) => {
        $writer$.write(String(value));
      });
    }

    $writer$.write(']');
  };

  await outputRoots();
}

function $getCustomSerializerPromise$<T, S>(signal: SerializerSignalImpl<T, S>, value: any) {
  return new Promise((resolve) => {
    (signal.$computeQrl$ as QRLInternal<SerializerArg<T, S>>).resolve().then((arg) => {
      let data;
      if ((arg as any).serialize) {
        data = (arg as any).serialize(value);
      } else if (SerializerSymbol in value) {
        data = (value as any)[SerializerSymbol](value);
      }
      if (data === undefined) {
        data = NEEDS_COMPUTATION;
      }
      resolve(data);
    });
  });
}

function filterEffectBackRefs(effectBackRef: Map<string, EffectSubscription> | null) {
  let effectBackRefToSerialize: Map<string, EffectSubscription> | null = null;
  if (effectBackRef) {
    for (const [effectProp, effect] of effectBackRef) {
      if (effect[EffectSubscriptionProp.BACK_REF]) {
        effectBackRefToSerialize ||= new Map<string, EffectSubscription>();
        effectBackRefToSerialize.set(effectProp, effect);
      }
    }
  }
  return effectBackRefToSerialize;
}

function serializeWrappingFn(
  serializationContext: SerializationContext,
  value: WrappedSignalImpl<any>
) {
  // if value is an object then we need to wrap this in ()
  if (value.$funcStr$ && value.$funcStr$[0] === '{') {
    value.$funcStr$ = `(${value.$funcStr$})`;
  }
  const syncFnId = serializationContext.$addSyncFn$(
    value.$funcStr$,
    value.$args$.length,
    value.$func$
  );
  // TODO null if no args
  return [syncFnId, value.$args$] as const;
}

export function qrlToString(
  serializationContext: SerializationContext,
  value: QRLInternal | SyncQRLInternal
) {
  let symbol = value.$symbol$;
  let chunk = value.$chunk$;

  const platform = getPlatform();
  if (platform) {
    const result = platform.chunkForSymbol(symbol, chunk, value.dev?.file);
    if (result) {
      chunk = result[1];
      symbol = result[0];
    }
  }

  const isSync = isSyncQrl(value);
  if (!isSync) {
    // If we have a symbol we need to resolve the chunk.
    if (!chunk) {
      chunk = serializationContext.$symbolToChunkResolver$(value.$hash$);
    }
    // in Dev mode we need to keep track of the symbols
    if (isDev) {
      let backChannel: Map<string, Function> = (globalThis as any).__qrl_back_channel__;
      if (!backChannel) {
        backChannel = (globalThis as any).__qrl_back_channel__ = new Map();
      }
      backChannel.set(value.$symbol$, (value as any)._devOnlySymbolRef);
      if (!chunk) {
        chunk = QRL_RUNTIME_CHUNK;
      }
    }
    if (!chunk) {
      throw qError(QError.qrlMissingChunk, [value.$symbol$]);
    }
    if (chunk.startsWith('./')) {
      chunk = chunk.slice(2);
    }
  } else {
    const fn = value.resolved as Function;
    chunk = '';
    // TODO test that provided stringified fn is used
    symbol = String(serializationContext.$addSyncFn$(null, 0, fn));
  }

  let qrlStringInline = `${chunk}#${symbol}`;
  if (Array.isArray(value.$captureRef$) && value.$captureRef$.length > 0) {
    let serializedReferences = '';
    // hot-path optimization
    for (let i = 0; i < value.$captureRef$.length; i++) {
      if (i > 0) {
        serializedReferences += ' ';
      }
      // We refer by id so every capture needs to be a root
      serializedReferences += serializationContext.$addRoot$(value.$captureRef$[i]);
    }
    qrlStringInline += `[${serializedReferences}]`;
  } else if (value.$capture$ && value.$capture$.length > 0) {
    qrlStringInline += `[${value.$capture$.join(' ')}]`;
  }
  return qrlStringInline;
}

/**
 * Serialize data to string using SerializationContext.
 *
 * @param data - Data to serialize
 * @internal
 */
export async function _serialize(data: unknown[]): Promise<string> {
  const serializationContext = createSerializationContext(
    null,
    null,
    () => '',
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

  for (const root of data) {
    serializationContext.$addRoot$(root);
  }
  await serializationContext.$serialize$();
  return serializationContext.$writer$.toString();
}

/**
 * Deserialize data from string to an array of objects.
 *
 * @param rawStateData - Data to deserialize
 * @param element - Container element
 * @internal
 */
export function _deserialize(rawStateData: string | null, element?: unknown): unknown[] {
  if (rawStateData == null) {
    return [];
  }
  const stateData = JSON.parse(rawStateData);
  if (!Array.isArray(stateData)) {
    return [];
  }

  let container: DeserializeContainer | undefined;
  if (isNode(element) && isElement(element)) {
    container = _createDeserializeContainer(stateData, element as HTMLElement);
  } else {
    container = _createDeserializeContainer(stateData);
  }
  const output = [];
  for (let i = 0; i < stateData.length; i += 2) {
    output[i / 2] = deserializeData(container, stateData[i], stateData[i + 1]);
  }
  return output;
}

function deserializeData(container: DeserializeContainer, typeId: number, value: unknown) {
  if (typeId === undefined) {
    return value;
  }
  let propValue = allocate(container, typeId, value);
  if (typeId >= TypeIds.Error) {
    propValue = inflate(container, propValue, typeId, value);
  }
  return propValue;
}

export function getObjectById(id: number | string, stateData: unknown[]): unknown {
  if (typeof id === 'string') {
    id = parseInt(id, 10);
  }
  assertTrue(id < stateData.length, `Invalid reference ${id} >= ${stateData.length}`);
  return stateData[id];
}

export function _createDeserializeContainer(
  stateData: unknown[],
  element?: HTMLElement
): DeserializeContainer {
  // eslint-disable-next-line prefer-const
  let state: unknown[];
  const container: DeserializeContainer = {
    $getObjectById$: (id: number | string) => getObjectById(id, state),
    getSyncFn: (_: number) => {
      const fn = () => {};
      return fn;
    },
    $storeProxyMap$: new WeakMap(),
    element: null,
    $forwardRefs$: null,
    $initialQRLsIndexes$: null,
    $scheduler$: null,
  };
  preprocessState(stateData, container);
  state = wrapDeserializerProxy(container as any, stateData);
  container.$state$ = state;
  if (element) {
    container.element = element;
  }
  return container;
}

/**
 * Preprocess the state data to:
 *
 * - Replace RootRef with the actual object
 * - Create a map for forward refs
 * - Create an array of indexes for initial QRLs
 *
 * Before:
 *
 * ```
 * 0 Object [
 *   String "foo"
 *   Object [
 *     String "shared"
 *     Number 1
 *   ]
 * ]
 * 1 Object [
 *   String "bar"
 *   RootRef 2
 * ]
 * 2 RootRef "0 1"
 * (59 chars)
 * ```
 *
 * After:
 *
 * ```
 * 0 Object [
 *   String "foo"
 *   RootRef 2
 * ]
 * 1 Object [
 *   String "bar"
 *   RootRef 2
 * ]
 * 2 Object [
 *   String "shared"
 *   Number 1
 * ]
 * (55 chars)
 * ```
 *
 * @param data - The state data to preprocess
 * @returns The preprocessed state data
 * @internal
 */
export function preprocessState(data: unknown[], container: DeserializeContainer) {
  const isRootDeepRef = (type: TypeIds, value: unknown) => {
    return type === TypeIds.RootRef && typeof value === 'string';
  };

  const isForwardRefsMap = (type: TypeIds) => {
    return type === TypeIds.ForwardRefs;
  };

  const isPreloadQrlType = (type: TypeIds) => {
    return type === TypeIds.PreloadQRL;
  };

  const processRootRef = (index: number) => {
    const rootRefPath = (data[index + 1] as string).split(' ');
    let object: unknown[] | number = data;
    let objectType: TypeIds = TypeIds.RootRef;
    let typeIndex = 0;
    let valueIndex = 0;
    let parent: unknown[] | null = null;

    for (let i = 0; i < rootRefPath.length; i++) {
      parent = object;

      typeIndex = parseInt(rootRefPath[i], 10) * 2;
      valueIndex = typeIndex + 1;

      objectType = object[typeIndex] as TypeIds;
      object = object[valueIndex] as unknown[];

      if (objectType === TypeIds.RootRef) {
        const rootRef = object as unknown as number;
        const rootRefTypeIndex = rootRef * 2;
        objectType = data[rootRefTypeIndex] as TypeIds;
        object = data[rootRefTypeIndex + 1] as unknown[];
      }
    }

    if (parent) {
      parent[typeIndex] = TypeIds.RootRef;
      parent[valueIndex] = index / 2;
    }
    data[index] = objectType;
    data[index + 1] = object;
  };

  for (let i = 0; i < data.length; i += 2) {
    if (isRootDeepRef(data[i] as TypeIds, data[i + 1])) {
      processRootRef(i);
    } else if (isForwardRefsMap(data[i] as TypeIds)) {
      container.$forwardRefs$ = data[i + 1] as number[];
    } else if (isPreloadQrlType(data[i] as TypeIds)) {
      container.$initialQRLsIndexes$ ||= [];
      container.$initialQRLsIndexes$.push(i / 2);
    }
  }
}

/**
 * Tracking all objects in the map would be expensive. For this reason we only track some of the
 * objects.
 *
 * For example we skip:
 *
 * - Short strings
 * - Anything which is not an object. (ie. number, boolean, null, undefined)
 *
 * @param obj
 * @returns
 */
function shouldTrackObj(obj: unknown) {
  return (
    // THINK: Not sure if we need to keep track of functions (QRLs) Let's skip them for now.
    // and see if we have a test case which requires them.
    (typeof obj === 'object' && obj !== null) ||
    /**
     * We track all strings greater than 1 character, because those take at least 6 bytes to encode
     * and even with 999 root objects it saves one byte per reference. Tracking more objects makes
     * the map bigger so we want to strike a balance
     */ (typeof obj === 'string' && obj.length > 1)
  );
}

/**
 * When serializing the object we need check if it is URL, RegExp, Map, Set, etc. This is time
 * consuming. So if we could know that this is a basic object literal we could skip the check, and
 * only run the checks for objects which are not object literals.
 *
 * So this function is here for performance to short circuit many checks later.
 *
 * @param obj
 */
function isObjectLiteral(obj: unknown): obj is object {
  // We are an object literal if:
  // - we are a direct instance of object OR
  // - we are an array
  // In all other cases it is a subclass which requires more checks.
  const prototype = Object.getPrototypeOf(obj);
  return prototype == null || prototype === Object.prototype || prototype === Array.prototype;
}

function isResource<T = unknown>(value: object): value is ResourceReturnInternal<T> {
  return '__brand' in value && value.__brand === 'resource';
}

const frameworkType = (obj: any) => {
  return (
    (typeof obj === 'object' &&
      obj !== null &&
      (obj instanceof SignalImpl || obj instanceof Task || isJSXNode(obj))) ||
    isQrl(obj)
  );
};

export const canSerialize = (value: any, seen: WeakSet<any> = new WeakSet()): boolean => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  } else if (typeof value === 'object') {
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    const proto = Object.getPrototypeOf(value);
    if (isStore(value)) {
      value = getStoreTarget(value);
    }
    if (proto == Object.prototype) {
      for (const key in value) {
        // if the value is a props proxy, then sometimes we could create a component-level subscription,
        // so we should call untrack here to avoid tracking the value
        if (
          !canSerialize(
            untrack(() => value[key]),
            seen
          )
        ) {
          return false;
        }
      }
      return true;
    } else if (proto == Array.prototype) {
      for (let i = 0; i < value.length; i++) {
        if (!canSerialize(value[i], seen)) {
          return false;
        }
      }
      return true;
    } else if (isTask(value)) {
      return true;
    } else if (isPropsProxy(value)) {
      return true;
    } else if (isPromise(value)) {
      return true;
    } else if (isJSXNode(value)) {
      return true;
    } else if (value instanceof Error) {
      return true;
    } else if (value instanceof URL) {
      return true;
    } else if (value instanceof Date) {
      return true;
    } else if (value instanceof RegExp) {
      return true;
    } else if (value instanceof URLSearchParams) {
      return true;
    } else if (value instanceof FormData) {
      return true;
    } else if (value instanceof Set) {
      return true;
    } else if (value instanceof Map) {
      return true;
    } else if (value instanceof Uint8Array) {
      return true;
    } else if (isDomRef?.(value)) {
      return true;
    }
  } else if (typeof value === 'function') {
    if (isQrl(value) || isQwikComponent(value)) {
      return true;
    }
  }
  return false;
};

const QRL_RUNTIME_CHUNK = 'mock-chunk';

export const enum TypeIds {
  RootRef,
  ForwardRef,
  ForwardRefs,
  /** Undefined, null, true, false, NaN, +Inf, -Inf, Slot, Fragment */
  Constant,
  Number,
  String,
  Array,
  URL,
  Date,
  Regex,
  VNode,
  RefVNode,
  BigInt,
  URLSearchParams,
  /// All values below need inflation because they may have reference cycles
  Error,
  Object,
  Promise,
  Set,
  Map,
  Uint8Array,
  QRL,
  PreloadQRL,
  Task,
  Resource,
  Component,
  Signal,
  WrappedSignal,
  ComputedSignal,
  SerializerSignal,
  Store,
  StoreArray,
  FormData,
  JSXNode,
  PropsProxy,
  EffectData,
}
export const _typeIdNames = [
  'RootRef',
  'ForwardRef',
  'ForwardRefs',
  'Constant',
  'Number',
  'String',
  'Array',
  'URL',
  'Date',
  'Regex',
  'VNode',
  'RefVNode',
  'BigInt',
  'URLSearchParams',
  'Error',
  'Object',
  'Promise',
  'Set',
  'Map',
  'Uint8Array',
  'QRL',
  'PreloadQRL',
  'Task',
  'Resource',
  'Component',
  'Signal',
  'WrappedSignal',
  'ComputedSignal',
  'SerializerSignal',
  'Store',
  'StoreArray',
  'FormData',
  'JSXNode',
  'PropsProxy',
  'EffectData',
];

export const enum Constants {
  Undefined,
  Null,
  True,
  False,
  EmptyString,
  EMPTY_ARRAY,
  EMPTY_OBJ,
  NEEDS_COMPUTATION,
  STORE_ALL_PROPS,
  Slot,
  Fragment,
  NaN,
  PositiveInfinity,
  NegativeInfinity,
  MaxSafeInt,
  // used for close fragment
  AlmostMaxSafeInt,
  MinSafeInt,
}

const circularProofJson = (obj: unknown, indent?: string | number) => {
  const seen = new WeakSet();
  return JSON.stringify(
    obj,
    (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return `[Circular ${value.constructor.name}]`;
        }
        seen.add(value);
      }
      return value;
    },
    indent
  );
};
const printRaw = (value: any, prefix: string) => {
  let result = vnode_isVNode(value)
    ? vnode_toString.call(value, 1, '', true).replaceAll(/\n.*/gm, '')
    : typeof value === 'function'
      ? String(value)
      : circularProofJson(value, 2);
  if (result.length > 500) {
    result = result.slice(0, 500) + '"...';
  }
  result = result.replace(/\n/g, '\n' + prefix);
  return result.includes('\n') ? (result = `\n${prefix}${result}`) : result;
};
let hasRaw = false;
/** @internal */
export const dumpState = (
  state: unknown[],
  color = false,
  prefix = '',
  limit: number | null = 20
) => {
  const RED = color ? '\x1b[31m' : '';
  const RESET = color ? '\x1b[0m' : '';
  const isRoot = prefix === '';
  const out: any[] = [];
  for (let i = 0; i < state.length; i++) {
    if (limit && i > 2 * limit) {
      out.push('...');
      break;
    }
    const key = state[i];
    let value = state[++i];
    if (key === undefined) {
      hasRaw = true;
      out.push(
        `${RED}[raw${typeof value === 'object' && value ? ` ${value.constructor.name}` : ''}]${RESET} ${printRaw(value, `${prefix}  `)}`
      );
    } else {
      if (key === TypeIds.Constant) {
        value = constantToName(value as Constants);
      } else if (typeof value === 'string') {
        value = JSON.stringify(value);
        if ((value as string).length > 120) {
          value = (value as string).slice(0, 120) + '"...';
        }
      } else if (key === TypeIds.ForwardRefs) {
        value = '[' + `\n${prefix}  ${(value as number[]).join(`\n${prefix}  `)}\n${prefix}]`;
      } else if (Array.isArray(value)) {
        value = value.length ? `[\n${dumpState(value, color, `${prefix}  `)}\n${prefix}]` : '[]';
      }
      out.push(`${RED}${typeIdToName(key as TypeIds)}${RESET} ${value}`);
    }
  }
  const result = out.map((v, i) => `${prefix}${isRoot ? `${i} ` : ''}${v}`).join('\n');
  if (isRoot) {
    const count = hasRaw ? '' : `(${JSON.stringify(state).length} chars)`;
    hasRaw = false;
    return `\n${result}\n${count}`;
  }
  return result;
};

export const typeIdToName = (code: TypeIds) => {
  return _typeIdNames[code] || `Unknown(${code})`;
};

const constantToName = (code: Constants) => {
  return _constantNames[code] || `Unknown(${code})`;
};
