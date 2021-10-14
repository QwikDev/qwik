import { qImport } from '../import/qImport';
import { assertDefined, assertEqual } from '../assert/assert';
import { qJsonParse, qJsonStringify } from '../json/q-json';
import { ParsedQRL, parseQRL, stringifyQRL } from '../import/qrl';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { getQObjectId, Q_OBJECT_PREFIX_SEP, wrap } from '../object/q-object';
import { QStore_hydrate } from '../object/q-store';
import { QError, qError } from '../error/error';
import {
  createMapFacade,
  loadObjectsFromState,
  QObjRefMap,
  updateSubscriptions,
} from './q-props-obj-map';
import { qProps, QProps } from './q-props.public';

// TODO(misko): For better debugger experience the qProps should never store Proxy, always naked objects to make it easier to traverse in the debugger.

const Q_IS_HYDRATED = '__isHydrated__';
export const Q_PROP = 'qProps';

export function hydrateIfNeeded(element: Element): void {
  const doc = element.ownerDocument!;
  const isHydrated = (doc as any)[Q_IS_HYDRATED];
  if (!isHydrated) {
    (doc as any)[Q_IS_HYDRATED] = true;
    const map = QStore_hydrate(element.ownerDocument);

    if (map) {
      doc.querySelectorAll(Q_OBJECT_ATTR_SELECTOR).forEach((element) => {
        loadObjectsFromState(element, map);
      });
    }
  }
}

export function clearQPropsMap(doc: Document) {
  (doc as any)[Q_IS_HYDRATED] = undefined;
}

export function clearQProps(element: Element) {
  (element as any)[Q_PROP] = undefined;
}

export interface QPropsContext {
  __element__: Element;
  __qRefs__: QObjRefMap;
  __qMap__: Map<string, object>;
  __mutation__: boolean;
}
const Q_OBJECT_ATTR_SELECTOR = '[q\\:obj]';
const STATE_PREFIX = 'state:';
const ON_PREFIX = 'on:';

export function newQProps(element: Element): QProps {
  const qObjRefMap: QObjRefMap = new Map();
  const qObjMap: Map<string, object> = createMapFacade(element, qObjRefMap);
  const cache: QPropsContext & Record<string | symbol, any> = {
    __element__: element,
    __qRefs__: qObjRefMap,
    __qMap__: qObjMap,
    __mutation__: false,
  };
  return ((element as any)[Q_PROP] = new Proxy(cache, {
    get: (target: QPropsContext & Record<string | symbol, any>, prop) => {
      if (typeof prop == 'string') {
        if (prop === '__mutation__') {
          const mutation = target.__mutation__;
          target.__mutation__ = false;
          return mutation;
        } else if (prop == '__parent__') {
          const parent = element.parentElement;
          return parent && qProps(parent);
        } else if (prop.startsWith(ON_PREFIX)) {
          return createInvokeFn(cache, qObjMap, prop);
        }

        if (prop in cache) {
          return target[prop];
        }

        if (prop.startsWith(STATE_PREFIX)) {
          return (cache[prop] = findState(qObjMap, prop.substr(STATE_PREFIX.length)));
        } else {
          return (cache[prop] = readAttribute(element, qObjMap, prop));
        }
      }
    },
    set: (target: QPropsContext & Record<string | symbol, any>, prop, value) => {
      if (typeof prop == 'string') {
        if (prop === 'children') return true;
        if (prop.startsWith(STATE_PREFIX)) {
          const id = getQObjectId(value)!;
          assertDefined(id);
          assertEqual(id.startsWith(prop.substr(STATE_PREFIX.length)), true);
          qObjMap.set(id, (target[prop] = value));
        } else if (prop.startsWith(ON_PREFIX)) {
          addQrlListener(cache, qObjMap, prop, value);
        } else if (prop === ':subscriptions') {
          updateSubscriptions(element, qObjRefMap, value as Set<object>);
        } else {
          value = wrap(value);
          const existingValue =
            prop in target ? target[prop] : (target[prop] = readAttribute(element, qObjMap, prop));
          /**
          const qObjs = diff(existingValue, value);
          if (qObjs) {
            qObjs.forEach((id) => qObjMap.set(id, null!));
            writeAttribute(element, qObjMap, prop, (target[prop] = value));
            target.__mutation__ = true;
          }
          */
          if (value !== existingValue) {
            const existingId = getQObjectId(existingValue);
            existingId && qObjMap.set(existingId, null!);
            writeAttribute(element, qObjMap, prop, (target[prop] = value));
            target.__mutation__ = true;
          }
        }
        return true;
      } else {
        // TODO(misko): Better error/test
        throw new Error('Only string keys are supported');
      }
    },
  }));
}

export function test_clearqPropsCache(element: Element) {
  (element as any)[Q_PROP] = undefined;
}

function readAttribute(element: Element, map: Map<string, object>, propName: string): any {
  if (propName.startsWith(ON_PREFIX)) {
    const attrName = fromCamelToKebabCase(propName.substr(3));
    const attrValue = element.getAttribute(attrName);
    const listeners: ParsedQRL[] = [];
    attrValue?.split('\n').forEach((qrl) => {
      listeners.push(parseQRL(qrl, map));
    });
    return listeners;
  } else {
    const attrName = fromCamelToKebabCase(propName);
    const attrValue = element.getAttribute(attrName);
    if (attrValue === null) {
      return undefined;
    } else {
      return qJsonParse(attrValue, map);
    }
  }
}

function writeAttribute(
  element: Element,
  map: Map<string, object>,
  propName: string,
  value: any
): void {
  const attrName = fromCamelToKebabCase(propName);
  if (propName == 'class') {
    element.setAttribute('class', stringifyClassOrStyle(value, true));
  } else if (propName == 'style') {
    element.setAttribute('style', stringifyClassOrStyle(value, false));
  } else if (propName === 'innerHTML' || propName === 'innerText') {
    element.setAttribute(attrName, '');
    (element as any)[propName] = value;
  } else {
    const newValue = qJsonStringify(value, map);
    if (value === undefined) {
      element.removeAttribute(attrName);
    } else {
      element.setAttribute(attrName, newValue);
    }
  }
  if ((propName == 'value' || propName == 'checked') && element.tagName === 'INPUT') {
    // INPUT properties `value` and `checked` are special because they can go out of sync
    // between the attribute and what the user entered, so they have special treatment.
    (element as any)[propName] = value;
  }
}

/**
 * Returns `null` if the two objects are equivalent.
 * Returns an `Array` if the objects are different. The array
 * contains a list of `object` ids which are contained in `existing`.
 */
export function diff(existing: any, actual: any): string[] | null {
  if (existing === actual) return null;
  if (existing != null && typeof existing == 'object') {
    const existingId = getQObjectId(existing);
    if (existingId) {
      return [existingId];
    }
    let diffs: string[] | null = null;
    for (const key in existing) {
      if (Object.prototype.hasOwnProperty.call(existing, key)) {
        const value = existing[key];
        const childDiff = diff(value, actual && typeof actual == 'object' && actual[key]);
        if (childDiff && childDiff !== diffs) {
          diffs = diffs === null ? childDiff : diffs.concat(childDiff);
        }
      }
    }
    return diffs;
  }
  return EMPTY_ARRAY;
}

function findState(
  map: Map<string, object | { obj: object; count: number }>,
  stateName: string
): any {
  let state: any = null;
  stateName += Q_OBJECT_PREFIX_SEP;
  map.forEach((v, k) => {
    if (k.startsWith(stateName)) {
      state = v;
    }
  });
  return state;
}

function addQrlListener(
  cache: QPropsContext & Record<string | symbol, any>,
  map: Map<string, any>,
  prop: string,
  value: any
) {
  if (!value) return;
  if (typeof value == 'string' || value instanceof String) {
    value = parseQRL(value as any, undefined /** Don't expect objects in strings */);
  }
  if (value instanceof ParsedQRL) {
    const existingQRLs = getExistingQRLs(cache, map, prop);
    let found = false;
    for (let index = 0; index < existingQRLs.length; index++) {
      const existingQRL = existingQRLs[index];
      if (isSameHandler(existingQRL, value)) {
        found = true;
        replaceQRL(existingQRLs, map, index, value);
        break;
      }
    }
    if (!found) {
      replaceQRL(existingQRLs, map, existingQRLs.length, value);
    }
    const kababProp = ON_PREFIX + fromCamelToKebabCase(prop.substr(ON_PREFIX.length));
    cache.__element__.setAttribute(kababProp, serializeQRLs(existingQRLs));
  } else {
    // TODO(misko): Test/better text
    throw new Error(`Not QRL: prop: ${prop}; value: ` + value);
  }
}

function getExistingQRLs(
  cache: QPropsContext & Record<string | symbol, any>,
  map: Map<string, any>,
  prop: string
): ParsedQRL[] {
  if (prop in cache) return cache[prop];
  const kababProp = ON_PREFIX + fromCamelToKebabCase(prop.substr(ON_PREFIX.length));
  const parts: ParsedQRL[] = [];
  (cache.__element__.getAttribute(kababProp) || '').split('\n').forEach((qrl) => {
    if (qrl) {
      parts.push(parseQRL(qrl as any, map));
    }
  });
  return (cache[prop] = parts);
}

function isSameHandler(existing: ParsedQRL<any>, actual: ParsedQRL<any>) {
  return (
    existing.url == actual.url &&
    existing.symbol == actual.symbol &&
    existing.getState() == actual.getState()
  );
}

function serializeQRLs(existingQRLs: ParsedQRL<any>[]): string {
  return existingQRLs
    .map((qrl) => {
      assertDefined(qrl._serialized);
      return qrl._serialized;
    })
    .join('\n');
}

function replaceQRL(
  existingQRLs: ParsedQRL<any>[],
  map: Map<string, any>,
  index: number,
  newQrl: ParsedQRL<any>
) {
  const existing = index < existingQRLs.length ? existingQRLs[index] : null;
  if (existing && Array.isArray(existing._serialized)) {
    existing._serialized.forEach((key, index) => {
      if (index) {
        // need to skip the first one.
        map.set(key, null);
      }
    });
  }
  stringifyQRL(newQrl, map);
  existingQRLs[index] = newQrl;
}
function createInvokeFn(
  cache: QPropsContext & Record<string | symbol, any>,
  map: Map<string, any>,
  prop: string
): ((event: Event) => Promise<any[]>) | null {
  const existingQRLs = getExistingQRLs(cache, map, prop);
  if (existingQRLs.length === 0) return null;
  return (event: Event) => {
    return Promise.all(
      existingQRLs.map(async (qrl) => {
        const fn: EventHandler = await qImport(cache.__element__, qrl);
        const element = cache.__element__;
        const qrlString = Array.isArray(qrl._serialized) ? qrl._serialized[0] : qrl._serialized!;
        const url = new URL(qrlString, element.ownerDocument.baseURI);
        return { state: qrl.getState(), value: await fn(element, event, url) } as OnHookReturn;
      })
    );
  };
}

interface EventHandler {
  (element: Element, event: Event, url: URL): any;
}

export function didQPropsChange(qProps: QProps) {
  return (qProps as QPropsContext).__mutation__;
}

export interface OnHookReturn<T = any> {
  state: string;
  value: T;
}

/**
 * Turn an `Array` or object literal into a `class` or `style`
 *
 * @param obj `string`, `Array` or object literal
 * @param isClass `true` if expecting `class` output
 * @returns `string`
 */
export function stringifyClassOrStyle(obj: any, isClass: boolean): string {
  if (obj == null) return '';
  if (typeof obj == 'object') {
    let text = '';
    let sep = '';
    if (Array.isArray(obj)) {
      if (!isClass) {
        throw qError(QError.Render_unsupportedFormat_obj_attr, obj, 'style');
      }
      for (let i = 0; i < obj.length; i++) {
        text += sep + obj[i];
        sep = ' ';
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          text += isClass ? (value ? sep + key : '') : sep + key + ':' + value;
          sep = isClass ? ' ' : ';';
        }
      }
    }
    return text;
  }
  return String(obj);
}
