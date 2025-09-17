/** There's [documentation](./serialization.md) */
import { isDev } from '@qwik.dev/core/build';
import type { StreamWriter } from '../../../server/types';
import type { VNodeData } from '../../../server/vnode-data';
import { vnode_isVNode, vnode_toString } from '../../client/vnode';
import { getStoreTarget, isStore } from '../../reactive-primitives/impl/store';
import type { ISsrNode, SymbolToChunkResolver } from '../../ssr/ssr-types';
import { untrack } from '../../use/use-core';
import { type ResourceReturnInternal } from '../../use/use-resource';
import { isTask } from '../../use/use-task';
import { isQwikComponent } from '../component.public';
import { assertDefined, assertTrue } from '../error/assert';
import { QError, qError } from '../error/error';
import { Fragment, isJSXNode, isPropsProxy } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import { getPlatform } from '../platform/platform';
import { createQRL, type QRLInternal, type SyncQRLInternal } from '../qrl/qrl-class';
import { isQrl, isSyncQrl } from '../qrl/qrl-utils';
import type { QRL } from '../qrl/qrl.public';
import type { DeserializeContainer, ObjToProxyMap } from '../types';
import { _UNINITIALIZED } from '../utils/constants';
import { isElement, isNode } from '../utils/element';
import { EMPTY_ARRAY, EMPTY_OBJ } from '../utils/flyweight';
import { isPromise } from '../utils/promises';
import {
  _EFFECT_BACK_REF,
  EffectSubscriptionProp,
  NEEDS_COMPUTATION,
  STORE_ALL_PROPS,
  type EffectProperty,
  type EffectSubscription,
} from '../../reactive-primitives/types';
import { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { isObject } from '../utils/types';
import { inflate } from './inflate';
import { allocate } from './allocate';
import { SerializationWeakRef, serialize } from './serialize';
import { needsInflation, wrapDeserializerProxy } from './deser-proxy';

export const resolvers = new WeakMap<Promise<any>, [Function, Function]>();

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
  _UNINITIALIZED,
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
  '_UNINITIALIZED',
  'Slot',
  'Fragment',
  'NaN',
  'Infinity',
  '-Infinity',
  'MAX_SAFE_INTEGER',
  'MAX_SAFE_INTEGER-1',
  'MIN_SAFE_INTEGER',
] as const;

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
  $objectPathStringCache$: Map<unknown, string | number>;

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
  const objectPathStringCache = new Map<unknown, string | number>();
  const syncFnMap = new Map<string, number>();
  const syncFns: string[] = [];
  const roots: unknown[] = [];

  const $wasSeen$ = (obj: unknown) => seenObjsMap.get(obj);
  const $seen$ = (obj: unknown, parent: unknown | null, index: number) => {
    return seenObjsMap.set(obj, { $parent$: parent, $index$: index, $rootIndex$: -1 });
  };

  const $addRootPath$ = (obj: unknown) => {
    const rootPath = objectPathStringCache.get(obj);
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
    objectPathStringCache.set(obj, pathStr);
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
    $objectPathStringCache$: objectPathStringCache,
  };
};

/** @internal */
export const _serializationWeakRef = (obj: unknown) => new SerializationWeakRef(obj);

export function filterEffectBackRefs(effectBackRef: Map<string, EffectSubscription> | null) {
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

export function serializeWrappingFn(
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
    $initialQRLs$: null,
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
      const qrl = data[i + 1] as string;
      (container.$initialQRLs$ ||= []).push(qrl);
    }
  }
}

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
  } else if (value === _UNINITIALIZED) {
    return true;
  }
  return false;
};

const QRL_RUNTIME_CHUNK = 'mock-chunk';

export const enum TypeIds {
  Plain,
  RootRef,
  ForwardRef,
  /** Undefined, null, true, false, NaN, +Inf, -Inf, Slot, Fragment */
  Constant,
  Array,
  Object,
  URL,
  Date,
  Regex,
  VNode,
  /// ^ single-digit types ^
  RefVNode,
  BigInt,
  URLSearchParams,
  ForwardRefs,
  /// All types below will be inflate()d
  Error,
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
  AsyncComputedSignal,
  SerializerSignal,
  Store,
  FormData,
  JSXNode,
  PropsProxy,
  SubscriptionData,
}
export const _typeIdNames = [
  'Plain',
  'RootRef',
  'ForwardRef',
  'Constant',
  'Array',
  'Object',
  'URL',
  'Date',
  'Regex',
  'VNode',
  'RefVNode',
  'BigInt',
  'URLSearchParams',
  'ForwardRefs',
  'Error',
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
  'AsyncComputedSignal',
  'SerializerSignal',
  'Store',
  'FormData',
  'JSXNode',
  'PropsProxy',
  'SubscriptionData',
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
  UNINITIALIZED,
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
    (_, value) => {
      if (isObject(value)) {
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
    if (key === TypeIds.Plain) {
      const isRaw = typeof value !== 'number' && typeof value !== 'string';
      if (isRaw) {
        hasRaw = true;
      }
      const type = `{${isObject(value) ? value.constructor.name : typeof value}}`;

      out.push(`${RED}${type}${RESET} ${printRaw(value, `${prefix}  `)}`);
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

export const constantToName = (code: Constants) => {
  return _constantNames[code] || `Unknown(${code})`;
};
