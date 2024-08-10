import { isDev } from '../../../build/index.dev';
import type { StreamWriter } from '../../../server/types';
import { componentQrl, isQwikComponent } from '../../component/component.public';
import type { ObjToProxyMap } from '../../container/container';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import { assertDefined, assertTrue } from '../../error/assert';
import { getPlatform } from '../../platform/platform';
import {
  createQRL,
  isQrl,
  isSyncQrl,
  type QRLInternal,
  type SyncQRLInternal,
} from '../../qrl/qrl-class';
import type { QRL } from '../../qrl/qrl.public';
import {
  Fragment,
  JSXNodeImpl,
  createPropsProxy,
  isJSXNode,
  isPropsProxy,
} from '../../render/jsx/jsx-runtime';
import { Slot } from '../../render/jsx/slot.public';
import { type FunctionComponent } from '../../render/jsx/types/jsx-node';
import { fastSkipSerialize } from '../../state/common';
import { _CONST_PROPS, _VAR_PROPS } from '../../state/constants';
import { Task, isTask, type ResourceReturnInternal } from '../../use/use-task';
import { isElement, isNode } from '../../util/element';
import { EMPTY_OBJ } from '../../util/flyweight';
import { throwErrorAndStop } from '../../util/log';
import { ELEMENT_ID } from '../../util/markers';
import { isPromise } from '../../util/promises';
import { isSerializableObject, type ValueOrPromise } from '../../util/types';
import { type DomContainer } from '../client/dom-container';
import { vnode_getNode, vnode_isVNode, vnode_locate } from '../client/vnode';
import {
  ComputedSignal2,
  DerivedSignal2,
  EffectSubscriptionsProp,
  Signal2,
  type EffectSubscriptions,
} from '../signal/v2-signal';
import {
  Store2,
  createStore2,
  getStoreHandler2,
  getStoreTarget2,
  unwrapStore2,
  type StoreHandler,
} from '../signal/v2-store';
import type { SymbolToChunkResolver } from '../ssr/ssr-types';
import type { DeserializeContainer, fixMeAny } from './types';

const deserializedProxyMap = new WeakMap<object, unknown>();

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
export const wrapDeserializerProxy = (container: DomContainer, value: unknown) => {
  if (
    typeof value === 'object' && // Must be an object
    value !== null && // which is not null
    isObjectLiteral(value) && // and is object literal (not URL, Data, etc.)
    !vnode_isVNode(value) // and is not a VNode or Slot
  ) {
    if (isDeserializerProxy(value)) {
      // already wrapped
      return value;
    } else {
      let proxy = deserializedProxyMap.get(value);
      if (!proxy) {
        proxy = new Proxy(value, new DeserializationHandler(container));
        deserializedProxyMap.set(value, proxy);
      }
      return proxy;
    }
  }
  return value;
};

class DeserializationHandler implements ProxyHandler<object> {
  constructor(private $container$: DomContainer) {}

  get(target: object, property: PropertyKey, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return target;
    }
    if (getStoreTarget2(target) !== undefined) {
      /**
       * If we modify string value by for example `+=` operator, we need to get the old value first.
       * If the target is a store proxy, we need to unwrap it and get the real object. This is
       * because if we try to get the value, we will get deserialized value which is not what we
       * want in case of string.
       *
       * For strings we always assume that they are not deserialized (cached), so we need to get the
       * real value. The reason is that if we have a string which starts with a serialization
       * constant character, we need to have the SerializationConstant.String_CHAR prefix character.
       * Otherwise the system will try to deserialize the value again.
       */
      const unwrapped = unwrapDeserializerProxy(unwrapStore2(target)) as object;
      const unwrappedPropValue = Reflect.get(unwrapped, property, receiver);
      if (
        typeof unwrappedPropValue === 'string' &&
        unwrappedPropValue.length >= 1 &&
        unwrappedPropValue.charCodeAt(0) === SerializationConstant.String_VALUE
      ) {
        return allocate(unwrappedPropValue);
      }
    }
    let propValue = Reflect.get(target, property, receiver);
    let typeCode: number;
    if (
      typeof propValue === 'string' &&
      propValue.length >= 1 &&
      (typeCode = propValue.charCodeAt(0)) < SerializationConstant.LAST_VALUE
    ) {
      const container = this.$container$;
      // It is a value which needs to be deserialized.
      const serializedValue = propValue;
      if (typeCode === SerializationConstant.REFERENCE_VALUE) {
        // Special case of Reference, we don't go through allocation/inflation
        propValue = unwrapDeserializerProxy(
          container.$getObjectById$(parseInt(propValue.substring(1)))
        );
      } else if (typeCode === SerializationConstant.VNode_VALUE) {
        // Special case of VNode, we go directly to VNode to retrieve the element.
        propValue =
          propValue === SerializationConstant.VNode_CHAR
            ? container.element.ownerDocument
            : vnode_locate(container.rootVNode, propValue.substring(1));
      } else if (typeCode === SerializationConstant.DerivedSignal_VALUE && !Array.isArray(target)) {
        // Special case of derived signal. We need to create a [_CONST_PROPS] property.
        return wrapDeserializerProxy(
          container,
          upgradePropsWithDerivedSignal(container, target, property)
        );
      } else {
        propValue = allocate(propValue);
      }
      if (
        typeof propValue !== 'string' ||
        (propValue.length > 0 && propValue.charCodeAt(0) >= SerializationConstant.LAST_VALUE)
      ) {
        /**
         * So we want to cache the value so that we don't have to deserialize it again AND so that
         * deserialized object identity does not change.
         *
         * Unfortunately, there is a corner case! The deserialized value might be a string which
         * looks like a serialized value, so in that rare case we will not cache the value. But it
         * is OK because even thought the identity of string may change on deserialization, the
         * value string equality will not change.
         */
        Reflect.set(target, property, propValue, receiver);
        /** After we set the value we can now inflate the value if needed. */
        if (typeCode >= SerializationConstant.Error_VALUE) {
          inflate(container, propValue, serializedValue);
        }
      }
    }
    propValue = wrapDeserializerProxy(this.$container$, propValue);
    return propValue;
  }

  set(target: object, property: string | symbol, newValue: any, receiver: any): boolean {
    /**
     * If we are setting a value which is a string and starts with a special character, we need to
     * prefix it with a SerializationConstant character to indicate that it is a string.
     *
     * Without this later (when getting the value) we would try to deserialize the value incorrectly
     * due to the special character at the start.
     */
    if (
      typeof newValue === 'string' &&
      newValue.length >= 1 &&
      newValue.charCodeAt(0) < SerializationConstant.LAST_VALUE
    ) {
      return Reflect.set(target, property, SerializationConstant.String_CHAR + newValue, receiver);
    }
    return Reflect.set(target, property, newValue, receiver);
  }

  has(target: object, property: PropertyKey) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(target, property);
  }
}

/**
 * Convert an object (which is a component prop) to have derived signals (_CONST_PROPS).
 *
 * Input:
 *
 * ```
 * {
 *   "prop1": "DerivedSignal: ..",
 *   "prop2": "DerivedSignal: .."
 * }
 * ```
 *
 * Becomes
 *
 * ```
 * {
 *   get prop1 {
 *     return this[_CONST_PROPS].prop1.value;
 *   },
 *   get prop2 {
 *     return this[_CONST_PROPS].prop2.value;
 *   },
 *   prop2: 'DerivedSignal: ..',
 *   [_CONST_PROPS]: {
 *     prop1: _fnSignal(p0=>p0.value, [prop1], 'p0.value'),
 *     prop2: _fnSignal(p0=>p0.value, [prop1], 'p0.value')
 *   }
 * }
 * ```
 */
function upgradePropsWithDerivedSignal(
  container: DomContainer,
  target: Record<string | symbol, any>,
  property: string | symbol | number
): any {
  const immutable: Record<string, DerivedSignal2<unknown>> = {};
  for (const key in target) {
    if (Object.prototype.hasOwnProperty.call(target, key)) {
      const value = target[key];
      if (
        typeof value === 'string' &&
        value.charCodeAt(0) === SerializationConstant.DerivedSignal_VALUE
      ) {
        const derivedSignal = (immutable[key] = allocate(value) as DerivedSignal2<unknown>);
        Object.defineProperty(target, key, {
          get() {
            return derivedSignal.value;
          },
          enumerable: true,
        });
        inflate(container, derivedSignal, value);
      }
    }
  }
  target[_CONST_PROPS] = immutable;
  return target[property];
}

const restStack: Array<number | string> = [];
let rest: string = null!;
let restIdx: number;
const restInt = () => {
  return parseInt(restString());
};

const restString = () => {
  const start = restIdx;
  const length = rest.length;
  let depth = 0;
  let ch: number;
  do {
    if (restIdx < length) {
      ch = rest.charCodeAt(restIdx++);
      if (ch === 91 /* [ */) {
        depth++;
      } else if (ch === 93 /* ] */) {
        depth--;
      }
    } else {
      restIdx = length + 1;
      break;
    }
  } while (depth > 0 || ch !== 32 /* space */);
  return rest.substring(start, restIdx - 1);
};

const inflate = (container: DeserializeContainer, target: any, needsInflationData: string) => {
  restStack.push(rest, restIdx);
  rest = needsInflationData;
  restIdx = 1;
  switch (needsInflationData.charCodeAt(0)) {
    case SerializationConstant.QRL_VALUE:
      inflateQRL(container, target);
      break;
    case SerializationConstant.Task_VALUE:
      const task = target as Task;
      task.$flags$ = restInt();
      task.$index$ = restInt();
      task.$el$ = container.$getObjectById$(restInt()) as Element;
      task.$qrl$ = inflateQRL(container, parseQRL(restString()));
      const taskState = restString();
      task.$state$ = taskState
        ? (container.$getObjectById$(taskState) as Signal2<unknown>)
        : undefined;
      break;
    case SerializationConstant.Resource_VALUE:
      throw new Error('Not implemented');
    case SerializationConstant.Component_VALUE:
      inflateQRL(container, target[SERIALIZABLE_STATE][0]);
      break;
    case SerializationConstant.Store_VALUE:
      const storeHandler = getStoreHandler2(target)!;
      storeHandler.$container$ = container as DomContainer;
      storeHandler.$target$ = container.$getObjectById$(restInt());
      storeHandler.$flags$ = restInt();
      const effectProps = rest.substring(restIdx).split('|');
      if (effectProps.length) {
        const effects: Record<string, EffectSubscriptions[]> = (storeHandler.$effects$ = {});
        for (let i = 0; i < effectProps.length; i++) {
          const effect = effectProps[i];
          const idx = effect.indexOf(';');
          const prop = effect.substring(0, idx);
          const effectStr = effect.substring(idx + 1);
          deserializeSignal2Effect(0, effectStr.split(';'), container, (effects[prop] = []));
        }
      }
      break;
    case SerializationConstant.Signal_VALUE:
      deserializeSignal2(target as Signal2<unknown>, container, rest, false, false);
      break;
    case SerializationConstant.DerivedSignal_VALUE:
      deserializeSignal2(target as Signal2<unknown>, container, rest, true, false);
      break;
    case SerializationConstant.ComputedSignal_VALUE:
      deserializeSignal2(target as Signal2<unknown>, container, rest, false, true);
      break;
    case SerializationConstant.Error_VALUE:
      Object.assign(target, container.$getObjectById$(restInt()));
      break;
    case SerializationConstant.FormData_VALUE:
      const formData = target as FormData;
      for (const [key, value] of container.$getObjectById$(restInt()) as Array<[string, string]>) {
        formData.append(key, value);
      }
      break;
    case SerializationConstant.JSXNode_VALUE:
      const jsx = target as JSXNodeImpl<unknown>;
      jsx.type = deserializeJSXType(container, restString());
      jsx.varProps = container.$getObjectById$(restInt()) as any;
      jsx.constProps = container.$getObjectById$(restInt()) as any;
      jsx.children = container.$getObjectById$(restInt()) as any;
      jsx.flags = restInt();
      jsx.key = restString() || null;
      break;
    case SerializationConstant.Set_VALUE:
      const set = target as Set<unknown>;
      const setValues = container.$getObjectById$(restInt()) as Array<unknown>;
      for (let i = 0; i < setValues.length; i++) {
        set.add(setValues[i]);
      }
      break;
    case SerializationConstant.Map_VALUE:
      const map = target as Map<unknown, unknown>;
      const mapKeyValue = container.$getObjectById$(restInt()) as Array<unknown>;
      for (let i = 0; i < mapKeyValue.length; ) {
        map.set(mapKeyValue[i++], mapKeyValue[i++]);
      }
      break;
    case SerializationConstant.Promise_VALUE:
      const promise = target as QPromise;
      const id = restInt();
      if (id >= 0) {
        promise[PROMISE_RESOLVE](container.$getObjectById$(id));
      } else {
        promise[PROMISE_REJECT](container.$getObjectById$(~id));
      }
      break;
    case SerializationConstant.Uint8Array_VALUE:
      const bytes = target as Uint8Array;
      const buf = atob(restString());
      let i = 0;
      for (const s of buf) {
        bytes[i++] = s.charCodeAt(0);
      }
      break;
    case SerializationConstant.PropsProxy_VALUE:
      const propsProxy = target as any;
      propsProxy[_VAR_PROPS] = container.$getObjectById$(restInt()) as any;
      propsProxy[_CONST_PROPS] = container.$getObjectById$(restInt()) as any;
      break;
    default:
      throw new Error('Not implemented');
  }
  restIdx = restStack.pop() as number;
  rest = restStack.pop() as string;
};

const allocate = <T>(value: string): any => {
  switch (value.charCodeAt(0)) {
    case SerializationConstant.UNDEFINED_VALUE:
      return undefined;
    case SerializationConstant.QRL_VALUE:
      return parseQRL(value);
    case SerializationConstant.Task_VALUE:
      return new Task(-1, -1, null!, null!, null!, null);
    case SerializationConstant.Resource_VALUE:
      throw new Error('Not implemented');
    case SerializationConstant.URL_VALUE:
      return new URL(value.substring(1));
    case SerializationConstant.Date_VALUE:
      return new Date(value.substring(1));
    case SerializationConstant.Regex_VALUE:
      const idx = value.lastIndexOf('/');
      return new RegExp(value.substring(2, idx), value.substring(idx + 1));
    case SerializationConstant.Error_VALUE:
      return new Error();
    case SerializationConstant.Component_VALUE:
      return componentQrl(parseQRL(value) as any);
    case SerializationConstant.Signal_VALUE:
      return new Signal2(null!, 0);
    case SerializationConstant.DerivedSignal_VALUE:
      return new DerivedSignal2(null!, null!, null!, null!);
    case SerializationConstant.ComputedSignal_VALUE:
      return new ComputedSignal2(null!, null!);
    case SerializationConstant.NotFinite_VALUE:
      const type = value.substring(1);
      const isNaN = type.length === 0;
      if (isNaN) {
        return Number.NaN;
      } else {
        const isNegativeInfinity = type === '-';
        return isNegativeInfinity ? -Infinity : Infinity;
      }
    case SerializationConstant.URLSearchParams_VALUE:
      return new URLSearchParams(value.substring(1));
    case SerializationConstant.FormData_VALUE:
      return new FormData();
    case SerializationConstant.JSXNode_VALUE:
      return new JSXNodeImpl(null!, null!, null!, null!, -1, null);
    case SerializationConstant.BigInt_VALUE:
      return BigInt(value.substring(1));
    case SerializationConstant.Set_VALUE:
      return new Set();
    case SerializationConstant.Map_VALUE:
      return new Map();
    case SerializationConstant.String_VALUE:
      return value.substring(1);
    case SerializationConstant.Promise_VALUE:
      let resolve!: (value: any) => void;
      let reject!: (error: any) => void;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      }) as QPromise;
      promise[PROMISE_RESOLVE] = resolve;
      promise[PROMISE_REJECT] = reject;
      return promise;
    case SerializationConstant.Uint8Array_VALUE:
      const encodedLength = value.length - 1;
      const blocks = encodedLength >>> 2;
      const rest = encodedLength & 3;
      const decodedLength = blocks * 3 + (rest ? rest - 1 : 0);
      return new Uint8Array(decodedLength);
    case SerializationConstant.PropsProxy_VALUE:
      return createPropsProxy(null!, null);
    case SerializationConstant.Store_VALUE:
      return createStore2(null, EMPTY_OBJ, 0);
    default:
      throw new Error('unknown allocate type: ' + value.charCodeAt(0));
  }
};

interface QPromise extends Promise<unknown> {
  [PROMISE_RESOLVE]: (value: any) => void;
  [PROMISE_REJECT]: (error: any) => void;
}

const PROMISE_RESOLVE = Symbol('resolve');
const PROMISE_REJECT = Symbol('reject');

export function parseQRL(qrl: string): QRLInternal<any> {
  const hashIdx = qrl.indexOf('#');
  const captureStart = qrl.indexOf('[', hashIdx);
  const captureEnd = qrl.indexOf(']', captureStart);
  const chunk =
    hashIdx > -1
      ? qrl.substring(qrl.charCodeAt(0) < SerializationConstant.LAST_VALUE ? 1 : 0, hashIdx)
      : qrl;
  const symbol =
    captureStart > -1 ? qrl.substring(hashIdx + 1, captureStart) : qrl.substring(hashIdx + 1);
  let qrlRef = null;
  const captureIds =
    captureStart > -1 && captureEnd > -1
      ? qrl
          .substring(captureStart + 1, captureEnd)
          .split(' ')
          .filter((v) => v.length)
      : null;
  if (isDev && chunk === QRL_RUNTIME_CHUNK) {
    const backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
    assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    qrlRef = backChannel.get(symbol);
  }
  return createQRL(chunk, symbol, qrlRef, null, captureIds, null, null);
}

export function inflateQRL(container: DeserializeContainer, qrl: QRLInternal<any>) {
  const captureIds = qrl.$capture$;
  qrl.$captureRef$ = captureIds
    ? captureIds.map((id) => container.$getObjectById$(parseInt(id)))
    : null;
  if (container.element) {
    qrl.$setContainer$(container.element);
  }
  return qrl;
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
   * - `Number.MIN_SAFE_INTEGER` - object has been seen, only once, and therefor does not need to be
   *   promoted into a root yet.
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

  $proxyMap$: ObjToProxyMap;

  $breakCircularDepsAndAwaitPromises$: () => ValueOrPromise<void>;

  /**
   * Node constructor, for instanceof checks.
   *
   * A node constructor can be null. For example on the client we can't serialize DOM nodes as
   * server will not know what to do with them.
   */
  $NodeConstructor$: {
    new (...rest: any[]): { nodeType: number; id: string };
  } | null;

  $writer$: StreamWriter;
  $syncFns$: string[];

  $eventQrls$: Set<QRL>;
  $eventNames$: Set<string>;
  $resources$: Set<ResourceReturnInternal<unknown>>;
  $renderSymbols$: Set<string>;

  $setProp$: (obj: any, prop: string, value: any) => void;
}

export const createSerializationContext = (
  NodeConstructor: SerializationContext['$NodeConstructor$'] | null,
  $proxyMap$: ObjToProxyMap,
  symbolToChunkResolver: SymbolToChunkResolver,
  setProp: (obj: any, prop: string, value: any) => void,
  writer?: StreamWriter
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
  const $seen$ = (obj: any) => map.set(obj, Number.MIN_SAFE_INTEGER);
  const $addRoot$ = (obj: any) => {
    let id = map.get(obj);
    if (typeof id !== 'number' || id === Number.MIN_SAFE_INTEGER) {
      id = roots.length;
      map.set(obj, id);
      roots.push(obj);
    }
    return id;
  };

  return {
    $serialize$(): void {
      serialize(this);
    },
    $NodeConstructor$: NodeConstructor,
    $symbolToChunkResolver$: symbolToChunkResolver,
    $wasSeen$,
    $roots$: roots,
    $seen$,
    $hasRootId$: (obj: any) => {
      const id = map.get(obj);
      return id === undefined || id === Number.MIN_SAFE_INTEGER ? undefined : id;
    },
    $addRoot$,
    $getRootId$: (obj: any) => {
      const id = map.get(obj);
      if (!id || id === Number.MIN_SAFE_INTEGER) {
        throw throwErrorAndStop('Missing root id for: ' + obj);
      }
      return id;
    },
    $proxyMap$,
    $syncFns$: syncFns,
    $addSyncFn$: (funcStr: string | null, argCount: number, fn: Function) => {
      const isFullFn = funcStr == null;
      if (isFullFn) {
        funcStr = fn.toString();
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
    $breakCircularDepsAndAwaitPromises$: () => {
      const promises: Promise<unknown>[] = [];
      /// As `breakCircularDependencies` it is adding new roots
      /// But we don't need te re-scan them.
      const objRootsLength = roots.length;
      for (let i = 0; i < objRootsLength; i++) {
        breakCircularDependenciesAndResolvePromises(roots[i], promises);
      }
      const drain: () => ValueOrPromise<void> = () => {
        if (promises.length) {
          return Promise.allSettled(promises).then(drain, drain);
        }
      };
      return drain();
    },
    $eventQrls$: new Set<QRL>(),
    $eventNames$: new Set<string>(),
    $resources$: new Set<ResourceReturnInternal<unknown>>(),
    $renderSymbols$: new Set<string>(),
    $setProp$: setProp,
  };

  function breakCircularDependenciesAndResolvePromises(
    rootObj: unknown,
    promises: Promise<unknown>[]
  ) {
    // As we walk the object graph we insert newly discovered objects which need to be scanned here.
    const discoveredValues: unknown[] = [rootObj];
    // discoveredValues.push = (...value: unknown[]) => {
    //   Array.prototype.push.apply(discoveredValues, value);
    // };
    // let count = 100;
    while (discoveredValues.length) {
      // if (count-- < 0) {
      //   throw new Error('INFINITE LOOP');
      // }
      const obj = discoveredValues.pop();
      if (shouldTrackObj(obj) || frameworkType(obj)) {
        const isRoot = obj === rootObj;
        // For root objects we pretend we have not seen them to force scan.
        const id = $wasSeen$(obj);
        const unwrapObj = unwrapStore2(obj);
        if (unwrapObj !== obj) {
          discoveredValues.push(unwrapObj);
        } else if (id === undefined || isRoot) {
          // Object has not been seen yet, must scan content
          // But not for root.
          !isRoot && $seen$(obj);
          if (
            typeof obj !== 'object' ||
            obj === null ||
            obj instanceof URL ||
            obj instanceof Date ||
            obj instanceof RegExp ||
            obj instanceof Error ||
            obj instanceof Date ||
            obj instanceof Uint8Array ||
            obj instanceof URLSearchParams ||
            (typeof FormData !== 'undefined' && obj instanceof FormData)
          ) {
            // skip as these are primitives
          } else if (fastSkipSerialize(obj as object)) {
            // Ignore the no serialize objects
          } else if (obj instanceof Set) {
            const contents = Array.from(obj.values());
            setSerializableDataRootId($addRoot$, obj, contents);
            discoveredValues.push(...contents);
          } else if (obj instanceof Map) {
            const tuples: any[] = [];
            obj.forEach((v, k) => {
              tuples.push(k, v);
              discoveredValues.push(k, v);
            });
            setSerializableDataRootId($addRoot$, obj, tuples);
            discoveredValues.push(tuples);
          } else if (obj instanceof Signal2) {
            discoveredValues.push(obj.$untrackedValue$);
            // TODO(mhevery): should scan the QRLs???
          } else if (obj instanceof Task) {
            discoveredValues.push(obj.$el$, obj.$qrl$, obj.$state$);
          } else if (NodeConstructor && obj instanceof NodeConstructor) {
            // ignore the nodes
            // debugger;
          } else if (isJSXNode(obj)) {
            discoveredValues.push(obj.type, obj.props, obj.constProps, obj.children);
          } else if (Array.isArray(obj)) {
            discoveredValues.push(...obj);
          } else if (isQrl(obj)) {
            obj.$captureRef$ &&
              obj.$captureRef$.length &&
              discoveredValues.push(...obj.$captureRef$);
          } else if (isPropsProxy(obj)) {
            discoveredValues.push(obj[_VAR_PROPS], obj[_CONST_PROPS]);
          } else if (isPromise(obj)) {
            obj.then(
              (value) => {
                setSerializableDataRootId($addRoot$, obj as Promise<any>, value);
                promises.splice(promises.indexOf(obj as Promise<void>), 1);
              },
              (error) => {
                (obj as any)[SERIALIZABLE_ROOT_ID] = ~$addRoot$(error);
                promises.splice(promises.indexOf(obj as Promise<void>), 1);
              }
            );
            promises.push(obj);
          } else if (isObjectLiteral(obj)) {
            for (const key in obj as object) {
              if (Object.prototype.hasOwnProperty.call(obj, key)) {
                discoveredValues.push((obj as any)[key]);
              }
            }
          } else {
            throw new Error('Unknown type: ' + obj);
          }
        } else if (id === Number.MIN_SAFE_INTEGER) {
          // We are seeing this object second time => promoted it.
          $addRoot$(obj);
          // we don't need to scan the children, since we have already seen them.
        }
      }
    }
  }
};

function serialize(serializationContext: SerializationContext): void {
  const { $writer$, $addRoot$, $NodeConstructor$, $setProp$ } = serializationContext;
  let depth = -1;

  const writeString = (text: string) => {
    text = JSON.stringify(text);
    let angleBracketIdx: number = -1;
    let lastIdx = 0;
    while ((angleBracketIdx = text.indexOf('</', lastIdx)) !== -1) {
      $writer$.write(text.substring(lastIdx, angleBracketIdx));
      $writer$.write('<\\/');
      lastIdx = angleBracketIdx + 2;
    }
    $writer$.write(lastIdx === 0 ? text : text.substring(lastIdx));
  };

  const writeValue = (value: unknown, idx: number) => {
    if (fastSkipSerialize(value as object)) {
      return writeString(SerializationConstant.UNDEFINED_CHAR);
    } else if (typeof value === 'bigint') {
      return writeString(SerializationConstant.BigInt_CHAR + value.toString());
    } else if (typeof value === 'boolean') {
      $writer$.write(String(value));
    } else if (typeof value === 'function') {
      if (isQrl(value)) {
        writeString(SerializationConstant.QRL_CHAR + qrlToString(serializationContext, value));
      } else if (isQwikComponent(value)) {
        const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
        serializationContext.$renderSymbols$.add(qrl.$symbol$);
        writeString(SerializationConstant.Component_CHAR + qrlToString(serializationContext, qrl));
      } else {
        // throw new Error('implement: ' + value);
        writeString(value.toString());
      }
    } else if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        return writeString(SerializationConstant.NotFinite_CHAR);
      } else if (!Number.isFinite(value)) {
        return writeString(SerializationConstant.NotFinite_CHAR + (value > 0 ? '+' : '-'));
      } else {
        $writer$.write(String(value));
      }
    } else if (typeof value === 'object') {
      depth++;
      if (value === null) {
        $writer$.write('null');
      } else {
        writeObjectValue(value, idx);
      }
      depth--;
    } else if (typeof value === 'string') {
      let seenIdx: number | undefined;
      if (
        shouldTrackObj(value) &&
        depth > 0 &&
        (seenIdx = serializationContext.$hasRootId$(value)) !== undefined
      ) {
        assertTrue(seenIdx >= 0, 'seenIdx >= 0');
        return writeString(SerializationConstant.REFERENCE_CHAR + seenIdx);
      } else if (value.length > 0 && value.charCodeAt(0) < SerializationConstant.LAST_VALUE) {
        // We need to escape the first character, because it is a special character.
        writeString(SerializationConstant.String_CHAR + value);
      } else {
        writeString(value);
      }
    } else if (typeof value === 'undefined') {
      writeString(SerializationConstant.UNDEFINED_CHAR);
    } else {
      throw new Error('Unknown type: ' + typeof value);
    }
  };

  const writeObjectValue = (value: {}, idx: number) => {
    // Objects are the only way to create circular dependencies.
    // So the first thing to to is to see if we have a circular dependency.
    // (NOTE: For root objects we need to serialize them regardless if we have seen
    //        them before, otherwise the root object reference will point to itself.)
    const seen = depth <= 1 ? undefined : serializationContext.$wasSeen$(value);
    let storeHandler: null | StoreHandler<any> = null;
    if (fastSkipSerialize(value as object)) {
      writeString(SerializationConstant.UNDEFINED_CHAR);
    } else if (typeof seen === 'number' && seen >= 0) {
      // We have seen this object before, so we can serialize it as a reference.
      // Otherwise serialize as normal
      writeString(SerializationConstant.REFERENCE_CHAR + seen);
    } else if (isPropsProxy(value)) {
      const varProps = value[_VAR_PROPS];
      const varId = $addRoot$(varProps);
      const constProps = value[_CONST_PROPS];
      const constId = $addRoot$(constProps);
      writeString(SerializationConstant.PropsProxy_CHAR + varId + ' ' + constId);
    } else if ((storeHandler = getStoreHandler2(value))) {
      let store =
        SerializationConstant.Store_CHAR +
        $addRoot$(storeHandler.$target$) +
        ' ' +
        storeHandler.$flags$;
      const effects = storeHandler.$effects$;
      if (effects) {
        let sep = ' ';
        for (const propName in effects) {
          store += sep + propName + serializeEffectSubs($addRoot$, effects[propName]);
          sep = '|';
        }
      }
      writeString(store);
    } else if (isObjectLiteral(value)) {
      if (isResource(value)) {
        serializationContext.$resources$.add(value);
      }
      serializeObjectLiteral(value, $writer$, writeValue, writeString);
    } else if (value instanceof Signal2) {
      if (value instanceof DerivedSignal2) {
        writeString(
          SerializationConstant.DerivedSignal_CHAR +
            serializeDerivedFn(serializationContext, value, $addRoot$) +
            ';' +
            $addRoot$(value.$untrackedValue$) +
            serializeEffectSubs($addRoot$, value.$effects$)
        );
      } else if (value instanceof ComputedSignal2) {
        writeString(
          SerializationConstant.ComputedSignal_CHAR +
            qrlToString(serializationContext, value.$computeQrl$) +
            ';' +
            $addRoot$(value.$untrackedValue$) +
            serializeEffectSubs($addRoot$, value.$effects$)
        );
      } else {
        writeString(
          SerializationConstant.Signal_CHAR +
            $addRoot$(value.$untrackedValue$) +
            serializeEffectSubs($addRoot$, value.$effects$)
        );
      }
    } else if (value instanceof URL) {
      writeString(SerializationConstant.URL_CHAR + value.href);
    } else if (value instanceof Date) {
      writeString(SerializationConstant.Date_CHAR + value.toJSON());
    } else if (value instanceof RegExp) {
      writeString(SerializationConstant.Regex_CHAR + value.toString());
    } else if (value instanceof Error) {
      const errorProps = Object.assign(
        {
          message: value.message,
          /// In production we don't want to leak the stack trace.
          stack: isDev ? value.stack : '<hidden>',
        },
        value
      );
      writeString(SerializationConstant.Error_CHAR + $addRoot$(errorProps));
    } else if ($NodeConstructor$ && value instanceof $NodeConstructor$) {
      $setProp$(value, ELEMENT_ID, String(idx));
      writeString(SerializationConstant.VNode_CHAR + value.id);
    } else if (typeof FormData !== 'undefined' && value instanceof FormData) {
      const array: [string, string][] = [];
      value.forEach((value, key) => {
        if (typeof value === 'string') {
          array.push([key, value]);
        } else {
          array.push([key, value.name]);
        }
      });
      writeString(SerializationConstant.FormData_CHAR + $addRoot$(array));
    } else if (value instanceof URLSearchParams) {
      writeString(SerializationConstant.URLSearchParams_CHAR + value.toString());
    } else if (value instanceof Set) {
      writeString(SerializationConstant.Set_CHAR + getSerializableDataRootId(value));
    } else if (value instanceof Map) {
      writeString(SerializationConstant.Map_CHAR + getSerializableDataRootId(value));
    } else if (isJSXNode(value)) {
      writeString(
        SerializationConstant.JSXNode_CHAR +
          serializeJSXType($addRoot$, value.type as string) +
          ' ' +
          $addRoot$(value.varProps) +
          ' ' +
          $addRoot$(value.constProps) +
          ' ' +
          $addRoot$(value.children) +
          ' ' +
          value.flags +
          ' ' +
          (value.key || '')
      );
    } else if (value instanceof Task) {
      writeString(
        SerializationConstant.Task_CHAR +
          value.$flags$ +
          ' ' +
          value.$index$ +
          ' ' +
          $addRoot$(value.$el$) +
          ' ' +
          qrlToString(serializationContext, value.$qrl$) +
          (value.$state$ == null ? '' : ' ' + $addRoot$(value.$state$))
      );
    } else if (isPromise(value)) {
      writeString(SerializationConstant.Promise_CHAR + getSerializableDataRootId(value));
    } else if (value instanceof Uint8Array) {
      let buf = '';
      for (const c of value) {
        buf += String.fromCharCode(c);
      }
      const out = btoa(buf).replace(/=+$/, '');
      writeString(SerializationConstant.Uint8Array_CHAR + out);
    } else {
      throw new Error('implement');
    }
  };

  const serializeObjectLiteral = (
    value: any,
    $writer$: StreamWriter,
    writeValue: (value: any, idx: number) => void,
    writeString: (text: string) => void
  ) => {
    if (Array.isArray(value)) {
      // Serialize as array.
      serializeArray(value, $writer$, writeValue);
    } else {
      // Serialize as object.
      $writer$.write('{');
      serializeObjectProperties(value, $writer$, writeValue, writeString);
      $writer$.write('}');
    }
  };

  writeValue(serializationContext.$roots$, -1);
}

function serializeEffectSubs(
  addRoot: (obj: unknown) => number,
  effects: EffectSubscriptions[] | null
): string {
  let data = '';
  if (effects) {
    for (let i = 0; i < effects.length; i++) {
      const effectSubscription = effects[i];
      const effect = effectSubscription[EffectSubscriptionsProp.EFFECT];
      const prop = effectSubscription[EffectSubscriptionsProp.PROPERTY];
      data += ';' + addRoot(effect) + ' ' + prop;
      for (let j = EffectSubscriptionsProp.FIRST_BACK_REF; j < effectSubscription.length; j++) {
        data += ' ' + addRoot(effectSubscription[j]);
      }
    }
  }
  return data;
}

function serializeArray(
  value: any,
  $writer$: StreamWriter,
  writeValue: (value: any, idx: number) => void
) {
  $writer$.write('[');
  for (let i = 0; i < value.length; i++) {
    if (i !== 0) {
      $writer$.write(',');
    }
    writeValue(value[i], i);
  }
  $writer$.write(']');
}

function serializeObjectProperties(
  value: any,
  $writer$: StreamWriter,
  writeValue: (value: any, idx: number) => void,
  writeString: (text: string) => void
) {
  let delimiter = false;
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key) && !fastSkipSerialize(value[key])) {
      delimiter && $writer$.write(',');
      writeString(key);
      $writer$.write(':');
      writeValue(value[key], -1);
      delimiter = true;
    }
  }
}

function serializeDerivedFn(
  serializationContext: SerializationContext,
  value: DerivedSignal2<any>,
  $addRoot$: (obj: unknown) => number
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
  const args = value.$args$.map($addRoot$).join(' ');
  return syncFnId + (args.length ? ' ' + args : '');
}

function deserializeSignal2(
  signal: Signal2,
  container: DeserializeContainer,
  data: string,
  readFn: boolean,
  readQrl: boolean
) {
  signal.$container$ = container as DomContainer;
  const parts = data.substring(1).split(';');
  let idx = 0;
  if (readFn) {
    const derivedSignal = signal as DerivedSignal2<any>;
    derivedSignal.$invalid$ = false;
    const fnParts = parts[idx++].split(' ');
    derivedSignal.$func$ = container.getSyncFn(parseInt(fnParts[0]));
    for (let i = 1; i < fnParts.length; i++) {
      (derivedSignal.$args$ || (derivedSignal.$args$ = [])).push(
        container.$getObjectById$(parseInt(fnParts[i]))
      );
    }
  }
  if (readQrl) {
    const computedSignal = signal as ComputedSignal2<any>;
    computedSignal.$computeQrl$ = inflateQRL(container, parseQRL(parts[idx++])) as fixMeAny;
  }
  let signalValue = container.$getObjectById$(parts[idx++]);
  if (vnode_isVNode(signalValue)) {
    signalValue = vnode_getNode(signalValue);
  }
  signal.$untrackedValue$ = signalValue;
  if (idx < parts.length) {
    const effects = signal.$effects$ || (signal.$effects$ = []);
    idx = deserializeSignal2Effect(idx, parts, container, effects);
  }
}

function deserializeSignal2Effect(
  idx: number,
  parts: string[],
  container: DeserializeContainer,
  effects: EffectSubscriptions[]
) {
  while (idx < parts.length) {
    // idx == 1 is the attribute name
    const effect = parts[idx++]
      .split(' ')
      .map((obj, idx) => (idx == 1 ? obj : container.$getObjectById$(obj)));
    effects.push(effect as fixMeAny);
  }
  return idx;
}

function setSerializableDataRootId($addRoot$: (value: any) => number, obj: object, value: any) {
  (obj as any)[SERIALIZABLE_ROOT_ID] = $addRoot$(value);
}

function getSerializableDataRootId(value: object) {
  const id = (value as any)[SERIALIZABLE_ROOT_ID];
  assertDefined(id, 'Missing SERIALIZABLE_ROOT_ID');
  return id;
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
    const result = platform.chunkForSymbol(refSymbol, chunk);
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
  } else {
    const fn = value.resolved as Function;
    chunk = '';
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
      serializedReferences += serializationContext.$addRoot$(value.$captureRef$[i]);
    }
    qrlStringInline += `[${serializedReferences}]`;
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
    new WeakMap(),
    () => '',
    () => {}
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
    container = createDeserializeContainer(stateData, element as HTMLElement);
  } else {
    container = createDeserializeContainer(stateData);
  }
  for (let i = 0; i < stateData.length; i++) {
    const data = stateData[i];
    stateData[i] = deserializeData(stateData, data, container);
  }
  return stateData;
}

function deserializeData(
  stateData: unknown[],
  serializedData: unknown,
  container: DeserializeContainer
) {
  let typeCode: number;
  if (
    typeof serializedData === 'string' &&
    serializedData.length >= 1 &&
    (typeCode = serializedData.charCodeAt(0)) < SerializationConstant.LAST_VALUE
  ) {
    let propValue = serializedData;
    propValue = allocate(propValue);

    if (typeCode >= SerializationConstant.Error_VALUE) {
      inflate(container, propValue, serializedData);
    }
    return propValue;
  } else if (serializedData && typeof serializedData === 'object') {
    if (Array.isArray(serializedData)) {
      return deserializeArray(stateData, serializedData, container);
    } else {
      return deserializeObject(stateData, serializedData, container);
    }
  }
  return serializedData;
}

function deserializeObject(
  stateData: unknown[],
  serializedData: object,
  container: DeserializeContainer
) {
  if (!isSerializableObject(serializedData)) {
    return serializedData;
  }
  for (const key in serializedData) {
    if (Object.prototype.hasOwnProperty.call(serializedData, key)) {
      const value = serializedData[key];
      serializedData[key] = deserializeData(stateData, value, container);
    }
  }
  return serializedData;
}

function deserializeArray(
  stateData: unknown[],
  serializedData: Array<unknown>,
  container: DeserializeContainer
) {
  for (let i = 0; i < serializedData.length; i++) {
    const value = serializedData[i];
    serializedData[i] = deserializeData(stateData, value, container);
  }
  return serializedData;
}

function getObjectById(id: number | string, stateData: unknown[]): unknown {
  if (typeof id === 'string') {
    id = parseFloat(id);
  }
  assertTrue(id < stateData.length, 'Invalid reference');
  return stateData[id];
}

function createDeserializeContainer(
  stateData: unknown[],
  element?: HTMLElement
): DeserializeContainer {
  const container: DeserializeContainer = {
    $getObjectById$: (id: number | string) => getObjectById(id, stateData),
    getSyncFn: (_: number) => {
      const fn = () => {};
      return fn;
    },
    element: null,
  };
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
    (typeof obj === 'object' && obj !== null) ||
    // THINK: Not sure if we need to keep track of functions (QRLs) Let's skip them for now.
    // and see if we have a test case which requires them.
    (typeof obj === 'string' && obj.length > 10)
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
      (obj instanceof Signal2 || obj instanceof Task || isJSXNode(obj))) ||
    isQrl(obj)
  );
};

export const canSerialize2 = (value: any): boolean => {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  } else if (typeof value === 'object') {
    let proto = Object.getPrototypeOf(value);
    if (proto === Store2.prototype) {
      value = unwrapStore2(value);
      proto = Object.prototype;
    }
    if (proto == Object.prototype) {
      for (const key in value) {
        if (!canSerialize2(value[key])) {
          return false;
        }
      }
      return true;
    } else if (proto == Array.prototype) {
      for (let i = 0; i < value.length; i++) {
        if (!canSerialize2(value[i])) {
          return false;
        }
      }
      return true;
    } else if (isTask(value)) {
      return true;
    } else if (value instanceof Error) {
      return true;
    } else if (isPromise(value)) {
      return true;
    } else if (isJSXNode(value)) {
      return true;
    }
  } else if (typeof value === 'function') {
    if (isQrl(value) || isQwikComponent(value)) {
      return true;
    }
  }
  return false;
};

const QRL_RUNTIME_CHUNK = 'qwik-runtime-mock-chunk';
const SERIALIZABLE_ROOT_ID = Symbol('SERIALIZABLE_ROOT_ID');

export const enum SerializationConstant {
  UNDEFINED_CHAR = /* ----------------- */ '\u0000',
  UNDEFINED_VALUE = /* -------------------- */ 0x0,
  REFERENCE_CHAR = /* ----------------- */ '\u0001',
  REFERENCE_VALUE = /* -------------------- */ 0x1,
  URL_CHAR = /* ----------------------- */ '\u0002',
  URL_VALUE = /* -------------------------- */ 0x2,
  Date_CHAR = /* ---------------------- */ '\u0003',
  Date_VALUE = /* ------------------------- */ 0x3,
  Regex_CHAR = /* --------------------- */ '\u0004',
  Regex_VALUE = /* ------------------------ */ 0x4,
  String_CHAR = /* -------------------- */ '\u0005',
  String_VALUE = /* ----------------------- */ 0x5,
  VNode_CHAR = /* --------------------- */ '\u0006',
  VNode_VALUE = /* ------------------------ */ 0x6,
  NotFinite_CHAR = /* ----------------- */ '\u0007',
  NotFinite_VALUE = /* -------------------  */ 0x7,
  BigInt_CHAR = /* -------------------- */ '\u0008',
  BigInt_VALUE = /* ----------------------  */ 0x8,
  UNUSED_HORIZONTAL_TAB_CHAR = /* ----- */ '\u0009',
  UNUSED_HORIZONTAL_TAB_VALUE = /* -------- */ 0x9,
  UNUSED_NEW_LINE_CHAR = /* ----------- */ '\u000a',
  UNUSED_NEW_LINE_VALUE = /* -------------- */ 0xa,
  UNUSED_VERTICAL_TAB_CHAR = /* ------- */ '\u000b',
  UNUSED_VERTICAL_TAB_VALUE = /* ---------- */ 0xb,
  UNUSED_FORM_FEED_CHAR = /* ---------- */ '\u000c',
  UNUSED_FORM_FEED_VALUE = /* ------------- */ 0xc,
  UNUSED_CARRIAGE_RETURN_CHAR = /* ---- */ '\u000d',
  UNUSED_CARRIAGE_RETURN_VALUE = /* ------- */ 0xd,
  URLSearchParams_CHAR = /* ----------- */ '\u000e',
  URLSearchParams_VALUE = /* -------------- */ 0xe,
  /// All values bellow need inflation
  Error_CHAR = /* --------------------- */ '\u000f',
  Error_VALUE = /* ------------------------ */ 0xf,
  QRL_CHAR = /* ----------------------- */ '\u0010',
  QRL_VALUE = /* ------------------------- */ 0x10,
  Task_CHAR = /* ---------------------- */ '\u0011',
  Task_VALUE = /* -------------------------*/ 0x11,
  Resource_CHAR = /* ------------------ */ '\u0012',
  Resource_VALUE = /* ---------------------*/ 0x12,
  Component_CHAR = /* ----------------- */ '\u0013',
  Component_VALUE = /* ------------------- */ 0x13,
  Signal_CHAR = /* -------------------- */ '\u0014',
  Signal_VALUE = /* ---------------------- */ 0x14,
  DerivedSignal_CHAR = /* ------------- */ '\u0015',
  DerivedSignal_VALUE = /* --------------- */ 0x15,
  ComputedSignal_CHAR = /* ------------ */ '\u0016',
  ComputedSignal_VALUE = /* -------------- */ 0x16,
  Store_CHAR = /* --------------------- */ '\u0017',
  Store_VALUE = /* ----------------------- */ 0x17,
  FormData_CHAR = /* ------------------ */ '\u0018',
  FormData_VALUE = /* -------------------- */ 0x18,
  JSXNode_CHAR = /* ------------------- */ '\u0019',
  JSXNode_VALUE = /* --------------------- */ 0x19,
  Set_CHAR = /* ----------------------- */ '\u001a',
  Set_VALUE = /* ------------------------- */ 0x1a,
  Map_CHAR = /* ----------------------- */ '\u001b',
  Map_VALUE = /* ------------------------- */ 0x1b,
  Promise_CHAR = /* ------------------- */ '\u001c',
  Promise_VALUE = /* --------------------- */ 0x1c,
  Uint8Array_CHAR = /* ---------------- */ '\u001e',
  Uint8Array_VALUE = /* ------------------- */ 0x1e,
  PropsProxy_CHAR = /* ---------------- */ '\u001f',
  PropsProxy_VALUE = /* ------------------- */ 0x1f,
  /// Can't go past this value
  LAST_VALUE = /* ------------------------ */ 0x20,
}

function serializeJSXType($addRoot$: (obj: unknown) => number, type: string | FunctionComponent) {
  if (typeof type === 'string') {
    return type;
  } else if (type === Slot) {
    return ':slot';
  } else if (type === Fragment) {
    return ':fragment';
  } else {
    return $addRoot$(type);
  }
}

function deserializeJSXType(
  container: DeserializeContainer,
  type: string
): string | FunctionComponent {
  if (type === ':slot') {
    return Slot;
  } else if (type === ':fragment') {
    return Fragment;
  } else {
    const ch = type.charCodeAt(0);
    if (48 /* '0' */ <= ch && ch <= 57 /* '9' */) {
      return container.$getObjectById$(type) as any;
    } else {
      return type;
    }
  }
}

export const codeToName = (code: number) => {
  switch (code) {
    case SerializationConstant.UNDEFINED_VALUE:
      return 'UNDEFINED';
    case SerializationConstant.REFERENCE_VALUE:
      return 'REFERENCE';
    case SerializationConstant.QRL_VALUE:
      return 'QRL';
    case SerializationConstant.Task_VALUE:
      return 'Task';
    case SerializationConstant.Resource_VALUE:
      return 'Resource';
    case SerializationConstant.URL_VALUE:
      return 'URL';
    case SerializationConstant.Date_VALUE:
      return 'Date';
    case SerializationConstant.Regex_VALUE:
      return 'Regex';
    case SerializationConstant.String_VALUE:
      return 'String';
    case SerializationConstant.UNUSED_HORIZONTAL_TAB_VALUE:
      return 'UNUSED_HORIZONTAL_TAB';
    case SerializationConstant.UNUSED_NEW_LINE_VALUE:
      return 'UNUSED_NEW_LINE';
    case SerializationConstant.UNUSED_VERTICAL_TAB_VALUE:
      return 'UNUSED_VERTICAL_TAB';
    case SerializationConstant.UNUSED_FORM_FEED_VALUE:
      return 'UNUSED_FORM_FEED';
    case SerializationConstant.UNUSED_CARRIAGE_RETURN_VALUE:
      return 'UNUSED_CARRIAGE_RETURN';
    case SerializationConstant.Error_VALUE:
      return 'Error';
    case SerializationConstant.VNode_VALUE:
      return 'VNode';
    case SerializationConstant.Component_VALUE:
      return 'Component';
    case SerializationConstant.DerivedSignal_VALUE:
      return 'DerivedSignal';
    case SerializationConstant.Store_VALUE:
      return 'Store';
    case SerializationConstant.Signal_VALUE:
      return 'Signal';
    case SerializationConstant.ComputedSignal_VALUE:
      return 'ComputedSignal';
    case SerializationConstant.NotFinite_VALUE:
      return 'NotFinite';
    case SerializationConstant.URLSearchParams_VALUE:
      return 'URLSearchParams';
    case SerializationConstant.FormData_VALUE:
      return 'FormData';
    case SerializationConstant.JSXNode_VALUE:
      return 'JSXNode';
    case SerializationConstant.BigInt_VALUE:
      return 'BigInt';
    case SerializationConstant.Set_VALUE:
      return 'Set';
    case SerializationConstant.Map_VALUE:
      return 'Map';
    case SerializationConstant.Promise_VALUE:
      return 'Promise';
    case SerializationConstant.Uint8Array_VALUE:
      return 'Uint8Array';
    case SerializationConstant.PropsProxy_VALUE:
      return 'Props';
  }
};
