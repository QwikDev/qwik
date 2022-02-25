// TODO(misko): need full object parsing /serializing

import { intToStr, strToInt } from '../object/store';
import type { QContext } from '../props/props';
import { ELEMENT_ID_PREFIX } from '../util/markers';

export const JSON_OBJ_PREFIX = '\u0010';
export const ATTR_OBJ_PREFIX = '*';

export function qDeflate(obj: any, hostCtx: QContext): number {
  return hostCtx.refMap.add(obj);
}

export function qInflate(ref: number, hostCtx: QContext): any {
  const obj = hostCtx.refMap.get(ref);
  if (!obj) {
    // TODO(misko): centralize
    throw new Error(`Q-ERROR: Unable to located object with id '${ref}'.`);
  }
  return obj;
}

export function isAttrObj(ch: number) {
  return ch == ATTR_OBJ_PREFIX.charCodeAt(0);
}
export function isJsonObj(ch: number) {
  return ch == JSON_OBJ_PREFIX.charCodeAt(0);
}
