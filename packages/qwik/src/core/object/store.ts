import { getPlatform } from '../platform/platform';
import { assertDefined, assertEqual } from '../assert/assert';
import { parseQRL, QRLSerializeOptions, stringifyQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { getContext } from '../props/props';
import { getDocument } from '../util/dom';
import { isNode } from '../util/element';
import { logDebug, logError, logWarn } from '../util/log';
import {
  ELEMENT_ID,
  ELEMENT_ID_PREFIX,
  QContainerAttr,
  QHostAttr,
  QObjAttr,
  QSeqAttr,
} from '../util/markers';
import { qDev } from '../util/qdev';
import {
  getProxyMap,
  isConnected,
  ObjToProxyMap,
  QOjectSubsSymbol,
  QOjectTargetSymbol,
  shouldSerialize,
  SubscriberMap,
  _restoreQObject,
} from './q-object';
import { destroyWatch, isWatchDescriptor, WatchFlags } from '../watch/watch.public';

export interface Store {
  doc: Document;
  objs: Record<string, any>;
}

export type GetObject = (id: string) => any;
export type GetObjID = (obj: any) => string | null;

export const UNDEFINED_PREFIX = '\u0010';
export const QRL_PREFIX = '\u0011';
export const DOCUMENT_PREFIX = '\u0012';

export function resumeContainer(containerEl: Element) {
  if (!isContainer(containerEl)) {
    logWarn('Skipping hydration because parent element is not q:container');
    return;
  }
  const doc = getDocument(containerEl);
  const isDocElement = containerEl === doc.documentElement;
  const parentJSON = isDocElement ? doc.body : containerEl;
  const script = getQwikJSON(parentJSON);
  if (!script) {
    logWarn('Skipping hydration qwik/json metadata was not found.');
    return;
  }
  script.remove();

  const map = getProxyMap(doc);
  const meta = JSON.parse(script.textContent || '{}') as any;

  // Collect all elements
  const elements = new Map<string, Element>();
  getNodesInScope(containerEl, hasQId).forEach((el) => {
    const id = el.getAttribute(ELEMENT_ID)!;
    elements.set(ELEMENT_ID_PREFIX + id, el);
  });

  const getObject: GetObject = (id) => {
    return getObjectImpl(id, elements, meta.objs, map);
  };

  // Revive proxies with subscriptions into the proxymap
  reviveValues(meta.objs, meta.subs, getObject, map, parentJSON);

  // Rebuild target objects
  for (const obj of meta.objs) {
    reviveNestedObjects(obj, getObject);
  }

  // Walk all elements with q:obj and resume their state
  getNodesInScope(containerEl, hasQObj).forEach((el) => {
    const qobj = el.getAttribute(QObjAttr)!;
    const seq = el.getAttribute(QSeqAttr)!;
    const host = el.getAttribute(QHostAttr);
    const ctx = getContext(el);

    // Restore captured objets
    qobj.split(' ').forEach((part) => {
      if (part !== '') {
        const obj = getObject(part);
        ctx.refMap.add(obj);
      } else if (qDev) {
        logError('QObj contains empty ref');
      }
    });

    // Restore sequence scoping
    ctx.seq = seq.split(' ').map((part) => strToInt(part));

    if (host) {
      const [props, renderQrl] = host.split(' ').map(strToInt);
      assertDefined(props);
      assertDefined(renderQrl);
      ctx.props = ctx.refMap.get(props);
      ctx.renderQrl = ctx.refMap.get(renderQrl);
    }
  });
  containerEl.setAttribute(QContainerAttr, 'resumed');
  logDebug('Container resumed');
}

/**
 * @public
 */
export interface SnapshotState {
  objs: any[];
  subs: any[];
}

export function snapshotState(containerEl: Element): SnapshotState {
  const doc = getDocument(containerEl);
  const proxyMap = getProxyMap(doc);
  const objSet = new Set<any>();
  const platform = getPlatform(doc);
  const elementToIndex = new Map<Element, string | null>();

  // Collect all qObjected around the DOM
  const elements = getNodesInScope(containerEl, hasQObj);
  elements.forEach((node) => {
    const ctx = getContext(node);
    const qMap = ctx.refMap;
    qMap.array.forEach((v) => {
      collectValue(v, objSet, doc);
    });
  });

  // Convert objSet to array
  const objs = Array.from(objSet);

  objs.sort((a, b) => {
    const isProxyA = proxyMap.has(a) ? 0 : 1;
    const isProxyB = proxyMap.has(b) ? 0 : 1;
    return isProxyA - isProxyB;
  });

  const objToId = new Map<any, number>();
  let count = 0;
  for (const obj of objs) {
    if (isWatchDescriptor(obj)) {
      destroyWatch(obj);
      if (qDev) {
        if (obj.f & WatchFlags.IsDirty) {
          logWarn('Serializing dirty watch. Looks like an internal error.');
        }
        if (!isConnected(obj)) {
          logWarn('Serializing disconneted watch. Looks like an internal error.');
        }
      }
    }
    objToId.set(obj, count);
    count++;
  }

  function getElementID(el: Element): string | null {
    let id = elementToIndex.get(el);
    if (id === undefined) {
      if (el.isConnected) {
        id = intToStr(elementToIndex.size);
        el.setAttribute(ELEMENT_ID, id);
        id = ELEMENT_ID_PREFIX + id;
      } else {
        id = null;
      }
      elementToIndex.set(el, id);
    }
    return id;
  }

  function getObjId(obj: any): string | null {
    if (obj !== null && typeof obj === 'object') {
      const target = obj[QOjectTargetSymbol];
      const id = objToId.get(normalizeObj(target ?? obj, doc));
      if (id !== undefined) {
        const proxySuffix = target ? '!' : '';
        return intToStr(id) + proxySuffix;
      }
      if (!target && isNode(obj)) {
        if (obj.nodeType === 1) {
          return getElementID(obj as Element);
        } else {
          logError('Can not serialize a HTML Node that is not an Element', obj);
          return null;
        }
      }
    } else {
      const id = objToId.get(normalizeObj(obj, doc));
      if (id !== undefined) {
        return intToStr(id);
      }
    }
    return null;
  }

  const subs = objs
    .map((obj) => {
      const subs = proxyMap.get(obj)?.[QOjectSubsSymbol] as SubscriberMap;
      if (subs) {
        return Object.fromEntries(
          Array.from(subs.entries()).map(([sub, set]) => {
            const id = getObjId(sub);
            if (id !== null) {
              return [id, set ? Array.from(set) : null];
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

  const serialize = (value: any) => {
    return getObjId(value) ?? value;
  };

  const qrlSerializeOptions: QRLSerializeOptions = {
    platform,
    getObjId,
  };

  const convertedObjs = objs.map((obj) => {
    if (Array.isArray(obj)) {
      return obj.map(serialize);
    } else if (obj && typeof obj === 'object') {
      if (isQrl(obj)) {
        return QRL_PREFIX + stringifyQRL(obj, qrlSerializeOptions);
      }
      const output: Record<string, any> = {};
      Object.entries(obj).forEach(([key, value]) => {
        output[key] = serialize(value);
      });
      return output;
    }
    return obj;
  });

  // Write back to the dom
  elements.forEach((node) => {
    const ctx = getContext(node)!;
    assertDefined(ctx);
    const props = ctx.props;
    const renderQrl = ctx.renderQrl;
    const attribute = ctx.refMap.array
      .map((obj) => {
        const id = getObjId(obj);
        assertDefined(id);
        return id;
      })
      .join(' ');
    node.setAttribute(QObjAttr, attribute);

    const seq = ctx.seq.map((index) => intToStr(index)).join(' ');
    node.setAttribute(QSeqAttr, seq);

    if (props) {
      const objs = [props];
      if (renderQrl) {
        objs.push(renderQrl);
      }
      node.setAttribute(QHostAttr, objs.map((obj) => ctx.refMap.indexOf(obj)).join(' '));
    }
  });

  // Sanity check of serialized element
  if (qDev) {
    elementToIndex.forEach((value, el) => {
      if (getDocument(el) !== doc) {
        logWarn('element from different document', value, el.tagName);
      }
      if (!value) {
        logWarn('unconnected element', el.tagName, '\n');
      }
    });
  }
  return {
    objs: convertedObjs,
    subs,
  };
}

export function getQwikJSON(parentElm: Element): HTMLScriptElement | undefined {
  let child = parentElm.lastElementChild;
  while (child) {
    if (child.tagName === 'SCRIPT' && child.getAttribute('type') === 'qwik/json') {
      return child as HTMLScriptElement;
    }
    child = child.previousElementSibling;
  }
  return undefined;
}

export function getNodesInScope(parent: Element, predicate: (el: Element) => boolean) {
  const nodes: Element[] = [];
  walkNodes(nodes, parent, predicate);
  return nodes;
}

export function walkNodes(nodes: Element[], parent: Element, predicate: (el: Element) => boolean) {
  let child = parent.firstElementChild;
  while (child) {
    if (!isContainer(child)) {
      if (predicate(child)) {
        nodes.push(child);
      }
      walkNodes(nodes, child, predicate);
    }
    child = child.nextElementSibling;
  }
}

function reviveValues(
  objs: any[],
  subs: any[],
  getObject: GetObject,
  map: ObjToProxyMap,
  containerEl: Element
) {
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (typeof value === 'string') {
      if (value === UNDEFINED_PREFIX) {
        objs[i] = undefined;
      } else if (value === DOCUMENT_PREFIX) {
        objs[i] = getDocument(containerEl);
      } else if (value.startsWith(QRL_PREFIX)) {
        objs[i] = parseQRL(value.slice(1), containerEl);
      }
    } else {
      const sub = subs[i];
      if (sub) {
        const converted = new Map();
        Object.entries(sub).forEach((entry) => {
          const el = getObject(entry[0]);
          if (!el) {
            logWarn(
              'QWIK can not revive subscriptions because of missing element ID',
              entry,
              value
            );
            return;
          }
          const set = entry[1] === null ? null : (new Set(entry[1] as any) as Set<string>);
          converted.set(el, set);
        });
        _restoreQObject(value, map, converted);
      }
    }
  }
}

function reviveNestedObjects(obj: any, getObject: GetObject) {
  if (obj && typeof obj == 'object') {
    if (isQrl(obj)) {
      if (obj.capture && obj.capture.length > 0) {
        obj.captureRef = obj.capture.map(getObject);
        obj.capture = null;
      }
      return;
    } else if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (typeof value == 'string') {
          obj[i] = getObject(value);
        } else {
          reviveNestedObjects(value, getObject);
        }
      }
    } else if (Object.getPrototypeOf(obj) === Object.prototype) {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (typeof value == 'string') {
            obj[key] = getObject(value);
          } else {
            reviveNestedObjects(value, getObject);
          }
        }
      }
    }
  }
}

function getObjectImpl(
  id: string,
  elements: Map<string, Element>,
  objs: any[],
  map: ObjToProxyMap
) {
  if (id.startsWith(ELEMENT_ID_PREFIX)) {
    assertEqual(elements.has(id), true);
    return elements.get(id);
  }
  const index = strToInt(id);
  assertEqual(objs.length > index, true);
  const obj = objs[index];
  const needsProxy = id.endsWith('!');
  if (needsProxy) {
    const finalObj = map.get(obj);
    assertDefined(finalObj);
    return finalObj;
  }
  return obj;
}

function normalizeObj(obj: any, doc: Document) {
  if (obj === doc) {
    return DOCUMENT_PREFIX;
  }
  if (obj === undefined || !shouldSerialize(obj)) {
    return UNDEFINED_PREFIX;
  }
  if (obj && typeof obj === 'object') {
    const value = obj[QOjectTargetSymbol] ?? obj;
    return value;
  }
  return obj;
}

function collectValue(obj: any, seen: Set<any>, doc: Document) {
  const handled = collectQObjects(obj, seen, doc);
  if (!handled) {
    seen.add(normalizeObj(obj, doc));
  }
}

function collectQrl(obj: QRLInternal, seen: Set<any>, doc: Document) {
  seen.add(normalizeObj(obj, doc));
  if (obj.captureRef) {
    obj.captureRef.forEach((obj) => collectValue(obj, seen, doc));
  }
}

function collectQObjects(obj: any, seen: Set<any>, doc: Document) {
  if (obj != null) {
    if (typeof obj === 'object') {
      if (!obj[QOjectTargetSymbol] && isNode(obj)) {
        return obj.nodeType === 1;
      }
      if (isQrl(obj)) {
        collectQrl(obj, seen, doc);
        return true;
      }
      obj = normalizeObj(obj, doc);
    }
    if (typeof obj === 'object') {
      if (seen.has(obj)) return true;
      seen.add(obj);

      if (Array.isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          collectQObjects(obj[i], seen, doc);
        }
      } else {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            collectQObjects(obj[key], seen, doc);
          }
        }
      }
      return true;
    }
    if (typeof obj === 'string') {
      seen.add(obj);
      return true;
    }
  }
  return false;
}

export function isProxy(obj: any): boolean {
  return obj !== null && typeof obj === 'object' && QOjectTargetSymbol in obj;
}

export function isContainer(el: Element) {
  return el.hasAttribute(QContainerAttr);
}

function hasQObj(el: Element) {
  return el.hasAttribute(QObjAttr);
}

function hasQId(el: Element) {
  return el.hasAttribute(ELEMENT_ID);
}

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const strToInt = (nu: string) => {
  return parseInt(nu, 36);
};
