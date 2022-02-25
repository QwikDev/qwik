// TODO(misko): need full object parsing /serializing

import { getProps, QContext } from '../props/props';
import type { QObjectMap } from '../props/props-obj-map';
import { AttributeMarker } from '../util/markers';

export const JSON_OBJ_PREFIX = '\u0010';
export const ATTR_OBJ_PREFIX = '*';

export function qDeflate(obj: any, map: QObjectMap): any {
  if (obj && typeof obj === 'object') {
    return JSON_OBJ_PREFIX + map.add(obj);
  }
  return obj;
}

export function qInflate(obj: any, hostCtx: QContext): any {
  if (typeof obj === 'string' && obj.charAt(0) === JSON_OBJ_PREFIX) {
    const prefix = obj.charAt(1);
    if (
      prefix == AttributeMarker.ELEMENT_ID_PREFIX ||
      prefix == AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX
    ) {
      return prefix == AttributeMarker.ELEMENT_ID_Q_PROPS_PREFIX
        ? getProps(hostCtx)
        : hostCtx.element;
    } else {
      const id = obj.substring(1);
      const ref = hostCtx.refMap.get(parseInt(id, 10));
      if (!ref) {
        // TODO(misko): centralize
        throw new Error(`Q-ERROR: Unable to located object with id '${id}'.`);
      }
      return ref;
    }
  }
  return obj;
}

export function isAttrObj(ch: number) {
  return ch == ATTR_OBJ_PREFIX.charCodeAt(0);
}
export function isJsonObj(ch: number) {
  return ch == JSON_OBJ_PREFIX.charCodeAt(0);
}
