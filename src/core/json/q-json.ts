// TODO(misko): need full object parsing /serializing

import { assertDefined } from '../assert/assert';
import { getQObjectId, qObject } from '../object/q-object';
import type { QObjectMap } from '../props/props-obj-map';
import { getProps } from '../props/props.public';
import { AttributeMarker } from '../util/markers';

export const JSON_OBJ_PREFIX = '\u0010';
export const ATTR_OBJ_PREFIX = '*';

export function qJsonStringify(obj: any, map?: QObjectMap): string {
  if (obj == undefined) return String(obj);
  if (typeof obj == 'number') return String(obj);
  if (typeof obj == 'boolean') return String(obj);
  const id = getQObjectId(obj);
  if (id) {
    map && map.set(id, obj);
    return ATTR_OBJ_PREFIX + id;
  }
  if (typeof obj == 'string') {
    const ch = obj.charCodeAt(0);
    if (isDash(ch) || isDigit(ch) || isObj(ch) || isReserved(obj) || containsEscape(obj)) {
      return "'" + obj.replace(/'/g, "\\'").replace(/\//g, '\\') + "'";
    }
    return obj;
  }

  return JSON.stringify(obj, function (this: any, key: string, value: any) {
    const id = getQObjectId(value)!;
    if (id) {
      assertDefined(map);
      map && map.set(id, value);
      return JSON_OBJ_PREFIX + id;
    }
    return value;
  });
}

export function qJsonParse(txt: string, map?: QObjectMap): any {
  if (txt == '') return '';
  if (txt == 'null') return null;
  if (txt == 'undefined') return undefined;
  if (txt == 'false') return false;
  if (txt == 'true') return true;
  const ch = txt.charCodeAt(0);
  if (isDigit(ch) || isDash(ch)) {
    return Number(txt);
  }
  if (isAttrObj(ch)) {
    const id = txt.substr(1); // QObject ID;
    if (!map) {
      // TODO(misko): better error / test
      throw new Error('Map needs to be present when parsing QObjects');
    }
    const obj = map.get(id);
    assertDefined(obj);
    return obj;
  }
  if (isQuote(ch)) {
    return txt.substring(1, txt.length - 1).replace(/\\(.)/, (v) => v);
  }
  if (isObj(ch)) {
    return JSON.parse(txt, function (this: any, key: string, value: any) {
      if (typeof value == 'string' && isJsonObj(value.charCodeAt(0))) {
        if (!map) {
          // TODO(misko): better error / test
          throw new Error('Map needs to be present when parsing QObjects');
        }
        value = map.get(value.substr(1));
        assertDefined(value);
      }
      return value;
    });
  }
  return txt;
}

export function qDeflate(obj: any, map: QObjectMap): any {
  if (obj && typeof obj === 'object') {
    let id = getQObjectId(obj);
    if (!id) {
      obj = qObject(obj);
      id = getQObjectId(obj)!;
    }
    map.set(id, obj);
    return JSON_OBJ_PREFIX + id;
  }
  return obj;
}

export function qInflate(obj: any, map: QObjectMap): any {
  if (typeof obj === 'string' && obj.charAt(0) === JSON_OBJ_PREFIX) {
    const prefix = obj.charAt(1);
    if (
      prefix == AttributeMarker.ELEMENT_ID_PREFIX ||
      prefix == AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX
    ) {
      const id = obj.substring(2);
      const selector = AttributeMarker.ELEMENT_ID_SELECTOR.replace('{}', id);
      const element = map.element;
      const ourElement =
        element.closest(selector) ||
        element.querySelector(selector) ||
        element.ownerDocument.querySelector(selector);
      if (!ourElement) {
        // TODO(misko): centralize
        throw new Error(`Q-ERROR: Element with '${selector}' can not be located.`);
      }
      return prefix == AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX
        ? getProps(ourElement)
        : ourElement;
    } else {
      const id = obj.substring(1);
      const ref = map.get(id);
      if (!ref) {
        // TODO(misko): centralize
        throw new Error(`Q-ERROR: Unable to located object with id '${id}'.`);
      }
      return ref;
    }
  }
  return obj;
}

function isDash(ch: number) {
  return ch == '-'.charCodeAt(0);
}

function isObj(ch: number) {
  return ch == '['.charCodeAt(0) || ch == '{'.charCodeAt(0);
}

function isQuote(ch: number) {
  return ch == "'".charCodeAt(0);
}

function isDigit(ch: number) {
  return '0'.charCodeAt(0) <= ch && ch <= '9'.charCodeAt(0);
}
export function isAttrObj(ch: number) {
  return ch == ATTR_OBJ_PREFIX.charCodeAt(0);
}
export function isJsonObj(ch: number) {
  return ch == JSON_OBJ_PREFIX.charCodeAt(0);
}
function isReserved(obj: string): boolean {
  return obj === 'null' || obj === 'undefined' || obj == 'true' || obj == 'false';
}
function containsEscape(obj: string): boolean {
  return obj.indexOf("'") != -1 || obj.indexOf('\\') != -1;
}
