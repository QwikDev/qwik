import { assertEqual } from '../assert/assert';
import { QError, qError } from '../error/error';
import { parseQRL } from '../import/qrl';
import { QRL, $ } from '../import/qrl.public';
import { qJsonParse, qJsonStringify } from '../json/q-json';
import { getQObjectId, QObjectIdSymbol, wrap } from '../object/q-object';
import { QStore_hydrate } from '../object/store';
import { fromCamelToKebabCase } from '../util/case';
import { EMPTY_ARRAY } from '../util/flyweight';
import { AttributeMarker } from '../util/markers';
import {
  newQObjectMap,
  loadObjectsFromState,
  QObjRefMap,
  QObjectMap,
  updateSubscriptions,
} from './props-obj-map';
import { qPropWriteQRL, qPropReadQRL, isOnProp, isOn$Prop } from './props-on';
import { getProps, Props } from './props.public';

Error.stackTraceLimit = 9999;

// TODO(misko): For better debugger experience the getProps should never store Proxy, always naked objects to make it easier to traverse in the debugger.

const Q_IS_HYDRATED = '__isHydrated__';
export const Q_PROP = 'getProps';

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
  __self__: Props;
  __element__: Element;
  __qRefs__: QObjRefMap;
  __qMap__: QObjectMap;
  __mutation__: boolean;
}

export const Q_MAP = '__qMap__';
const Q_OBJECT_ATTR_SELECTOR = '[q\\:obj]';

const QProps_ = class QProps {
  public __mutation__: boolean = false;
  public __self__: QProps = null!;
  constructor(
    public __element__: Element,
    public __qRefs__: QObjRefMap,
    public __qMap__: QObjectMap
  ) {}
};

export function newQProps(element: Element): Props {
  const qObjRefMap: QObjRefMap = new Map();
  const qObjMap: QObjectMap = newQObjectMap(element, qObjRefMap);
  const cache: QPropsContext & Record<string | symbol, any> = new QProps_(
    element,
    qObjRefMap,
    qObjMap
  );

  return ((element as any)[Q_PROP] = cache.__self__ =
    new Proxy(cache, {
      get: (target: QPropsContext & Record<string | symbol, any>, prop) => {
        if (typeof prop == 'string') {
          if (prop === '__mutation__') {
            const mutation = target.__mutation__;
            target.__mutation__ = false;
            return mutation;
          } else if (prop === '__qMap__') {
            return target.__qMap__;
          } else if (prop == '__parent__') {
            const parent = element.parentElement;
            return parent && getProps(parent);
          } else if (isOnProp(prop)) {
            return qPropReadQRL(cache, qObjMap, prop);
          } else if (prop === QObjectIdSymbol) {
            const id = getQObjectId(element)!;
            assertEqual(id.charAt(0), AttributeMarker.ELEMENT_ID_PREFIX);
            return AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX + id.substring(1);
          }

          if (prop in cache) {
            return target[prop];
          }

          return (cache[prop] = readAttribute(element, qObjMap, prop));
        }
      },
      set: (target: QPropsContext & Record<string | symbol, any>, prop, value) => {
        if (typeof prop == 'string') {
          if (prop === 'children') return true;
          if (isOnProp(prop)) {
            qPropWriteQRL(cache, qObjMap, prop, value);
          } else if (isOn$Prop(prop)) {
            qPropWriteQRL(cache, qObjMap, prop.replace('$', ''), $(value));
          } else if (prop === ':subscriptions') {
            updateSubscriptions(element, qObjRefMap, value as Set<object>);
          } else {
            value = wrap(value);
            const existingValue =
              prop in target
                ? target[prop]
                : (target[prop] = readAttribute(element, qObjMap, prop));
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

export function test_clearPropsCache(element: Element) {
  (element as any)[Q_PROP] = undefined;
}

function readAttribute(element: Element, map: QObjectMap, propName: string): any {
  if (isOnProp(propName)) {
    const attrName = fromCamelToKebabCase(propName.split(':')[1]);
    const attrValue = element.getAttribute(attrName);
    const listeners: QRL[] = [];
    attrValue?.split('\n').forEach((qrl) => {
      listeners.push(parseQRL(qrl));
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

function writeAttribute(element: Element, map: QObjectMap, propName: string, value: any): void {
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

export function didQPropsChange(getProps: Props) {
  return (getProps as QPropsContext).__mutation__;
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
