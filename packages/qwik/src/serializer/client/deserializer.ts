import { isDev } from '../../build/index.dev';
import { componentQrl } from '../../core/component/component.public';
import { assertDefined } from '../../core/error/assert';
import { createQRL } from '../../core/qrl/qrl-class';
import type { QRL } from '../../core/qrl/qrl.public';
import { QRL_RUNTIME_CHUNK, SerializationConstant } from '../shared-types';
import type { QContainer } from './api';

const objMap = new WeakMap<any, any>();

const unwrapDeserializerProxy = (value: any) => {
  const unwrapped: object = typeof value === 'object' && value !== null && value[UNWRAP_PROXY];
  return unwrapped ? unwrapped : value;
};

export const isDeserializerProxy = (value: any) => {
  return typeof value === 'object' && value !== null && UNWRAP_PROXY in value;
};

/**
 * When serializing the object we need check if it is URL, RegExp, Map, Set, etc. This is time
 * consuming. So if we could know that this is a basic object literal we could skip the check, and
 * only run the checks for objects which are not object literals.
 *
 * So this function is here for performance to short circuit many checks later.
 *
 * @param obj
 */
function isObjectLiteral(obj: any) {
  // We are an object literal if:
  // - we are a direct instance of object OR
  // - we are an array
  // In all other cases it is a subclass which requires more checks.
  return Object.getPrototypeOf(obj) === Object.prototype || Array.isArray(obj);
}

const UNWRAP_PROXY = Symbol('UNWRAP_PROXY');
const wrapDeserializerProxy = (container: QContainer, value: any) => {
  if (
    typeof value === 'object' && // Must be an object
    value !== null && // which is not null
    isObjectLiteral(value) // and is object literal (not URL, Data, etc.)
  ) {
    if (isDeserializerProxy(value)) {
      // already wrapped
      return value;
    } else {
      let proxy = objMap.get(value);
      if (!proxy) {
        proxy = new Proxy(value, {
          get(target, property, receiver) {
            if (property === UNWRAP_PROXY) {
              return target;
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
        objMap.set(value, proxy);
      }
      return proxy;
    }
  }
  return value;
};

export const deserialize = <T>(container: QContainer, value: any): any => {
  if (typeof value === 'object' && value !== null) {
    return wrapDeserializerProxy(container, value);
  } else if (typeof value === 'string' && value.length) {
    const code = value.charCodeAt(0);
    const rest = value.substring(1);
    switch (code) {
      case SerializationConstant.REFERENCE_VALUE:
        const ref = parseInt(rest);
        return container.getObjectById(ref);
      case SerializationConstant.UNDEFINED_VALUE:
        return undefined;
      case SerializationConstant.QRL_VALUE:
        return parseQRL(container, rest);
      case SerializationConstant.Task_VALUE:
      case SerializationConstant.Resource_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.URL_VALUE:
        return new URL(rest);
      case SerializationConstant.Date_VALUE:
        return new Date(rest);
      case SerializationConstant.Regex_VALUE:
        const idx = rest.lastIndexOf('/');
        return new RegExp(rest.substring(1, idx), rest.substring(idx + 1));
      case SerializationConstant.Error_VALUE:
        const obj = container.getObjectById(parseInt(rest));
        return Object.assign(new Error(rest), obj);
      case SerializationConstant.Document_VALUE:
        return container.element.ownerDocument;
      case SerializationConstant.Component_VALUE:
        return componentQrl(parseQRL(container, rest) as any);
      case SerializationConstant.DerivedSignal_VALUE:
      case SerializationConstant.Signal_VALUE:
      case SerializationConstant.SignalWrapper_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.NaN_VALUE:
        return Number.NaN;
      case SerializationConstant.URLSearchParams_VALUE:
        return new URLSearchParams(rest);
      case SerializationConstant.FormData_VALUE:
      case SerializationConstant.JSXNode_VALUE:
        throw new Error('Not implemented');
      case SerializationConstant.BigInt_VALUE:
        return BigInt(rest);
      case SerializationConstant.Set_VALUE:
        return new Set(container.getObjectById(parseInt(rest)));
      case SerializationConstant.Map_VALUE:
        return new Map(container.getObjectById(parseInt(rest)));
      case SerializationConstant.String_VALUE:
        return rest;
      default:
    }
  }
  return value;
};

function parseQRL(container: QContainer, rest: string): QRL<any> {
  const hashIdx = rest.indexOf('#');
  const captureStart = rest.indexOf('[', hashIdx);
  const captureEnd = rest.indexOf(']', captureStart);
  const chunk = hashIdx > -1 ? rest.substring(0, hashIdx) : rest;
  const symbol =
    captureStart > -1 ? rest.substring(hashIdx + 1, captureStart) : rest.substring(hashIdx + 1);
  let qrlRef = null;
  const captureIds =
    captureStart > -1 && captureEnd > -1
      ? rest
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
