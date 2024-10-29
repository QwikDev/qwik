/** There's [documentation](./serialization.md) */

import { isDev } from '../../build/index.dev';
import type { StreamWriter } from '../../server/types';
import { VNodeDataFlag } from '../../server/vnode-data';
import { type DomContainer } from '../client/dom-container';
import type { VNode } from '../client/types';
import { vnode_getNode, vnode_isVNode, vnode_locate, vnode_toString } from '../client/vnode';
import {
  ComputedSignal,
  EffectData,
  NEEDS_COMPUTATION,
  Signal,
  WrappedSignal,
} from '../signal/signal';
import type { Subscriber } from '../signal/signal-subscriber';
import {
  STORE_ARRAY_PROP,
  createStore,
  getStoreHandler,
  getStoreTarget,
  isStore,
} from '../signal/store';
import type { SymbolToChunkResolver } from '../ssr/ssr-types';
import { createResourceReturn, type ResourceReturnInternal } from '../use/use-resource';
import { Task, isTask } from '../use/use-task';
import { SERIALIZABLE_STATE, componentQrl, isQwikComponent } from './component.public';
import { assertDefined, assertTrue } from './error/assert';
import {
  Fragment,
  JSXNodeImpl,
  createPropsProxy,
  isJSXNode,
  isPropsProxy,
} from './jsx/jsx-runtime';
import { Slot } from './jsx/slot.public';
import { getPlatform } from './platform/platform';
import {
  createQRL,
  isQrl,
  isSyncQrl,
  type QRLInternal,
  type SyncQRLInternal,
} from './qrl/qrl-class';
import type { QRL } from './qrl/qrl.public';
import { ChoreType } from './scheduler';
import type { DeserializeContainer, HostElement, ObjToProxyMap } from './types';
import { _CONST_PROPS, _VAR_PROPS } from './utils/constants';
import { isElement, isNode } from './utils/element';
import { EMPTY_ARRAY, EMPTY_OBJ } from './utils/flyweight';
import { throwErrorAndStop } from './utils/log';
import { ELEMENT_ID } from './utils/markers';
import { isPromise } from './utils/promises';
import { fastSkipSerialize } from './utils/serialize-utils';
import { type ValueOrPromise } from './utils/types';

const deserializedProxyMap = new WeakMap<object, unknown[]>();

type DeserializerProxy<T extends object = object> = T & { [SERIALIZER_PROXY_UNWRAP]: object };

export const unwrapDeserializerProxy = (value: unknown) => {
  const unwrapped =
    typeof value === 'object' &&
    value !== null &&
    (value as DeserializerProxy)[SERIALIZER_PROXY_UNWRAP];
  return unwrapped ? unwrapped : value;
};

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
      const out = Reflect.get(target, property, receiver);
      return out;
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
    const propValue = allocate(container, typeId, value);
    Reflect.set(target, property, propValue);
    this.$data$[idx] = undefined;
    this.$data$[idx + 1] = propValue;
    /** We stored the reference, so now we can inflate, allowing cycles. */
    if (typeId >= TypeIds.Error) {
      inflate(container, propValue, typeId, value);
    }
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

const inflate = (container: DeserializeContainer, target: any, typeId: TypeIds, data: unknown) => {
  if (typeId === undefined) {
    // Already processed
    return;
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
              return deserializeData(container, valType, valData);
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
      inflateQRL(container, target);
      break;
    case TypeIds.Task:
      const task = target as Task;
      const v = data as any[];
      task.$qrl$ = inflateQRL(container, v[0]);
      task.$flags$ = v[1];
      task.$index$ = v[2];
      task.$el$ = v[3] as HostElement;
      task.$effectDependencies$ = v[4] as Subscriber[] | null;
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
      const [value, flags, effects, storeEffect] = data as unknown[];
      const handler = getStoreHandler(target)!;
      handler.$flags$ = flags as number;
      // First assign so it sets up the deep stores
      Object.assign(getStoreTarget(target), value as object);
      // Afterwards restore the effects so they don't get triggered
      if (storeEffect) {
        (effects as any)[STORE_ARRAY_PROP] = storeEffect;
      }
      handler.$effects$ = effects as any;

      container.$storeProxyMap$.set(value, target);
      break;
    }
    case TypeIds.Signal: {
      const signal = target as Signal<unknown>;
      const d = data as [unknown, ...any[]];
      signal.$untrackedValue$ = d[0];
      signal.$effects$ = d.slice(1);
      break;
    }
    case TypeIds.WrappedSignal: {
      const signal = target as WrappedSignal<unknown>;
      const d = data as [number, unknown[], Subscriber[], unknown, ...any[]];
      signal.$func$ = container.getSyncFn(d[0]);
      signal.$args$ = d[1];
      signal.$effectDependencies$ = d[2];
      signal.$untrackedValue$ = d[3];
      signal.$effects$ = d.slice(4);
      break;
    }
    case TypeIds.ComputedSignal: {
      const computed = target as ComputedSignal<unknown>;
      const d = data as [QRLInternal<() => {}>, any, unknown?];
      computed.$computeQrl$ = d[0];
      computed.$effects$ = d[1];
      if (d.length === 3) {
        computed.$untrackedValue$ = d[2];
      } else {
        computed.$invalid$ = true;
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
      const second = d[1];
      if (second && Array.isArray(second)) {
        for (let i = 0; i < second.length; i++) {
          target[second[i++]] = d[i];
        }
        target.stack = d[2];
      } else {
        target.stack = second;
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
      const effectData = target as EffectData;
      effectData.data = (data as any[])[0];
      break;
    }
    default:
      return throwErrorAndStop('Not implemented');
  }
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
    case TypeIds.Constant:
      return _constants[value as Constants];
    case TypeIds.Number:
      return value as number;
    case TypeIds.Array:
      return wrapDeserializerProxy(container as any, value as any[]);
    case TypeIds.Object:
      return {};
    case TypeIds.QRL:
      const qrl = container.$getObjectById$(value as number);
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
      return new Signal(container as any, 0);
    case TypeIds.WrappedSignal:
      return new WrappedSignal(container as any, null!, null!, null!);
    case TypeIds.ComputedSignal:
      return new ComputedSignal(container as any, null!);
    case TypeIds.Store:
      return createStore(container as any, {}, 0);
    case TypeIds.StoreArray:
      return createStore(container as any, [], 0);
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
      return promise;
    case TypeIds.Uint8Array:
      const encodedLength = (value as string).length;
      const blocks = encodedLength >>> 2;
      const rest = encodedLength & 3;
      const decodedLength = blocks * 3 + (rest ? rest - 1 : 0);
      return new Uint8Array(decodedLength);
    case TypeIds.PropsProxy:
      return createPropsProxy(null!, null);
    case TypeIds.RefVNode:
    case TypeIds.VNode:
      const vnodeOrDocument = retrieveVNodeOrDocument(container, value);
      if (typeId === TypeIds.VNode) {
        return vnodeOrDocument;
      }
      const vNode = retrieveVNodeOrDocument(container, value);
      if (vnode_isVNode(vNode)) {
        return vnode_getNode(vNode);
      } else {
        return throwErrorAndStop('expected vnode for ref prop, but got ' + typeof vNode);
      }
    case TypeIds.EffectData:
      return new EffectData(null!);

    default:
      return throwErrorAndStop('unknown allocate type: ' + typeId);
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
    const backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
    assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    qrlRef = backChannel.get(symbol);
  }
  return createQRL(chunk, symbol, qrlRef, null, captureIds, null, null);
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
  nodeType: number;
  id: string;
  vnodeData?: VNode;
};

/** A ref to a DOM element */
class DomVRef {
  constructor(public id: string) {}
}

export interface SerializationContext {
  $serialize$: () => void;

  $symbolToChunkResolver$: SymbolToChunkResolver;

  /**
   * Map from object to root index.
   *
   * If object is found in `objMap` will return the index of the object in the `objRoots` or
   * `secondaryObjRoots`.
   *
   * `objMap` return:
   *
   * - `>=0` - index of the object in `objRoots`.
   * - `-1` - object has been seen, only once, and therefore does not need to be promoted into a root
   *   yet.
   */
  $wasSeen$: (obj: unknown) => number | undefined;

  $hasRootId$: (obj: unknown) => number | undefined;

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   */
  $addRoot$: (obj: unknown) => number;

  /**
   * Get root index of the object without create a new root.
   *
   * This is used during serialization, as new roots can't be created during serialization.
   *
   * The function throws if the root was not found.
   */
  $getRootId$: (obj: unknown) => number;

  $seen$: (obj: unknown) => void;

  $roots$: unknown[];

  $addSyncFn$($funcStr$: string | null, argsCount: number, fn: Function): number;

  $breakCircularDepsAndAwaitPromises$: () => ValueOrPromise<void>;

  $isSsrNode$: (obj: unknown) => obj is SsrNode;

  $writer$: StreamWriter;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $resources$: Set<ResourceReturnInternal<unknown>>;
  $renderSymbols$: Set<string>;
  $storeProxyMap$: ObjToProxyMap;

  $getProp$: (obj: any, prop: string) => any;
  $setProp$: (obj: any, prop: string, value: any) => void;
  prepVNode?: (vnode: VNode) => void;
}

export const createSerializationContext = (
  /**
   * Node constructor, for instanceof checks.
   *
   * A node constructor can be null. For example on the client we can't serialize DOM nodes as
   * server will not know what to do with them.
   */
  NodeConstructor: {
    new (...rest: any[]): { nodeType: number; id: string };
  } | null,
  symbolToChunkResolver: SymbolToChunkResolver,
  getProp: (obj: any, prop: string) => any,
  setProp: (obj: any, prop: string, value: any) => void,
  storeProxyMap: ObjToProxyMap,
  writer?: StreamWriter,
  // temporary until we serdes the vnode here
  prepVNode?: (vnode: VNode) => void
): SerializationContext => {
  if (!writer) {
    const buffer: string[] = [];
    writer = {
      write: (text: string) => buffer.push(text),
      toString: () => buffer.join(''),
    } as StreamWriter;
  }
  const map = new Map<any, number>();
  const syncFnMap = new Map<string, number>();
  const syncFns: string[] = [];
  const roots: any[] = [];
  const $wasSeen$ = (obj: any) => map.get(obj);
  const $seen$ = (obj: any) => map.set(obj, -1);
  const $addRoot$ = (obj: any) => {
    let id = map.get(obj);
    if (typeof id !== 'number' || id === -1) {
      id = roots.length;
      map.set(obj, id);
      roots.push(obj);
    }
    return id;
  };
  const isSsrNode = (NodeConstructor ? (obj) => obj instanceof NodeConstructor : () => false) as (
    obj: unknown
  ) => obj is SsrNode;

  return {
    $serialize$(): void {
      serialize(this);
    },
    $isSsrNode$: isSsrNode,
    $symbolToChunkResolver$: symbolToChunkResolver,
    $wasSeen$,
    $roots$: roots,
    $seen$,
    $hasRootId$: (obj: any) => {
      const id = map.get(obj);
      return id === undefined || id === -1 ? undefined : id;
    },
    $addRoot$,
    $getRootId$: (obj: any) => {
      const id = map.get(obj);
      if (!id || id === -1) {
        return throwErrorAndStop('Missing root id for: ' + obj);
      }
      return id;
    },
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
    $breakCircularDepsAndAwaitPromises$: breakCircularDependenciesAndResolvePromises,
    $eventQrls$: new Set<QRL>(),
    $eventNames$: new Set<string>(),
    $resources$: new Set<ResourceReturnInternal<unknown>>(),
    $renderSymbols$: new Set<string>(),
    $storeProxyMap$: storeProxyMap,
    $getProp$: getProp,
    $setProp$: setProp,
    prepVNode,
  };

  async function breakCircularDependenciesAndResolvePromises() {
    // As we walk the object graph we insert newly discovered objects which need to be scanned here.
    const discoveredValues: unknown[] = [];
    const promises: Promise<unknown>[] = [];

    /**
     * Note on out of order streaming:
     *
     * When we implement that, we may need to send a reference to an object that was streamed
     * earlier but wasn't a root. This means we'll have to keep track of all objects on both send
     * and receive ends, which means we'll just have to make everything a root anyway, so `visit()`
     * won't be needed.
     */
    /** Visit an object, adding anything that will be serialized as to scan */
    const visit = (obj: unknown) => {
      if (typeof obj === 'function') {
        if (isQrl(obj)) {
          if (obj.$captureRef$) {
            discoveredValues.push(...obj.$captureRef$);
          }
        } else if (isQwikComponent(obj)) {
          const [qrl]: [QRLInternal] = (obj as any)[SERIALIZABLE_STATE];
          discoveredValues.push(qrl);
        }
      } else if (
        // skip as these are primitives
        typeof obj !== 'object' ||
        obj === null ||
        obj instanceof URL ||
        obj instanceof Date ||
        obj instanceof RegExp ||
        obj instanceof Uint8Array ||
        obj instanceof URLSearchParams ||
        (typeof FormData !== 'undefined' && obj instanceof FormData) ||
        // Ignore the no serialize objects
        fastSkipSerialize(obj as object)
      ) {
        // ignore
      } else if (obj instanceof Error) {
        discoveredValues.push(...Object.values(obj));
      } else if (isStore(obj)) {
        const target = getStoreTarget(obj)!;
        const effects = getStoreHandler(obj)!.$effects$;
        const storeEffect = effects?.[STORE_ARRAY_PROP] ?? null;
        discoveredValues.push(target, effects, storeEffect);

        for (const prop in target) {
          const propValue = (target as any)[prop];
          if (storeProxyMap.has(propValue)) {
            discoveredValues.push(prop, storeProxyMap.get(propValue));
          }
        }
      } else if (obj instanceof Set) {
        discoveredValues.push(...obj.values());
      } else if (obj instanceof Map) {
        obj.forEach((v, k) => {
          discoveredValues.push(k, v);
        });
      } else if (obj instanceof Signal) {
        /**
         * WrappedSignal might not be calculated yet so we need to use `untrackedValue` to get the
         * value. ComputedSignal can be left uncalculated.
         */
        const v =
          obj instanceof WrappedSignal
            ? obj.untrackedValue
            : obj instanceof ComputedSignal && (obj.$invalid$ || fastSkipSerialize(obj))
              ? NEEDS_COMPUTATION
              : obj.$untrackedValue$;
        if (v !== NEEDS_COMPUTATION) {
          discoveredValues.push(v);
        }
        if (obj.$effects$) {
          discoveredValues.push(...obj.$effects$);
        }
        // WrappedSignal uses syncQrl which has no captured refs
        if (obj instanceof WrappedSignal) {
          if (obj.$effectDependencies$) {
            discoveredValues.push(...obj.$effectDependencies$);
          }
        } else if (obj instanceof ComputedSignal) {
          discoveredValues.push(obj.$computeQrl$);
        }
      } else if (obj instanceof Task) {
        discoveredValues.push(obj.$el$, obj.$qrl$, obj.$state$, obj.$effectDependencies$);
      } else if (isSsrNode(obj)) {
        discoveredValues.push(obj.vnodeData);
      } else if (isJSXNode(obj)) {
        discoveredValues.push(obj.type, obj.props, obj.constProps, obj.children);
      } else if (Array.isArray(obj)) {
        discoveredValues.push(...obj);
      } else if (isQrl(obj)) {
        obj.$captureRef$ && obj.$captureRef$.length && discoveredValues.push(...obj.$captureRef$);
      } else if (isPropsProxy(obj)) {
        discoveredValues.push(obj[_VAR_PROPS], obj[_CONST_PROPS]);
      } else if (isPromise(obj)) {
        obj.then(
          (value) => {
            promiseResults.set(obj, [true, value]);
            discoveredValues.push(value);
          },
          (error) => {
            promiseResults.set(obj, [false, error]);
            discoveredValues.push(error);
          }
        );
        promises.push(obj);
      } else if (obj instanceof EffectData) {
        discoveredValues.push(obj.data);
      } else if (isObjectLiteral(obj)) {
        Object.entries(obj).forEach(([key, value]) => {
          discoveredValues.push(key, value);
        });
      } else {
        return throwErrorAndStop('Unknown type: ' + obj);
      }
    };

    // Prime the pump with the root objects.
    for (const root of roots) {
      visit(root);
    }

    do {
      while (discoveredValues.length) {
        const obj = discoveredValues.pop();
        if (!(shouldTrackObj(obj) || frameworkType(obj))) {
          continue;
        }
        const id = $wasSeen$(obj);
        if (id === undefined) {
          // Object has not been seen yet, must scan content
          $seen$(obj);
          visit(obj);
        } else if (id === -1) {
          // We are seeing this object second time => promote it.
          $addRoot$(obj);
          // we don't need to scan the children, since we have already seen them.
        }
      }
      // We have scanned all the objects, but we still have promises to resolve.
      await Promise.allSettled(promises);
      promises.length = 0;
    } while (discoveredValues.length);
  }
};

const promiseResults = new WeakMap<Promise<any>, [boolean, unknown]>();

/**
 * Format:
 *
 * - This encodes the $roots$ array.
 * - The output is a string of comma separated JSON values.
 * - Even values are always numbers, specifying the type of the next value.
 * - Odd values are numbers, strings (JSON stringified with `</` escaping) or arrays (same format).
 * - Therefore root indexes need to be doubled to get the actual index.
 */
function serialize(serializationContext: SerializationContext): void {
  const { $writer$, $isSsrNode$, $setProp$, $storeProxyMap$ } = serializationContext;
  let depth = -1;
  // Skip the type for the roots output
  let writeType = false;

  const output = (type: number, value: number | string | any[]) => {
    if (writeType) {
      $writer$.write(`${type},`);
    } else {
      writeType = true;
    }
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
      $writer$.write('[');
      let separator = false;
      // TODO only until last non-null value
      for (let i = 0; i < value.length; i++) {
        if (separator) {
          $writer$.write(',');
        } else {
          separator = true;
        }
        writeValue(value[i], i);
      }
      $writer$.write(']');
      depth--;
    }
  };

  const writeValue = (value: unknown, idx: number) => {
    if (fastSkipSerialize(value as object)) {
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
        const qrl = qrlToString(serializationContext, value);
        const id = serializationContext.$addRoot$(qrl);
        output(TypeIds.QRL, id);
      } else if (isQwikComponent(value)) {
        const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
        serializationContext.$renderSymbols$.add(qrl.$symbol$);
        output(TypeIds.Component, [qrl]);
      } else {
        // TODO this happens for inline components with render props like Resource
        console.error('Cannot serialize function (ignoring for now): ' + value.toString());
        output(TypeIds.Constant, Constants.Undefined);
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
      } else {
        depth++;
        if (value === null) {
          output(TypeIds.Constant, Constants.Null);
        } else {
          writeObjectValue(value, idx);
        }
        depth--;
      }
    } else if (typeof value === 'string') {
      if (value.length === 0) {
        output(TypeIds.Constant, Constants.EmptyString);
      } else {
        // Note, in v1 we were reusing DOM text, but that is too dangerous with translation extensions changing the text
        const seen = depth > 1 && serializationContext.$wasSeen$(value);
        if (typeof seen === 'number' && seen >= 0) {
          output(TypeIds.RootRef, seen);
        } else {
          output(TypeIds.String, value);
        }
      }
    } else if (typeof value === 'undefined') {
      output(TypeIds.Constant, Constants.Undefined);
    } else if (value === NEEDS_COMPUTATION) {
      output(TypeIds.Constant, Constants.NEEDS_COMPUTATION);
    } else {
      throwErrorAndStop('Unknown type: ' + typeof value);
    }
  };

  const writeObjectValue = (value: {}, idx: number) => {
    /**
     * We start at -1 and then serialize the roots array, which is an object so increases depth to
     * 0. The object writer then outputs an array object (without type prefix) and this increases
     * the depth for the objects within (depth 1). Then when writeValue encounters each root object,
     * it will increase the depth again, so it's at 2.
     */
    const isRootObject = depth === 2;
    // Objects are the only way to create circular dependencies.
    // So the first thing to to is to see if we have a circular dependency.
    // (NOTE: For root objects we need to serialize them regardless if we have seen
    //        them before, otherwise the root object reference will point to itself.)
    // Also note that depth will be 2 for objects in root
    if (depth > 2) {
      const seen = serializationContext.$wasSeen$(value);
      if (typeof seen === 'number' && seen >= 0) {
        // We have seen this object before, so we can serialize it as a reference.
        // Otherwise serialize as normal
        output(TypeIds.RootRef, seen);
        return;
      }
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
    } else if (value instanceof EffectData) {
      output(TypeIds.EffectData, [value.data]);
    } else if (isStore(value)) {
      if (isResource(value)) {
        // let render know about the resource
        serializationContext.$resources$.add(value);
        const res = promiseResults.get(value.value);
        if (!res) {
          return throwErrorAndStop('Unvisited Resource');
        }
        output(TypeIds.Resource, [...res, getStoreHandler(value)!.$effects$]);
      } else {
        const storeHandler = getStoreHandler(value)!;
        const storeTarget = getStoreTarget(value);
        const flags = storeHandler.$flags$;
        const effects = storeHandler.$effects$;
        const storeEffect = effects?.[STORE_ARRAY_PROP] ?? null;

        const innerStores = [];
        for (const prop in storeTarget) {
          const propValue = (storeTarget as any)[prop];
          if ($storeProxyMap$.has(propValue)) {
            const innerStore = $storeProxyMap$.get(propValue);
            innerStores.push(innerStore);
            serializationContext.$addRoot$(innerStore);
          }
        }

        const out = [storeTarget, flags, effects, storeEffect, ...innerStores];
        while (out[out.length - 1] == null) {
          out.pop();
        }
        output(Array.isArray(storeTarget) ? TypeIds.StoreArray : TypeIds.Store, out);
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
    } else if (value instanceof DomVRef) {
      output(TypeIds.RefVNode, value.id);
    } else if (value instanceof Signal) {
      /**
       * Special case: when a Signal value is an SSRNode, it always needs to be a DOM ref instead.
       * It can never be meant to become a vNode, because vNodes are internal only.
       */
      let v =
        value instanceof ComputedSignal &&
        (value.$invalid$ || fastSkipSerialize(value.$untrackedValue$))
          ? NEEDS_COMPUTATION
          : value.$untrackedValue$;
      if ($isSsrNode$(v)) {
        // TODO maybe we don't need to store all vnode data if it's only a ref
        serializationContext.$addRoot$(v);
        v = new DomVRef(v.id);
      }
      if (value instanceof WrappedSignal) {
        output(TypeIds.WrappedSignal, [
          ...serializeWrappingFn(serializationContext, value),
          value.$effectDependencies$,
          v,
          ...(value.$effects$ || []),
        ]);
      } else if (value instanceof ComputedSignal) {
        const out = [
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
      const extraProps = Object.entries(value).flat();
      if (extraProps.length) {
        out.push(extraProps);
      }
      /// In production we don't want to leak the stack trace.
      if (isDev) {
        out.push(value.stack);
      }
      output(TypeIds.Error, out);
    } else if ($isSsrNode$(value)) {
      if (isRootObject) {
        // Tell the SsrNode which root id it is
        $setProp$(value, ELEMENT_ID, String(idx));
        const vNode = value.vnodeData;
        // we need to output before the vnode overwrites its values
        output(TypeIds.VNode, value.id);
        if (vNode) {
          serializationContext.prepVNode?.(vNode);
          vNode[0] |= VNodeDataFlag.SERIALIZE;
        }
      } else {
        // Promote the vnode to a root
        serializationContext.$addRoot$(value);
        output(TypeIds.RootRef, serializationContext.$roots$.length - 1);
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
        value.$effectDependencies$,
        value.$state$,
      ];
      while (out[out.length - 1] == null) {
        out.pop();
      }
      output(TypeIds.Task, out);
    } else if (isPromise(value)) {
      const res = promiseResults.get(value);
      if (!res) {
        return throwErrorAndStop('Unvisited Promise');
      }
      output(TypeIds.Promise, res);
    } else if (value instanceof Uint8Array) {
      let buf = '';
      for (const c of value) {
        buf += String.fromCharCode(c);
      }
      const out = btoa(buf).replace(/=+$/, '');
      output(TypeIds.Uint8Array, out);
    } else {
      return throwErrorAndStop('implement');
    }
  };

  writeValue(serializationContext.$roots$, -1);
}

function serializeWrappingFn(
  serializationContext: SerializationContext,
  value: WrappedSignal<any>
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

  const refSymbol = value.$refSymbol$ ?? symbol;
  const platform = getPlatform();
  if (platform) {
    const result = platform.chunkForSymbol(refSymbol, chunk, value.dev?.file);
    if (result) {
      chunk = result[1];
      if (!value.$refSymbol$) {
        symbol = result[0];
      }
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
      let backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
      if (!backChannel) {
        backChannel = (globalThis as any)[QRL_RUNTIME_CHUNK] = new Map();
      }
      backChannel.set(value.$symbol$, (value as any)._devOnlySymbolRef);
      if (!chunk) {
        chunk = QRL_RUNTIME_CHUNK;
      }
    }
    if (!chunk) {
      throwErrorAndStop('Missing chunk for: ' + value.$symbol$);
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
    () => '',
    () => '',
    () => {},
    new WeakMap<any, any>()
  );

  for (const root of data) {
    serializationContext.$addRoot$(root);
  }
  await serializationContext.$breakCircularDepsAndAwaitPromises$();
  serializationContext.$serialize$();
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

  let container: DeserializeContainer | undefined = undefined;
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

function deserializeData(container: DeserializeContainer, typeId: number, propValue: unknown) {
  if (typeId === undefined) {
    return propValue;
  }
  const value = allocate(container, typeId, propValue);
  if (typeId >= TypeIds.Error) {
    inflate(container, value, typeId, propValue);
  }
  return value;
}

function getObjectById(id: number | string, stateData: unknown[]): unknown {
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
  };
  state = wrapDeserializerProxy(container as any, stateData);
  container.$state$ = state;
  if (element) {
    container.element = element;
  }
  return container;
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
      (obj instanceof Signal || obj instanceof Task || isJSXNode(obj))) ||
    isQrl(obj)
  );
};

export const canSerialize = (value: any): boolean => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true;
  } else if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (isStore(value)) {
      value = getStoreTarget(value);
    }
    if (proto == Object.prototype) {
      for (const key in value) {
        if (!canSerialize(value[key])) {
          return false;
        }
      }
      return true;
    } else if (proto == Array.prototype) {
      for (let i = 0; i < value.length; i++) {
        if (!canSerialize(value[i])) {
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
  Task,
  Resource,
  Component,
  Signal,
  WrappedSignal,
  ComputedSignal,
  Store,
  StoreArray,
  FormData,
  JSXNode,
  PropsProxy,
  EffectData,
}
export const _typeIdNames = [
  'RootRef',
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
  'Task',
  'Resource',
  'Component',
  'Signal',
  'WrappedSignal',
  'ComputedSignal',
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
