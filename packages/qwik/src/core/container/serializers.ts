import {
  type Component,
  componentQrl,
  isQwikComponent,
  type OnRenderFn,
} from '../component/component.public';
import { parseQRL, serializeQRL } from '../qrl/qrl';
import { isQrl, type QRLInternal } from '../qrl/qrl-class';
import { intToStr, type ContainerState, type GetObject, type MustGetObjID } from './container';
import { isResourceReturn, parseResourceReturn, serializeResource } from '../use/use-resource';
import {
  isSubscriberDescriptor,
  parseTask,
  type ResourceReturnInternal,
  serializeTask,
  type SubscriberEffect,
} from '../use/use-task';
import { isDocument } from '../util/element';
import {
  QObjectSignalFlags,
  SIGNAL_IMMUTABLE,
  SignalDerived,
  SignalImpl,
  SignalWrapper,
} from '../state/signal';
import { type Collector, collectSubscriptions, collectValue, mapJoin } from './pause';
import {
  fastWeakSerialize,
  getSubscriptionManager,
  LocalSubscriptionManager,
  type SubscriptionManager,
  type Subscriptions,
} from '../state/common';
import { getOrCreateProxy } from '../state/store';
import { QObjectManagerSymbol } from '../state/constants';
import { serializeDerivedSignalFunc } from '../qrl/inlined-fn';
import type { QwikElement } from '../render/dom/virtual-element';
import { assertString, assertTrue } from '../error/assert';
import { Fragment, JSXNodeImpl, isJSXNode } from '../render/jsx/jsx-runtime';
import { Slot } from '../render/jsx/slot.public';
import type { JSXNodeInternal } from '../render/jsx/types/jsx-node';

/**
 * - 0, 8, 9, A, B, C, D
 * - `\0`: null character (U+0000 NULL) (only if the next character is not a decimal digit; else it’s
 *   an octal escape sequence)
 * - `\b`: backspace (U+0008 BACKSPACE)
 * - `\t`: horizontal tab (U+0009 CHARACTER TABULATION)
 * - `\n`: line feed (U+000A LINE FEED)
 * - `\v`: vertical tab (U+000B LINE TABULATION)
 * - `\f`: form feed (U+000C FORM FEED)
 * - `\r`: carriage return (U+000D CARRIAGE RETURN)
 * - `\"`: double quote (U+0022 QUOTATION MARK)
 * - `\'`: single quote (U+0027 APOSTROPHE)
 * - `\\`: backslash (U+005C REVERSE SOLIDUS)
 */
export const UNDEFINED_PREFIX = '\u0001';

interface SerializerInput<T> {
  /** Unique identifier for this type */
  $prefix$: string;
  /** Can this serializer can serialize the given object? */
  $test$: (obj: unknown) => boolean;
  /** Convert the object to a string. */
  $serialize$?:
    | ((
        obj: T,
        getObjID: MustGetObjID,
        collector: Collector,
        containerState: ContainerState
      ) => string)
    | undefined;

  /** Collect all relevant values before serializing */
  $collect$?: undefined | ((obj: T, collector: Collector, leaks: boolean | QwikElement) => void);

  /** Deserialize the object, first pass */
  $prepare$: (data: string, containerState: ContainerState, doc: Document) => T;
  /** After $prepare$, restore subscribers of the object. */
  $subs$?: undefined | ((obj: T, subs: Subscriptions[], containerState: ContainerState) => void);

  /** After $prepare$, fill in the object. */
  $fill$?: ((obj: T, getObject: GetObject, containerState: ContainerState) => void) | undefined;
}

interface Serializer<T> extends Omit<SerializerInput<T>, '$prefix$' | '$test$'> {
  /** The identifier as a charcode */
  $prefixCode$: number;
  /** The identifier as a string */
  $prefixChar$: string;
  /** Can this serializer can serialize the given object? */
  $test$: (obj: unknown) => obj is T;
}

/**
 * Normalize the shape of the serializer for better inline-cache performance.
 *
 * @param serializer
 * @returns
 */
function serializer<T>(serializer: SerializerInput<T>): Serializer<T> {
  return {
    $prefixCode$: serializer.$prefix$.charCodeAt(0),
    $prefixChar$: serializer.$prefix$,
    $test$: serializer.$test$ as any,
    $serialize$: serializer.$serialize$,
    $prepare$: serializer.$prepare$,
    $fill$: serializer.$fill$,
    $collect$: serializer.$collect$,
    $subs$: serializer.$subs$,
  };
}

const QRLSerializer = /*#__PURE__*/ serializer<QRLInternal>({
  $prefix$: '\u0002',
  $test$: (v) => isQrl(v),
  $collect$: (v, collector, leaks) => {
    if (v.$captureRef$) {
      for (const item of v.$captureRef$) {
        collectValue(item, collector, leaks);
      }
    }
    if (collector.$prefetch$ === 0) {
      collector.$qrls$.push(v);
    }
  },
  $serialize$: (obj, getObjId) => {
    return serializeQRL(obj, {
      $getObjId$: getObjId,
    });
  },
  $prepare$: (data, containerState) => {
    return parseQRL(data, containerState.$containerEl$);
  },
  $fill$: (qrl, getObject) => {
    if (qrl.$capture$ && qrl.$capture$.length > 0) {
      qrl.$captureRef$ = qrl.$capture$.map(getObject);
      qrl.$capture$ = null;
    }
  },
});

const TaskSerializer = /*#__PURE__*/ serializer<SubscriberEffect>({
  $prefix$: '\u0003',
  $test$: (v) => isSubscriberDescriptor(v),
  $collect$: (v, collector, leaks) => {
    collectValue(v.$qrl$, collector, leaks);
    if (v.$state$) {
      collectValue(v.$state$, collector, leaks);
      if (leaks === true && v.$state$ instanceof SignalImpl) {
        collectSubscriptions(v.$state$[QObjectManagerSymbol], collector, true);
      }
    }
  },
  $serialize$: (obj, getObjId) => serializeTask(obj, getObjId),
  $prepare$: (data) => parseTask(data) as any,
  $fill$: (task, getObject) => {
    task.$el$ = getObject(task.$el$ as any);
    task.$qrl$ = getObject(task.$qrl$ as any);
    if (task.$state$) {
      task.$state$ = getObject(task.$state$ as any);
    }
  },
});

const ResourceSerializer = /*#__PURE__*/ serializer<ResourceReturnInternal<any>>({
  $prefix$: '\u0004',
  $test$: (v) => isResourceReturn(v),
  $collect$: (obj, collector, leaks) => {
    collectValue(obj.value, collector, leaks);
    collectValue(obj._resolved, collector, leaks);
  },
  $serialize$: (obj, getObjId) => {
    return serializeResource(obj, getObjId);
  },
  $prepare$: (data) => {
    return parseResourceReturn(data);
  },
  $fill$: (resource, getObject) => {
    if (resource._state === 'resolved') {
      resource._resolved = getObject(resource._resolved);
      resource.value = Promise.resolve(resource._resolved);
    } else if (resource._state === 'rejected') {
      const p = Promise.reject(resource._error);
      p.catch(() => null);
      resource._error = getObject(resource._error as any as string);
      resource.value = p;
    }
  },
});

const URLSerializer = /*#__PURE__*/ serializer<URL>({
  $prefix$: '\u0005',
  $test$: (v) => v instanceof URL,
  $serialize$: (obj) => obj.href,
  $prepare$: (data) => new URL(data),
});

const DateSerializer = /*#__PURE__*/ serializer<Date>({
  $prefix$: '\u0006',
  $test$: (v) => v instanceof Date,
  $serialize$: (obj) => obj.toISOString(),
  $prepare$: (data) => new Date(data),
});

const RegexSerializer = /*#__PURE__*/ serializer<RegExp>({
  $prefix$: '\u0007',
  $test$: (v) => v instanceof RegExp,
  $serialize$: (obj) => `${obj.flags} ${obj.source}`,
  $prepare$: (data) => {
    const space = data.indexOf(' ');
    const source = data.slice(space + 1);
    const flags = data.slice(0, space);
    return new RegExp(source, flags);
  },
});

const ErrorSerializer = /*#__PURE__*/ serializer<Error>({
  $prefix$: '\u000E',
  $test$: (v) => v instanceof Error,
  $serialize$: (obj) => {
    return obj.message;
  },
  $prepare$: (text) => {
    const err = new Error(text);
    err.stack = undefined;
    return err;
  },
});

const DocumentSerializer = /*#__PURE__*/ serializer<Document>({
  $prefix$: '\u000F',
  $test$: (v) => !!v && typeof v === 'object' && isDocument(v as Node),
  $prepare$: (_, _c, doc) => {
    return doc;
  },
});

export const SERIALIZABLE_STATE = Symbol('serializable-data');
const ComponentSerializer = /*#__PURE__*/ serializer<Component>({
  $prefix$: '\u0010',
  $test$: (obj) => isQwikComponent(obj),
  $serialize$: (obj, getObjId) => {
    const [qrl]: [QRLInternal] = (obj as any)[SERIALIZABLE_STATE];
    return serializeQRL(qrl, {
      $getObjId$: getObjId,
    });
  },
  $prepare$: (data, containerState) => {
    const qrl = parseQRL<OnRenderFn<any>>(data, containerState.$containerEl$);
    return componentQrl(qrl);
  },
  $fill$: (component, getObject) => {
    const [qrl]: [QRLInternal] = (component as any)[SERIALIZABLE_STATE];
    if (qrl.$capture$?.length) {
      qrl.$captureRef$ = qrl.$capture$.map(getObject);
      qrl.$capture$ = null;
    }
  },
});

const DerivedSignalSerializer = /*#__PURE__*/ serializer<SignalDerived>({
  $prefix$: '\u0011',
  $test$: (obj) => obj instanceof SignalDerived,
  $collect$: (obj, collector, leaks) => {
    if (obj.$args$) {
      for (const arg of obj.$args$) {
        collectValue(arg, collector, leaks);
      }
    }
  },
  $serialize$: (signal, getObjID, collector) => {
    const serialized = serializeDerivedSignalFunc(signal);
    let index = collector.$inlinedFunctions$.indexOf(serialized);
    if (index < 0) {
      index = collector.$inlinedFunctions$.length;
      collector.$inlinedFunctions$.push(serialized);
    }
    return mapJoin(signal.$args$, getObjID, ' ') + ' @' + intToStr(index);
  },
  $prepare$: (data) => {
    const ids = data.split(' ');
    const args = ids.slice(0, -1);
    const fn = ids[ids.length - 1];
    return new SignalDerived(fn as any, args as any[], fn);
  },
  $fill$: (fn, getObject) => {
    assertString(fn.$func$, 'fn.$func$ should be a string');
    fn.$func$ = getObject(fn.$func$);
    fn.$args$ = (fn.$args$ as string[]).map(getObject);
  },
});

const SignalSerializer = /*#__PURE__*/ serializer<SignalImpl<any>>({
  $prefix$: '\u0012',
  $test$: (v) => v instanceof SignalImpl,
  $collect$: (obj, collector, leaks) => {
    collectValue(obj.untrackedValue, collector, leaks);
    const mutable = (obj[QObjectSignalFlags] & SIGNAL_IMMUTABLE) === 0;
    if (leaks === true && mutable) {
      collectSubscriptions(obj[QObjectManagerSymbol], collector, true);
    }
    return obj;
  },
  $serialize$: (obj, getObjId) => {
    return getObjId(obj.untrackedValue);
  },
  $prepare$: (data, containerState) => {
    return new SignalImpl(data, containerState?.$subsManager$?.$createManager$(), 0);
  },
  $subs$: (signal, subs) => {
    signal[QObjectManagerSymbol].$addSubs$(subs);
  },
  $fill$: (signal, getObject) => {
    signal.untrackedValue = getObject(signal.untrackedValue);
  },
});

const SignalWrapperSerializer = /*#__PURE__*/ serializer<SignalWrapper<any, any>>({
  $prefix$: '\u0013',
  $test$: (v) => v instanceof SignalWrapper,
  $collect$(obj, collector, leaks) {
    collectValue(obj.ref, collector, leaks);
    if (fastWeakSerialize(obj.ref)) {
      const localManager = getSubscriptionManager(obj.ref)!;
      if (isTreeShakeable(collector.$containerState$.$subsManager$, localManager, leaks)) {
        collectValue(obj.ref[obj.prop], collector, leaks);
      }
    }
    return obj;
  },
  $serialize$: (obj, getObjId) => {
    return `${getObjId(obj.ref)} ${obj.prop}`;
  },
  $prepare$: (data) => {
    const [id, prop] = data.split(' ');
    return new SignalWrapper(id as any, prop);
  },
  $fill$: (signal, getObject) => {
    signal.ref = getObject(signal.ref);
  },
});

const NoFiniteNumberSerializer = /*#__PURE__*/ serializer<number>({
  $prefix$: '\u0014',
  $test$: (v) => typeof v === 'number',
  $serialize$: (v) => {
    return String(v);
  },
  $prepare$: (data) => {
    return Number(data);
  },
});

const URLSearchParamsSerializer = /*#__PURE__*/ serializer<URLSearchParams>({
  $prefix$: '\u0015',
  $test$: (v) => v instanceof URLSearchParams,
  $serialize$: (obj) => obj.toString(),
  $prepare$: (data) => new URLSearchParams(data),
});

const FormDataSerializer = /*#__PURE__*/ serializer<FormData>({
  $prefix$: '\u0016',
  $test$: (v) => typeof FormData !== 'undefined' && v instanceof globalThis.FormData,
  $serialize$: (formData) => {
    const array: [string, string][] = [];
    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        array.push([key, value]);
      } else {
        array.push([key, value.name]);
      }
    });
    return JSON.stringify(array);
  },
  $prepare$: (data) => {
    const array = JSON.parse(data);
    const formData = new FormData();
    for (const [key, value] of array) {
      formData.append(key, value);
    }
    return formData;
  },
});

const JSXNodeSerializer = /*#__PURE__*/ serializer<JSXNodeInternal>({
  $prefix$: '\u0017',
  $test$: (v) => isJSXNode(v),
  $collect$: (node, collector, leaks) => {
    collectValue(node.children, collector, leaks);
    collectValue(node.props, collector, leaks);
    collectValue(node.immutableProps, collector, leaks);
    collectValue(node.key, collector, leaks);
    let type = node.type;
    if (type === Slot) {
      type = ':slot';
    } else if (type === Fragment) {
      type = ':fragment';
    }
    collectValue(type, collector, leaks);
  },
  $serialize$: (node, getObjID) => {
    let type = node.type;
    if (type === Slot) {
      type = ':slot';
    } else if (type === Fragment) {
      type = ':fragment';
    }
    return `${getObjID(type)} ${getObjID(node.props)} ${getObjID(node.immutableProps)} ${getObjID(
      node.key
    )} ${getObjID(node.children)} ${node.flags}`;
  },
  $prepare$: (data) => {
    const [type, props, immutableProps, key, children, flags] = data.split(' ');
    const node = new JSXNodeImpl(
      type as string,
      props as any,
      immutableProps as any,
      children,
      parseInt(flags, 10),
      key as string
    );
    return node;
  },
  $fill$: (node, getObject) => {
    node.type = getResolveJSXType(getObject(node.type as string));
    node.props = getObject(node.props as any as string);
    node.immutableProps = getObject(node.immutableProps as any as string);
    node.key = getObject(node.key as string);
    node.children = getObject(node.children as string);
  },
});

const BigIntSerializer = /*#__PURE__*/ serializer<bigint>({
  $prefix$: '\u0018',
  $test$: (v) => typeof v === 'bigint',
  $serialize$: (v) => {
    return v.toString();
  },
  $prepare$: (data) => {
    return BigInt(data);
  },
});

const Uint8ArraySerializer = /*#__PURE__*/ serializer<Uint8Array>({
  $prefix$: '\u001c',
  $test$: (v) => v instanceof Uint8Array,
  $serialize$: (v) => {
    let buf = '';
    for (const c of v) {
      buf += String.fromCharCode(c);
    }
    return btoa(buf).replace(/=+$/, '');
  },
  $prepare$: (data) => {
    const buf = atob(data);
    const bytes = new Uint8Array(buf.length);
    let i = 0;
    for (const s of buf) {
      bytes[i++] = s.charCodeAt(0);
    }
    return bytes;
  },
  $fill$: undefined,
});

const DATA = Symbol();
const SetSerializer = /*#__PURE__*/ serializer<Set<any>>({
  $prefix$: '\u0019',
  $test$: (v) => v instanceof Set,
  $collect$: (set, collector, leaks) => {
    set.forEach((value) => collectValue(value, collector, leaks));
  },
  $serialize$: (v, getObjID) => {
    return Array.from(v).map(getObjID).join(' ');
  },
  $prepare$: (data) => {
    const set = new Set();
    (set as any)[DATA] = data;
    return set;
  },
  $fill$: (set, getObject) => {
    const data = (set as any)[DATA];
    (set as any)[DATA] = undefined;
    assertString(data, 'SetSerializer should be defined');
    const items = data.length === 0 ? [] : data.split(' ');
    for (const id of items) {
      set.add(getObject(id));
    }
  },
});

const MapSerializer = /*#__PURE__*/ serializer<Map<any, any>>({
  $prefix$: '\u001a',
  $test$: (v) => v instanceof Map,
  $collect$: (map, collector, leaks) => {
    map.forEach((value, key) => {
      collectValue(value, collector, leaks);
      collectValue(key, collector, leaks);
    });
  },
  $serialize$: (map, getObjID) => {
    const result: string[] = [];
    map.forEach((value, key) => {
      result.push(getObjID(key) + ' ' + getObjID(value));
    });
    return result.join(' ');
  },
  $prepare$: (data) => {
    const set = new Map();
    (set as any)[DATA] = data;
    return set;
  },
  $fill$: (set, getObject) => {
    const data = (set as any)[DATA];
    (set as any)[DATA] = undefined;
    assertString(data, 'SetSerializer should be defined');
    const items = data.length === 0 ? [] : data.split(' ');
    assertTrue(items.length % 2 === 0, 'MapSerializer should have even number of items');
    for (let i = 0; i < items.length; i += 2) {
      set.set(getObject(items[i]), getObject(items[i + 1]));
    }
  },
});

const StringSerializer = /*#__PURE__*/ serializer<string>({
  $prefix$: '\u001b',
  $test$: (v) => !!getSerializer(v) || v === UNDEFINED_PREFIX,
  $serialize$: (v) => v,
  $prepare$: (data) => data,
});

const serializers: Serializer<any>[] = [
  // NULL                       \u0000
  // UNDEFINED_PREFIX           \u0001
  QRLSerializer, ////////////// \u0002
  TaskSerializer, ///////////// \u0003
  ResourceSerializer, ///////// \u0004
  URLSerializer, ////////////// \u0005
  DateSerializer, ///////////// \u0006
  RegexSerializer, //////////// \u0007
  // BACKSPACE                  \u0008
  // HORIZONTAL TAB             \u0009
  // NEW LINE                   \u000A
  // VERTICAL TAB               \u000B
  // FORM FEED                  \u000C
  // CARRIAGE RETURN            \u000D
  ErrorSerializer, //////////// \u000E
  DocumentSerializer, ///////// \u000F
  ComponentSerializer, //////// \u0010
  DerivedSignalSerializer, //// \u0011
  SignalSerializer, /////////// \u0012
  SignalWrapperSerializer, //// \u0013
  NoFiniteNumberSerializer, /// \u0014
  URLSearchParamsSerializer, // \u0015
  FormDataSerializer, ///////// \u0016
  JSXNodeSerializer, ////////// \u0017
  BigIntSerializer, /////////// \u0018
  SetSerializer, ////////////// \u0019
  MapSerializer, ////////////// \u001a
  StringSerializer, /////////// \u001b
  Uint8ArraySerializer, /////// \u001c
];

const serializerByPrefix: (Serializer<unknown> | undefined)[] = /*#__PURE__*/ (() => {
  const serializerByPrefix: (Serializer<unknown> | undefined)[] = [];
  serializers.forEach((s) => {
    const prefix = s.$prefixCode$;
    while (serializerByPrefix.length < prefix) {
      serializerByPrefix.push(undefined);
    }
    serializerByPrefix.push(s);
  });
  return serializerByPrefix;
})();

export function getSerializer(obj: any): Serializer<unknown> | undefined {
  if (typeof obj === 'string') {
    const prefix = obj.charCodeAt(0);
    if (prefix < serializerByPrefix.length) {
      return serializerByPrefix[prefix];
    }
  }
  return undefined;
}

const collectorSerializers = /*#__PURE__*/ serializers.filter((a) => a.$collect$);

export const canSerialize = (obj: any): boolean => {
  for (const s of serializers) {
    if (s.$test$(obj)) {
      return true;
    }
  }
  return false;
};

export const collectDeps = (obj: unknown, collector: Collector, leaks: boolean | QwikElement) => {
  for (const s of collectorSerializers) {
    if (s.$test$(obj)) {
      s.$collect$!(obj, collector, leaks);
      return true;
    }
  }
  return false;
};

export const serializeValue = (
  obj: any,
  getObjID: MustGetObjID,
  collector: Collector,
  containerState: ContainerState
) => {
  for (const s of serializers) {
    if (s.$test$(obj)) {
      let value = s.$prefixChar$;
      if (s.$serialize$) {
        value += s.$serialize$(obj, getObjID, collector, containerState);
      }
      return value;
    }
  }
  if (typeof obj === 'string') {
    return obj;
  }
  return undefined;
};

export interface Parser {
  prepare(data: string): any;
  subs(obj: any, subs: Subscriptions[]): boolean;
  fill(obj: any, getObject: GetObject): boolean;
}

export const createParser = (containerState: ContainerState, doc: Document): Parser => {
  const fillMap = new Map<any, Serializer<any>>();
  const subsMap = new Map<any, Serializer<any>>();

  return {
    prepare(data: string) {
      const serializer = getSerializer(data);
      if (serializer) {
        const value = serializer.$prepare$(data.slice(1), containerState, doc);
        if (serializer.$fill$) {
          fillMap.set(value, serializer);
        }
        if (serializer.$subs$) {
          subsMap.set(value, serializer);
        }
        return value;
      }
      return data;
    },
    subs(obj: any, subs: Subscriptions[]) {
      const serializer = subsMap.get(obj);
      if (serializer) {
        serializer.$subs$!(obj, subs, containerState);
        return true;
      }
      return false;
    },
    fill(obj: any, getObject: GetObject) {
      const serializer = fillMap.get(obj);
      if (serializer) {
        serializer.$fill$!(obj, getObject, containerState);
        return true;
      }
      return false;
    },
  };
};

export const OBJECT_TRANSFORMS: Record<string, (obj: any, containerState: ContainerState) => any> =
  {
    '!': (obj: any, containerState: ContainerState) => {
      return containerState.$proxyMap$.get(obj) ?? getOrCreateProxy(obj, containerState);
    },
    '~': (obj: any) => {
      return Promise.resolve(obj);
    },
    _: (obj: any) => {
      return Promise.reject(obj);
    },
  };

const isTreeShakeable = (
  manager: SubscriptionManager,
  target: LocalSubscriptionManager,
  leaks: QwikElement | boolean
) => {
  if (typeof leaks === 'boolean') {
    return leaks;
  }
  const localManager = manager.$groupToManagers$.get(leaks);
  if (localManager && localManager.length > 0) {
    if (localManager.length === 1) {
      return localManager[0] !== target;
    }
    return true;
  }
  return false;
};

const getResolveJSXType = (type: any) => {
  if (type === ':slot') {
    return Slot;
  }
  if (type === ':fragment') {
    return Fragment;
  }
  return type;
};
