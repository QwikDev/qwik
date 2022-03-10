import { assertDefined } from '../assert/assert';
import { getContext } from '../props/props';
import { isElement } from '../util/element';
import {
  ELEMENT_ID,
  ELEMENT_ID_PREFIX,
  ELEMENT_ID_SELECTOR,
  QHostAttr,
  QObjAttr,
  QObjSelector,
} from '../util/markers';
import { qDev } from '../util/qdev';
import { QOjectSubsSymbol, QOjectTargetSymbol, _restoreQObject } from './q-object';

export interface Store {
  doc: Document;
  objs: Record<string, any>;
}

export const JSON_OBJ_PREFIX = '\u0010';

export function QStore_hydrate(doc: Document) {
  const script = doc.querySelector('script[type="qwik/json"]');
  (doc as any).qDehydrate = () => QStore_dehydrate(doc);
  if (script) {
    script.parentElement!.removeChild(script);
    const meta = JSON.parse(script.textContent || '{}') as any;
    const elements = new Map<string, Element>();
    doc.querySelectorAll(ELEMENT_ID_SELECTOR).forEach((el) => {
      const id = el.getAttribute(ELEMENT_ID)!;
      elements.set(ELEMENT_ID_PREFIX + id, el);
    });
    for (const obj of meta.objs) {
      reviveNestedQObjects(obj, meta.objs);
    }
    reviveQObjects(meta.objs, meta.subs, elements);

    doc.querySelectorAll(QObjSelector).forEach((el) => {
      const qobj = el.getAttribute(QObjAttr);
      const host = el.getAttribute(QHostAttr);
      const ctx = getContext(el);
      qobj!.split(' ').forEach((part) => {
        const obj = part[0] === ELEMENT_ID_PREFIX ? elements.get(part) : meta.objs[strToInt(part)];
        assertDefined(obj);
        ctx.refMap.add(obj);
      });
      if (host) {
        const [props, events] = host.split(' ').map(strToInt);
        assertDefined(props);
        assertDefined(events);
        ctx.props = ctx.refMap.get(props);
        ctx.events = ctx.refMap.get(events);
      }
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

  // Element to index
  const elementToIndex = new Map<Element, string>();
  function getElementID(el: Element) {
    let id = elementToIndex.get(el);
    if (id === undefined) {
      id = intToStr(elementToIndex.size);
      el.setAttribute(ELEMENT_ID, id);
      id = ELEMENT_ID_PREFIX + id;
      elementToIndex.set(el, id);
    }
    return id;
  }
  // Find all Elements which have qObjects attached to them
  const elements = doc.querySelectorAll(QObjSelector);
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
    const isProxyA = a[QOjectTargetSymbol] !== undefined ? 0 : 1;
    const isProxyB = b[QOjectTargetSymbol] !== undefined ? 0 : 1;
    return isProxyA - isProxyB;
  });

  const objs = objArray.map((a) => {
    return a[QOjectTargetSymbol] ?? a;
  });

  const subs = objArray
    .map((a) => {
      const subs = a[QOjectSubsSymbol] as Map<Element, Set<string>>;
      if (subs) {
        return Object.fromEntries(
          Array.from(subs.entries()).map(([el, set]) => {
            if (el.isConnected) {
              const id = getElementID(el);
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

  const convert = (value: any) => {
    if (value && typeof value === 'object') {
      value = value[QOjectTargetSymbol] ?? value;
    }
    const idx = objToId.get(value);
    if (idx !== undefined) {
      return intToStr(idx);
    }
    return elementToIndex.get(value) ?? value;
  };

  const convertedObjs = objs.map((obj) => {
    if (Array.isArray(obj)) {
      return obj.map(convert);
    } else if (typeof obj === 'object') {
      const output: Record<string, any> = {};
      Object.entries(obj).forEach(([key, value]) => {
        output[key] = convert(value);
      });
      return output;
    }
    return obj;
  });

  const data = {
    objs: convertedObjs,
    subs,
  };

  // Write back to the dom
  elements.forEach((node) => {
    const ctx = getContext(node);
    const props = ctx.props;
    const events = ctx.events;
    const attribute = ctx.refMap.array
      .map((obj) => {
        if (isElement(obj)) {
          return getElementID(obj);
        }

        const idx =
          typeof obj === 'object' ? objToId.get(obj[QOjectTargetSymbol] ?? obj) : objToId.get(obj);

        assertDefined(idx);
        return intToStr(idx!);
      })
      .join(' ');
    node.setAttribute(QObjAttr, attribute);

    if (props) {
      const objs = [props];
      if (events) {
        objs.push(events);
      }
      node.setAttribute(QHostAttr, objs.map((obj) => ctx.refMap.indexOf(obj)).join(' '));
    }
  });

  // Serialize
  const script = doc.createElement('script');
  script.setAttribute('type', 'qwik/json');
  script.textContent = JSON.stringify(data, undefined, qDev ? '  ' : undefined);

  doc.body.appendChild(script);
}

function reviveQObjects(objs: object[], subs: any[], elementMap: Map<string, Element>) {
  for (let i = 0; i < objs.length; i++) {
    const sub = subs[i];
    if (sub) {
      const value = objs[i];
      const converted = new Map(
        Object.entries(sub).map((entry) => {
          const el = elementMap.get(entry[0])!;
          assertDefined(el);
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
        if (typeof value == 'string') {
          obj[i] = map[strToInt(value)];
        } else {
          reviveNestedQObjects(value, map);
        }
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value == 'string') {
            obj[key] = map[strToInt(value)];
          } else {
            reviveNestedQObjects(value, map);
          }
        }
      }
    }
  }
}

function collectQObjects(obj: any, seen: Set<any>) {
  if (obj != null) {
    if (isElement(obj)) {
      return;
    }
    if (typeof obj === 'boolean') {
      return;
    }

    if (seen.has(obj)) return;
    seen.add(obj);

    if (typeof obj === 'object') {
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
}

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const strToInt = (nu: string) => {
  return parseInt(nu, 36);
};
