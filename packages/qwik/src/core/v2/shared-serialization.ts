import { componentQrl, isQwikComponent } from '../component/component.public';
import { assertDefined, assertTrue } from '../error/assert';
import { createQRL, isQrl, type QRLInternal } from '../qrl/qrl-class';
import type { QRL } from '../qrl/qrl.public';
import type { DomContainer } from './client/dom-container';
import { SERIALIZABLE_STATE } from '../container/serializers';
import { vnode_locate } from './client/vnode';
import { Fragment, JSXNodeImpl, isJSXNode } from '../render/jsx/jsx-runtime';
import type { FunctionComponent } from '@builder.io/qwik/jsx-runtime';
import { Slot } from '../render/jsx/slot.public';
import { SignalImpl } from '../state/signal';
import { QObjectManagerSymbol } from '../state/constants';
import {
  parseSubscription,
  type LocalSubscriptionManager,
  serializeSubscription,
} from '../state/common';
import { isDev } from '../../build/index.dev';
import type { StreamWriter } from '../../server/types';
import { QwikElementAdapter } from './client/velement';

const deserializedProxyMap = new WeakMap<object, unknown>();

type DeserializerProxy<T extends object = object> = T & { [UNWRAP_PROXY]: object };

const unwrapDeserializerProxy = (value: unknown) => {
  const unwrapped =
    typeof value === 'object' && value !== null && (value as DeserializerProxy)[UNWRAP_PROXY];
  return unwrapped ? unwrapped : value;
};

export const isDeserializerProxy = (value: unknown): value is DeserializerProxy => {
  return typeof value === 'object' && value !== null && UNWRAP_PROXY in value;
};

const UNWRAP_PROXY = Symbol('UNWRAP_PROXY');
const wrapDeserializerProxy = (container: DomContainer, value: unknown) => {
  if (
    typeof value === 'object' && // Must be an object
    value !== null && // which is not null
    isObjectLiteral(value) && // and is object lit<T>eral (not URL, Data, etc.)
    !(value instanceof QwikElementAdapter)
  ) {
    if (isDeserializerProxy(value)) {
      // already wrapped
      return value;
    } else {
      let proxy = deserializedProxyMap.get(value);
      if (!proxy) {
        proxy = new Proxy(value, {
          get(target, property, receiver) {
            if (property === UNWRAP_PROXY) {
              return target;
            }
            // console.log('STATE PROXY GET', property);
            if (property === 'a') {
              // throw new Error('WHY?');
            }
            let propValue = Reflect.get(target, property, receiver);
            if (
              typeof propValue === 'string' &&
              propValue.length >= 1 &&
              propValue.charCodeAt(0) < SerializationConstant.LAST_VALUE
            ) {
              propValue = deserialize(container, propValue);
              if (
                typeof propValue !== 'string' ||
                (propValue.length > 0 && propValue.charCodeAt(0) < SerializationConstant.LAST_VALUE)
              ) {
                /**
                 * So we want to cache the value so that we don't have to deserialize it again AND
                 * so that deserialized object identity does not change.
                 *
                 * Unfortunately, there is a corner case! The deserialized value might be a string
                 * which looks like a serialized value, so in that rare case we will not cache the
                 * value. But it is OK because even thought the identity of string may change on
                 * deserialization, the value string equality will not change.
                 */
                Reflect.set(target, property, unwrapDeserializerProxy(propValue), receiver);
              }
            }
            return wrapDeserializerProxy(container, propValue);
          },
          has(target, property) {
            if (property === UNWRAP_PROXY) {
              return true;
            }
            return Object.prototype.hasOwnProperty.call(target, property);
          },
        });
        deserializedProxyMap.set(value, proxy);
      }
      return proxy;
    }
  }
  return value;
};

export const deserialize = <T>(container: DomContainer, value: unknown): T => {
  if (typeof value === 'object' && value !== null) {
    return wrapDeserializerProxy(container, value) as T;
  } else if (typeof value === 'string' && value.length) {
    const code = value.charCodeAt(0);
    // only cut rest if we have a valid code
    const rest = code < SerializationConstant.LAST_VALUE ? value.substring(1) : null!;
    switch (code) {
      case SerializationConstant.REFERENCE_VALUE:
        const ref = parseInt(rest);
        return container.getObjectById(ref);
      case SerializationConstant.UNDEFINED_VALUE:
        return undefined as T;
      case SerializationConstant.QRL_VALUE:
        return parseQRL(container, rest) as T;
      case SerializationConstant.Task_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.Resource_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.URL_VALUE:
        return new URL(rest) as T;
      case SerializationConstant.Date_VALUE:
        return new Date(rest) as T;
      case SerializationConstant.Regex_VALUE:
        const idx = rest.lastIndexOf('/');
        return new RegExp(rest.substring(1, idx), rest.substring(idx + 1)) as T;
      case SerializationConstant.Error_VALUE:
        const obj = container.getObjectById(parseInt(rest));
        return Object.assign(new Error(rest), obj) as T;
      case SerializationConstant.Component_VALUE:
        return componentQrl(parseQRL(container, rest) as any) as T;
      case SerializationConstant.DerivedSignal_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.Signal_VALUE:
        const valueIdx = rest.indexOf(' ');
        const value = container.getObjectById(parseInt(rest.substring(0, valueIdx)));
        const manager: LocalSubscriptionManager = container.$subsManager$?.$createManager$();
        const subscription = parseSubscription(
          rest.substring(valueIdx + 1),
          container.getObjectById
        );
        // console.log('DESERIALIZE', subscription);
        // TODO we should strip off the key of Subscriptions or be sure we only receive Subscribers (no key)
        subscription && manager.$addSub$(subscription as any);
        return new SignalImpl(value, manager, 0) as T;
      case SerializationConstant.SignalWrapper_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.NaN_VALUE:
        return Number.NaN as T;
      case SerializationConstant.URLSearchParams_VALUE:
        return new URLSearchParams(rest) as T;
      case SerializationConstant.FormData_VALUE:
        const formData = new FormData();
        for (const [key, value] of container.getObjectById(parseInt(rest))) {
          formData.append(key, value);
        }
        return formData as T;
      case SerializationConstant.JSXNode_VALUE:
        const [type, props, immutableProps, children, flags] = rest.split(' ');
        return new JSXNodeImpl(
          deserializeJSXType(container, type),
          container.getObjectById(props),
          container.getObjectById(immutableProps),
          container.getObjectById(children),
          parseInt(flags)
        ) as T;
      case SerializationConstant.BigInt_VALUE:
        return BigInt(rest) as T;
      case SerializationConstant.Set_VALUE:
        return new Set(container.getObjectById(parseInt(rest))) as T;
      case SerializationConstant.Map_VALUE:
        return new Map(container.getObjectById(parseInt(rest))) as T;
      case SerializationConstant.VNode_VALUE:
        return rest === ''
          ? (container.element.ownerDocument as T)
          : (vnode_locate(container.rootVNode, rest) as T);
      case SerializationConstant.String_VALUE:
        return rest as T;
      default:
    }
  }
  return value as T;
};

export function parseQRL(container: DomContainer, qrl: string): QRL<any> {
  const hashIdx = qrl.indexOf('#');
  const captureStart = qrl.indexOf('[', hashIdx);
  const captureEnd = qrl.indexOf(']', captureStart);
  const chunk = hashIdx > -1 ? qrl.substring(0, hashIdx) : qrl;
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
  const captureRefs = captureIds
    ? captureIds.map((id) => container.getObjectById(parseInt(id)))
    : null;
  if (isDev && chunk === QRL_RUNTIME_CHUNK) {
    const backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
    assertDefined(backChannel, 'Missing QRL_RUNTIME_CHUNK');
    qrlRef = backChannel.get(symbol);
  }
  return createQRL(chunk, symbol, qrlRef, null, captureIds, captureRefs, null);
}

export interface SerializationContext {
  $containerElement$: Element | null;
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
  $wasSeen$: (obj: any) => number | undefined;

  $hasRootId$: (obj: any) => number | undefined;

  /**
   * Root objects which need to be serialized.
   *
   * Roots are entry points into the object graph. Typically the roots are held by the listeners.
   * Because objects can share child objects, we need a way to create secondary roots to share those
   * objects.
   */
  $addRoot$: (obj: unknown) => number;

  $seen$: (obj: unknown) => void;

  $roots$: unknown[];

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
}

export const createSerializationContext = (
  NodeConstructor: SerializationContext['$NodeConstructor$'] | null,
  containerElement: Element | null,
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
  const roots: any[] = [];
  return {
    $NodeConstructor$: NodeConstructor,
    $containerElement$: containerElement,
    $wasSeen$: (obj: any) => map.get(obj),
    $roots$: roots,
    $seen$: (obj: any) => map.set(obj, Number.MIN_SAFE_INTEGER),
    $hasRootId$: (obj: any) => {
      const id = map.get(obj);
      return id === undefined || id === Number.MIN_SAFE_INTEGER ? undefined : id;
    },
    $addRoot$: (obj: any) => {
      let id = map.get(obj);
      if (!id || id === Number.MIN_SAFE_INTEGER) {
        id = roots.length;
        map.set(obj, id);
        roots.push(obj);
      }
      return id;
    },
    $writer$: writer,
  };
};

export function serialize(serializationContext: SerializationContext): void {
  const objRoots = serializationContext.$roots$;
  for (let i = 0; i < objRoots.length; i++) {
    breakCircularDependencies(serializationContext, objRoots[i]);
  }

  const { $writer$, $addRoot$, $NodeConstructor$: $Node$ } = serializationContext;
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

  const writeValue = (value: any) => {
    if (typeof value === 'bigint') {
      return writeString(SerializationConstant.BigInt_CHAR + value.toString());
    } else if (typeof value === 'boolean') {
      $writer$.write(String(value));
    } else if (typeof value === 'function') {
      if (isQrl(value)) {
        writeString(SerializationConstant.QRL_CHAR + qrlToString(value, $addRoot$));
      } else if (isQwikComponent(value)) {
        const [qrl]: [QRLInternal] = (value as any)[SERIALIZABLE_STATE];
        writeString(SerializationConstant.Component_CHAR + qrlToString(qrl, $addRoot$));
      } else {
        // throw new Error('implement: ' + value);
        writeString(value.toString());
      }
    } else if (typeof value === 'number') {
      if (Number.isNaN(value)) {
        return writeString(SerializationConstant.NaN_CHAR);
      } else {
        $writer$.write(String(value));
      }
    } else if (typeof value === 'object') {
      depth++;
      if (value === null) {
        $writer$.write('null');
      } else {
        writeObjectValue(value);
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
    } else if (typeof value === 'symbol') {
      throw new Error('implement');
    } else if (typeof value === 'undefined') {
      writeString(SerializationConstant.UNDEFINED_CHAR);
    } else {
      throw new Error('Unknown type: ' + typeof value);
    }
  };

  const writeObjectValue = (value: any) => {
    // Objects are the only way to create circular dependencies.
    // So the first thing to to is to see if we have a circular dependency.
    // (NOTE: For root objects we need to serialize them regardless if we have seen
    //        them before, otherwise the root object reference will point to itself.)
    const seen = depth <= 1 ? undefined : serializationContext.$wasSeen$(value);
    if (typeof seen === 'number' && seen >= 0) {
      // We have seen this object before, so we can serialize it as a reference.
      // Otherwise serialize as normal
      writeString(SerializationConstant.REFERENCE_CHAR + seen);
    } else if (isObjectLiteral(value)) {
      serializeObjectLiteral(value, $writer$, writeValue, writeString);
    } else if (value instanceof SignalImpl) {
      const manager = value[QObjectManagerSymbol];
      const data: string[] = [];
      for (const sub of manager.$subs$) {
        const serialized = serializeSubscription(sub, $addRoot$);
        serialized && data.push(serialized);
      }
      writeString(
        SerializationConstant.Signal_CHAR + $addRoot$(value.untrackedValue) + ' ' + data.join(' ')
      );
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
    } else if ($Node$ && value instanceof $Node$) {
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
      writeString(SerializationConstant.Set_CHAR + $addRoot$(Array.from(value.values())));
    } else if (value instanceof Map) {
      const tuples: Array<[any, any]> = [];
      value.forEach((v, k) => tuples.push([k, v]));
      writeString(SerializationConstant.Map_CHAR + $addRoot$(tuples));
    } else if (isJSXNode<any>(value)) {
      writeString(
        SerializationConstant.JSXNode_CHAR +
          `${serializeJSXType($addRoot$, value.type)} ${$addRoot$(value.props)} ${$addRoot$(
            value.immutableProps
          )} ${$addRoot$(value.children)} ${value.flags}`
      );
    } else {
      throw new Error('implement: ' + value);
    }
  };

  writeValue(objRoots);
}

function serializeObjectLiteral(
  value: any,
  $writer$: StreamWriter,
  writeValue: (value: any) => void,
  writeString: (text: string) => void
) {
  if (Array.isArray(value)) {
    // Serialize as array.
    $writer$.write('[');
    for (let i = 0; i < value.length; i++) {
      if (i !== 0) {
        $writer$.write(',');
      }
      writeValue(value[i]);
    }
    $writer$.write(']');
  } else {
    // Serialize as object.
    $writer$.write('{');
    let delimiter = false;
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        delimiter && $writer$.write(',');
        writeString(key);
        $writer$.write(':');
        writeValue(value[key]);
        delimiter = true;
      }
    }
    $writer$.write('}');
  }
}

export function qrlToString(value: QRLInternal, getObjectId: (obj: any) => number | undefined) {
  if (isDev && !value.$chunk$) {
    let backChannel: Map<string, Function> = (globalThis as any)[QRL_RUNTIME_CHUNK];
    if (!backChannel) {
      backChannel = (globalThis as any)[QRL_RUNTIME_CHUNK] = new Map();
    }
    backChannel.set(value.$symbol$, (value as any)._devOnlySymbolRef);
  }
  const qrlString =
    (value.$chunk$ || QRL_RUNTIME_CHUNK) +
    '#' +
    value.$symbol$ +
    (value.$captureRef$ ? `[${value.$captureRef$.map(getObjectId).join(' ')}]` : '');
  return qrlString;
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
    // typeof obj === 'function' ||
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
function isObjectLiteral(obj: unknown) {
  // We are an object literal if:
  // - we are a direct instance of object OR
  // - we are an array
  // In all other cases it is a subclass which requires more checks.
  const prototype = Object.getPrototypeOf(obj);
  return prototype === Object.prototype || prototype === Array.prototype;
}

const breakCircularDependencies = (
  serializationContext: SerializationContext,
  rootObj: unknown
) => {
  const discoveredValues: unknown[] = [rootObj];
  // let count = 100;
  while (discoveredValues.length) {
    // if (count-- < 0) {
    //   throw new Error('INFINITE LOOP');
    // }
    const obj = discoveredValues.pop();
    if (shouldTrackObj(obj)) {
      const isRoot = obj === rootObj;
      // For root objects we pretend we have not seen them to force scan.
      const id = serializationContext.$wasSeen$(obj);
      if (id === undefined || isRoot) {
        // Object has not been seen yet, must scan content
        // But not for root.
        !isRoot && serializationContext.$seen$(obj);
        if (obj instanceof Set) {
          obj.forEach((v) => discoveredValues.push(v));
        } else if (obj instanceof Map) {
          obj.forEach((v, k) => {
            discoveredValues.push(v);
            discoveredValues.push(k);
          });
        } else if (isJSXNode(obj)) {
          discoveredValues.push(obj.type, obj.props, obj.immutableProps, obj.children);
        } else {
          for (const key in obj as object) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              discoveredValues.push((obj as any)[key]);
            }
          }
        }
      } else if (id === Number.MIN_SAFE_INTEGER) {
        // We are seeing this object second time => promoted it.
        serializationContext.$addRoot$(obj);
        // we don't need to scan the children, since we have already seen them.
      }
    }
  }
};

const QRL_RUNTIME_CHUNK = 'qwik-runtime-mock-chunk';

const enum SerializationConstant {
  UNDEFINED_CHAR = /* ----------------- */ '\u0000',
  UNDEFINED_VALUE = /* -------------------- */ 0x0,
  REFERENCE_CHAR = /* ----------------- */ '\u0001',
  REFERENCE_VALUE = /* -------------------- */ 0x1,
  QRL_CHAR = /* ----------------------- */ '\u0002',
  QRL_VALUE = /* -------------------------- */ 0x2,
  Task_CHAR = /* ---------------------- */ '\u0003',
  Task_VALUE = /* ------------------------- */ 0x3,
  Resource_CHAR = /* ------------------ */ '\u0004',
  Resource_VALUE = /* --------------------- */ 0x4,
  URL_CHAR = /* ----------------------- */ '\u0005',
  URL_VALUE = /* -------------------------- */ 0x5,
  Date_CHAR = /* ---------------------- */ '\u0006',
  Date_VALUE = /* ------------------------- */ 0x6,
  Regex_CHAR = /* --------------------- */ '\u0007',
  Regex_VALUE = /* ------------------------ */ 0x7,
  String_CHAR = /* -------------------- */ '\u0008',
  String_VALUE = /* ----------------------- */ 0x8,
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
  Error_CHAR = /* --------------------- */ '\u000e',
  Error_VALUE = /* ------------------------ */ 0xe,
  VNode_CHAR = /* --------------------- */ '\u000f',
  VNode_VALUE = /* ------------------------ */ 0xf,
  Component_CHAR = /* ----------------- */ '\u0010',
  Component_VALUE = /* ------------------- */ 0x10,
  DerivedSignal_CHAR = /* ------------- */ '\u0011',
  DerivedSignal_VALUE = /* --------------- */ 0x11,
  Signal_CHAR = /* -------------------- */ '\u0012',
  Signal_VALUE = /* ---------------------- */ 0x12,
  SignalWrapper_CHAR = /* ------------- */ '\u0013',
  SignalWrapper_VALUE = /* --------------- */ 0x13,
  NaN_CHAR = /* ----------------------- */ '\u0014',
  NaN_VALUE = /* ------------------------- */ 0x14,
  URLSearchParams_CHAR = /* ----------- */ '\u0015',
  URLSearchParams_VALUE = /* ------------- */ 0x15,
  FormData_CHAR = /* ------------------ */ '\u0016',
  FormData_VALUE = /* -------------------- */ 0x16,
  JSXNode_CHAR = /* ------------------- */ '\u0017',
  JSXNode_VALUE = /* --------------------- */ 0x17,
  BigInt_CHAR = /* -------------------- */ '\u0018',
  BigInt_VALUE = /* ---------------------- */ 0x18,
  Set_CHAR = /* ----------------------- */ '\u0019',
  Set_VALUE = /* ------------------------- */ 0x19,
  Map_CHAR = /* ----------------------- */ '\u001a',
  Map_VALUE = /* ------------------------- */ 0x1a,
  LAST_VALUE = /* ------------------------ */ 0x1b,
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

function deserializeJSXType(container: DomContainer, type: string): string | FunctionComponent {
  if (type === ':slot') {
    return Slot;
  } else if (type === ':fragment') {
    return Fragment;
  } else {
    const ch = type.charCodeAt(0);
    if (48 /* '0' */ <= ch && ch <= 57 /* '9' */) {
      return container.getObjectById(type);
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
    case SerializationConstant.Signal_VALUE:
      return 'Signal';
    case SerializationConstant.SignalWrapper_VALUE:
      return 'SignalWrapper';
    case SerializationConstant.NaN_VALUE:
      return 'NaN';
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
  }
};
