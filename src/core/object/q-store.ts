import { assertDefined } from '../assert/assert';
import { JSON_OBJ_PREFIX } from '../json/q-json';
import { qDev } from '../util/qdev';
import { clearQProps, clearQPropsMap, QPropsContext } from '../props/q-props';
import { getQObjectId, _restoreQObject } from './q-object';
import { qProps } from '../props/q-props.public';

export interface Store {
  doc: Document;
  objs: Record<string, any>;
}

export function QStore_hydrate(doc: Document): Record<string, object> | null {
  const script = doc.querySelector('script[type="qwik/json"]');
  let map: Record<string, object> | null = null;
  (doc as any).qDehydrate = () => QStore_dehydrate(doc);
  if (script) {
    script.parentElement!.removeChild(script);
    map = JSON.parse(script.textContent || '{}');
    reviveQObjects(map);
    reviveNestedQObjects(map, map!);
  }
  return map;
}

/**
 * Serialize the current state of the application into DOM
 *
 * @param doc
 */
export function QStore_dehydrate(doc: Document) {
  const map: Record<string, any> = {};
  // Find all Elements which have qObjects attached to them
  doc.querySelectorAll('[q\\:obj]').forEach((node) => {
    const props = qProps(node) as QPropsContext;
    const qMap = props.__qRefs__;
    clearQProps(node);
    assertDefined(qMap);
    qMap.forEach((v, k) => {
      map[k] = v.obj;
      collectQObjects(v, new Set(), (k, v) => (map[k] = v));
    });
  });
  // Serialize
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = JSON.stringify(
    map,
    function (this: any, key: string, value: any) {
      if (this === map) return value;
      if (key.startsWith('__')) return undefined;
      const id = getQObjectId(value);
      if (id) return JSON_OBJ_PREFIX + id;
      return value;
    },
    qDev ? '  ' : undefined
  );
  doc.body.appendChild(script);
  clearQPropsMap(doc);
}

function reviveQObjects(map: Record<string, object> | null) {
  for (const key in map) {
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      const value = map[key];
      map[key] = _restoreQObject(value, key);
    }
  }
}

function reviveNestedQObjects(obj: any, map: Record<string, any>) {
  if (obj && typeof obj == 'object') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
          obj[i] = map[value.substring(JSON_OBJ_PREFIX.length)];
        } else {
          reviveNestedQObjects(value, map);
        }
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
            obj[key] = map[value.substring(JSON_OBJ_PREFIX.length)];
          } else {
            reviveNestedQObjects(value, map);
          }
        }
      }
    }
  }
}

function collectQObjects(obj: any, seen: Set<any>, foundFn: (key: string, obj: any) => void) {
  if (obj && typeof obj == 'object') {
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        collectQObjects(obj[i], seen, foundFn);
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          const id = getQObjectId(value);
          if (id) foundFn(id, value);
          collectQObjects(value, seen, foundFn);
        }
      }
    }
  }
}
