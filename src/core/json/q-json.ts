// TODO(misko): need full object parsing /serializing

import { assertDefined } from '../assert/assert';
import { getQObjectId } from '../object/q-object';

export const JSON_OBJ_PREFIX = '\u0010';
export const ATTR_OBJ_PREFIX = '*';

export function qJsonStringify(obj: any, map?: Map<string, any>): string {
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

export function qJsonParse(txt: string, map?: Map<string, any>): any {
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
