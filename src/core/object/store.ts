import { JSON_OBJ_PREFIX } from '../json/q-json';
import { clearQPropsMap, getContext } from '../props/props';
import { qDev } from '../util/qdev';
import { _restoreQObject } from './q-object';

export interface Store {
  doc: Document;
  objs: Record<string, any>;
}

export function QStore_hydrate(doc: Document) {
  const script = doc.querySelector('script[type="qwik/json"]');
  (doc as any).qDehydrate = () => QStore_dehydrate(doc);
  if (script) {
    script.parentElement!.removeChild(script);
    const meta = JSON.parse(script.textContent || '{}') as any;
    const elements = new Map<string, Element>();
    doc.querySelectorAll('[q\\:id]').forEach((el) => {
      const id = el.getAttribute('q:id')!;
      elements.set('#' + id, el);
    });

    reviveQObjects(meta.objs, meta.subs, elements);
    reviveNestedQObjects(meta.objs, meta.objs);

    doc.querySelectorAll('[q\\:obj]').forEach((el) => {
      const qobj = el.getAttribute('q:obj');
      const ctx = getContext(el);
      qobj!.split(' ').forEach((part) => {
        const obj = meta.objs[parseInt(part, 10)];
        ctx.refMap.add(obj);
      });
    });
  }
}

/**
 * Serialize the current state of the application into DOM
 *
 * @param doc
 */
export function QStore_dehydrate(doc: Document) {
  const objSet = new Set<any>();

  // Find all Elements which have qObjects attached to them
  const elements = doc.querySelectorAll('[q\\:obj]');
  elements.forEach((node) => {
    const props = getContext(node);
    const qMap = props.refMap;
    qMap.array.forEach((v) => {
      collectQObjects(v, objSet);
    });
  });

  // Convert objSet to array
  const objArray = Array.from(objSet);
  objArray.sort((a, b) => {
    const isProxyA = a[':target:'] !== undefined ? 0 : 1;
    const isProxyB = b[':target:'] !== undefined ? 0 : 1;
    return isProxyA - isProxyB;
  });

  const objs = objArray.map((a) => {
    return a[':target:'] ?? a;
  });

  const elementToIndex = new Map<Element, string>();

  const subs = objArray
    .map((a) => {
      const subs = a[':subs:'] as Map<Element, Set<string>>;
      if (subs) {
        return Object.fromEntries(
          Array.from(subs.entries()).map(([el, set]) => {
            if (el.isConnected) {
              let id = elementToIndex.get(el);
              if (id === undefined) {
                id = `${elementToIndex.size}`;
                el.setAttribute('q:id', id);
                id = '#' + id;
                elementToIndex.set(el, id);
              }
              return [id, Array.from(set)];
            } else {
              return [undefined, undefined];
            }
          })
        );
      } else {
        return null;
      }
    })
    .filter((a) => !!a);

  const objToId = new Map<any, number>();
  let count = 0;
  for (const obj of objs) {
    objToId.set(obj, count);
    count++;
  }

  const data = {
    objs,
    subs,
  };

  // Write back to the dom
  elements.forEach((node) => {
    const props = getContext(node);
    const attribute = props.refMap.array.map((obj) => objToId.get(obj[':target:'])).join(' ');
    node.setAttribute('q:obj', attribute);
  });

  // Serialize
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = JSON.stringify(
    data,
    function (this: any, key: string, value: any) {
      if (key.startsWith('__')) return undefined;
      if (this === objs) return value;

      const id = objToId.get(value);
      if (id !== undefined) {
        return JSON_OBJ_PREFIX + id;
      }
      return elementToIndex.get(value) ?? value;
    },
    qDev ? '  ' : undefined
  );

  doc.body.appendChild(script);
  clearQPropsMap(doc);
}

function reviveQObjects(objs: object[], subs: any[], elementMap: Map<string, Element>) {
  for (let i = 0; i < objs.length; i++) {
    const sub = subs[i];
    if (sub) {
      const value = objs[i];
      const converted = new Map(
        Object.entries(sub).map((entry) => {
          const el = elementMap.get(entry[0])!;
          const set = new Set(entry[1] as any) as Set<string>;
          return [el, set];
        })
      );
      objs[i] = _restoreQObject(value, converted);
    }
  }
}

function reviveNestedQObjects(obj: any, map: object[]) {
  if (obj && typeof obj == 'object') {
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
          obj[i] = map[parseInt(value.slice(JSON_OBJ_PREFIX.length), 10)];
        } else {
          reviveNestedQObjects(value, map);
        }
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value == 'string' && value.startsWith(JSON_OBJ_PREFIX)) {
            obj[key] = map[parseInt(value.slice(JSON_OBJ_PREFIX.length), 10)];
          } else {
            reviveNestedQObjects(value, map);
          }
        }
      }
    }
  }
}

function collectQObjects(obj: any, seen: Set<any>) {
  if (obj && typeof obj == 'object') {
    if (seen.has(obj)) return;
    seen.add(obj);
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        collectQObjects(obj[i], seen);
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          collectQObjects(value, seen);
        }
      }
    }
  }
}
