import { assertDefined, assertEqual } from '../assert/assert';
import { parseQRL, QRLSerializeOptions, stringifyQRL } from '../import/qrl';
import { isQrl, QRLInternal } from '../import/qrl-class';
import { getContext, createProps, tryGetContext } from '../props/props';
import { getDocument } from '../util/dom';
import { isDocument, isElement, isNode } from '../util/element';
import { logDebug, logError, logWarn } from '../util/log';
import { ELEMENT_ID, ELEMENT_ID_PREFIX, QContainerAttr } from '../util/markers';
import { qDev } from '../util/qdev';
import {
  isConnected,
  ObjToProxyMap,
  QOjectSubsSymbol,
  QOjectTargetSymbol,
  readWriteProxy,
  shouldSerialize,
  SubscriberMap,
  _restoreQObject,
} from './q-object';
import { destroyWatch, WatchDescriptor, WatchFlagsIsDirty } from '../use/use-watch';
import type { QRL } from '../import/qrl.public';
import { emitEvent } from '../util/event';
import { ContainerState, getContainerState } from '../render/notify-render';
import { codeToText, QError_cannotSerializeNode } from '../error/error';
import { isArray, isObject, isString } from '../util/types';
import { directGetAttribute, directSetAttribute } from '../render/fast-calls';

export type GetObject = (id: string) => any;
export type GetObjID = (obj: any) => string | null;

export const UNDEFINED_PREFIX = '\u0010';
export const QRL_PREFIX = '\u0011';
export const DOCUMENT_PREFIX = '\u0012';

// <docs markdown="../readme.md#pauseContainer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#pauseContainer instead)
/**
 * Serialize the current state of the application into DOM
 *
 * @alpha
 */
// </docs>
export const pauseContainer = (elmOrDoc: Element | Document): SnapshotResult => {
  const doc = getDocument(elmOrDoc);
  const containerEl = isDocument(elmOrDoc) ? elmOrDoc.documentElement : elmOrDoc;
  const parentJSON = isDocument(elmOrDoc) ? elmOrDoc.body : containerEl;
  const data = snapshotState(containerEl);
  const script = doc.createElement('script');
  directSetAttribute(script, 'type', 'qwik/json');
  script.textContent = escapeText(JSON.stringify(data.state, undefined, qDev ? '  ' : undefined));
  parentJSON.appendChild(script);
  directSetAttribute(containerEl, QContainerAttr, 'paused');
  return data;
};

export const resumeContainer = (containerEl: Element) => {
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

  const containerState = getContainerState(containerEl);
  const meta = JSON.parse(unescapeText(script.textContent || '{}')) as SnapshotState;

  // Collect all elements
  const elements = new Map<string, Element>();

  const getObject: GetObject = (id) => {
    return getObjectImpl(id, elements, meta.objs, containerState);
  };

  getNodesInScope(containerEl, hasQId).forEach((el) => {
    const id = directGetAttribute(el, ELEMENT_ID)!;
    elements.set(ELEMENT_ID_PREFIX + id, el);
  });

  // Revive proxies with subscriptions into the proxymap
  reviveValues(meta.objs, meta.subs, getObject, containerState, parentJSON);

  // Rebuild target objects
  for (const obj of meta.objs) {
    reviveNestedObjects(obj, getObject);
  }

  Object.entries(meta.ctx).forEach(([elementID, ctxMeta]) => {
    const el = getObject(elementID) as Element;
    assertDefined(el);
    const ctx = getContext(el);

    const qobj = ctxMeta.r;
    const seq = ctxMeta.s;
    const host = ctxMeta.h;
    const contexts = ctxMeta.c;
    const watches = ctxMeta.w;

    if (qobj) {
      ctx.$refMap$.$array$.push(...qobj.split(' ').map((part) => getObject(part)));
    }
    if (seq) {
      ctx.$seq$ = seq.split(' ').map((part) => getObject(part));
    }
    if (watches) {
      ctx.$watches$ = watches.split(' ').map((part) => getObject(part));
    }
    if (contexts) {
      contexts.split(' ').map((part) => {
        const [key, value] = part.split('=');
        if (!ctx.$contexts$) {
          ctx.$contexts$ = new Map();
        }
        ctx.$contexts$.set(key, getObject(value));
      });
    }

    // Restore sequence scoping
    if (host) {
      const [props, renderQrl] = host.split(' ');
      assertDefined(props);
      assertDefined(renderQrl);
      ctx.$props$ = createProps(getObject(props), ctx.$element$, containerState);
      ctx.$renderQrl$ = getObject(renderQrl);
    }
  });

  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  logDebug('Container resumed');
  emitEvent(containerEl, 'qresume', undefined, true);
};

/**
 * @public
 */
export interface SnapshotMetaValue {
  r?: string; // q:obj
  w?: string; // q:watches
  s?: string; // q:seq
  h?: string; // q:host
  c?: string; // q:context
}

export type SnapshotMeta = Record<string, SnapshotMetaValue>;

/**
 * @public
 */
export interface SnapshotState {
  ctx: SnapshotMeta;
  objs: any[];
  subs: any[];
}

/**
 * @public
 */
export interface SnapshotListener {
  key: string;
  qrl: QRL<any>;
}

/**
 * @public
 */
export interface SnapshotResult {
  state: SnapshotState;
  listeners: SnapshotListener[];
  objs: any[];
}

const hasContext = (el: Element) => {
  return !!tryGetContext(el);
};

export const snapshotState = (containerEl: Element): SnapshotResult => {
  const {
    $subsManager$: subsManager,
    $proxyMap$: proxyMap,
    $platform$: platform,
  } = getContainerState(containerEl);
  const doc = getDocument(containerEl);
  const elementToIndex = new Map<Element, string | null>();
  const collector = createCollector(doc, proxyMap);

  // Collect all qObjected around the DOM
  const elements = getNodesInScope(containerEl, hasContext);
  elements.forEach((node) => {
    const ctx = tryGetContext(node)!;
    collectProps(node, ctx.$props$, collector);
    ctx.$contexts$?.forEach((ctx) => {
      collectValue(ctx, collector);
    });
    ctx.$listeners$?.forEach((listeners) => {
      for (const l of listeners) {
        const captured = (l as QRLInternal).$captureRef$;
        if (captured) {
          captured.forEach((obj) => collectValue(obj, collector));
        }
      }
    });
    ctx.$watches$.forEach((watch) => {
      collector.$watches$.push(watch);
    });
  });

  // Convert objSet to array
  const objs = Array.from(collector.$objSet$);
  const objToId = new Map<any, number>();

  const hasSubscriptions = (a: any) => {
    const manager = subsManager.$tryGetLocal$(a);
    if (manager) {
      return manager.$subs$.size > 0;
    }
    return false;
  };

  const getElementID = (el: Element): string | null => {
    let id = elementToIndex.get(el);
    if (id === undefined) {
      if (el.isConnected) {
        id = intToStr(elementToIndex.size);
        directSetAttribute(el, ELEMENT_ID, id);
        id = ELEMENT_ID_PREFIX + id;
      } else {
        id = null;
      }
      elementToIndex.set(el, id);
    }
    return id;
  };

  const getObjId = (obj: any): string | null => {
    if (isObject(obj)) {
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
          logError(codeToText(QError_cannotSerializeNode), obj);
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
  };

  const mustGetObjId = (obj: any): string => {
    const id = getObjId(obj)!;
    assertDefined(id);
    return id;
  };

  const serialize = (value: any) => {
    return getObjId(value) ?? value;
  };

  let count = 0;
  objs.sort((a, b) => {
    const isProxyA = hasSubscriptions(a) ? 0 : 1;
    const isProxyB = hasSubscriptions(b) ? 0 : 1;
    return isProxyA - isProxyB;
  });

  for (const obj of objs) {
    objToId.set(obj, count);
    count++;
  }

  const subs = objs
    .map((obj) => {
      const subs = subsManager.$tryGetLocal$(obj)?.$subs$;
      if (subs && subs.size > 0) {
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

  const qrlSerializeOptions: QRLSerializeOptions = {
    $platform$: platform,
    $getObjId$: getObjId,
  };

  const convertedObjs = objs.map((obj) => {
    if (isObject(obj)) {
      if (isArray(obj)) {
        return obj.map(serialize);
      }
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

  const listeners: SnapshotListener[] = [];

  const meta: SnapshotMeta = {};

  // Write back to the dom
  elements.forEach((node) => {
    const ctx = getContext(node)!;
    assertDefined(ctx);

    const ref = ctx.$refMap$;
    const props = ctx.$props$;
    const contexts = ctx.$contexts$;
    const watches = ctx.$watches$;
    const renderQrl = ctx.$renderQrl$;
    const seq = ctx.$seq$;
    const metaValue: SnapshotMetaValue = {};
    const elementCaptured = collector.$elements$.includes(node);

    let add = false;
    if (ref.$array$.length > 0) {
      const value = ref.$array$.map((obj) => mustGetObjId(obj)).join(' ');
      if (value) {
        metaValue.r = value;
        add = true;
      }
    }

    if (elementCaptured && props) {
      const objs = [getProxyTarget(props)];
      if (renderQrl) {
        objs.push(renderQrl);
      }
      const value = objs.map((obj) => mustGetObjId(obj)).join(' ');
      if (value) {
        metaValue.h = value;
        add = true;
      }
    }

    if (watches.length > 0) {
      const value = watches
        .map((watch) => getObjId(watch))
        .filter((obj) => obj != null)
        .join(' ');
      if (value) {
        metaValue.w = value;
        add = true;
      }
    }

    if (elementCaptured && seq.length > 0) {
      const value = seq.map((obj) => mustGetObjId(obj)).join(' ');
      if (value) {
        metaValue.s = value;
        add = true;
      }
    }

    if (contexts) {
      const serializedContexts: string[] = [];
      contexts.forEach((value, key) => {
        serializedContexts.push(`${key}=${mustGetObjId(value)}`);
      });
      const value = serializedContexts.join(' ');
      if (value) {
        metaValue.c = value;
        add = true;
      }
    }

    if (add) {
      const elementID = getElementID(node)!;
      assertDefined(elementID);
      meta[elementID] = metaValue;
    }

    if (ctx.$listeners$) {
      ctx.$listeners$.forEach((qrls, key) => {
        qrls.forEach((qrl) => {
          listeners.push({
            key,
            qrl,
          });
        });
      });
    }
  });

  for (const watch of collector.$watches$) {
    destroyWatch(watch);
    if (qDev) {
      if (watch.f & WatchFlagsIsDirty) {
        logWarn('Serializing dirty watch. Looks like an internal error.');
      }
      if (!isConnected(watch)) {
        logWarn('Serializing disconneted watch. Looks like an internal error.');
      }
    }
  }

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
    state: {
      ctx: meta,
      objs: convertedObjs,
      subs,
    },
    objs,
    listeners,
  };
};

export const getQwikJSON = (parentElm: Element): HTMLScriptElement | undefined => {
  let child = parentElm.lastElementChild;
  while (child) {
    if (child.tagName === 'SCRIPT' && directGetAttribute(child, 'type') === 'qwik/json') {
      return child as HTMLScriptElement;
    }
    child = child.previousElementSibling;
  }
  return undefined;
};

export const getNodesInScope = (parent: Element, predicate: (el: Element) => boolean) => {
  const nodes: Element[] = [];
  walkNodes(nodes, parent, predicate);
  return nodes;
};

export const walkNodes = (
  nodes: Element[],
  parent: Element,
  predicate: (el: Element) => boolean
) => {
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
};

const reviveValues = (
  objs: any[],
  subs: any[],
  getObject: GetObject,
  containerState: ContainerState,
  containerEl: Element
) => {
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (isString(value)) {
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
        _restoreQObject(value, containerState, converted);
      }
    }
  }
};

const reviveNestedObjects = (obj: any, getObject: GetObject) => {
  if (obj && typeof obj == 'object') {
    if (isQrl(obj)) {
      if (obj.$capture$ && obj.$capture$.length > 0) {
        obj.$captureRef$ = obj.$capture$.map(getObject);
        obj.$capture$ = null;
      }
      return;
    } else if (isArray(obj)) {
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
};

const getObjectImpl = (
  id: string,
  elements: Map<string, Element>,
  objs: any[],
  containerState?: ContainerState
) => {
  if (id.startsWith(ELEMENT_ID_PREFIX)) {
    assertEqual(elements.has(id), true);
    return elements.get(id);
  }
  const index = strToInt(id);
  assertEqual(objs.length > index, true);
  const obj = objs[index];
  const needsProxy = id.endsWith('!');
  if (needsProxy && containerState) {
    return containerState.$proxyMap$.get(obj) ?? readWriteProxy(obj, containerState);
  }
  return obj;
};

const normalizeObj = (obj: any, doc: Document) => {
  if (obj === doc) {
    return DOCUMENT_PREFIX;
  }
  if (obj === undefined || !shouldSerialize(obj)) {
    return UNDEFINED_PREFIX;
  }
  return getProxyTarget(obj) ?? obj;
};

const collectValue = (obj: any, collector: Collector) => {
  const handled = collectQObjects(obj, collector);
  if (!handled) {
    collector.$objSet$.add(normalizeObj(obj, collector.$doc$));
  }
};

const collectProps = (el: Element, props: any, collector: Collector) => {
  const subs = isObject(props) && (props[QOjectSubsSymbol] as SubscriberMap);
  if (subs && subs.has(el)) {
    // The host element read the props
    collectElement(el, collector);
  }
};

export interface Collector {
  $seen$: Set<any>;
  $objSet$: Set<any>;
  $elements$: Element[];
  $watches$: WatchDescriptor[];
  $proxyMap$: ObjToProxyMap;
  $doc$: Document;
}

const createCollector = (doc: Document, proxyMap: ObjToProxyMap): Collector => {
  return {
    $seen$: new Set(),
    $objSet$: new Set(),
    $elements$: [],
    $watches$: [],
    $proxyMap$: proxyMap,
    $doc$: doc,
  };
};

const collectQrl = (obj: QRLInternal, collector: Collector) => {
  if (collector.$seen$.has(obj)) {
    return true;
  }
  collector.$seen$.add(obj);

  collector.$objSet$.add(normalizeObj(obj, collector.$doc$));
  if (obj.$captureRef$) {
    obj.$captureRef$.forEach((obj) => collectValue(obj, collector));
  }
};

const collectElement = (el: Element, collector: Collector) => {
  if (collector.$seen$.has(el)) {
    return;
  }
  collector.$seen$.add(el);
  const ctx = tryGetContext(el);
  if (ctx) {
    collector.$elements$.push(el);
    if (ctx.$props$) {
      collectValue(ctx.$props$, collector);
    }
    if (ctx.$renderQrl$) {
      collectValue(ctx.$renderQrl$, collector);
    }
    ctx.$seq$.forEach((obj) => {
      collectValue(obj, collector);
    });
    ctx.$refMap$.$array$.forEach((obj) => {
      collectValue(obj, collector);
    });
    ctx.$watches$.forEach((watch) => {
      collectValue(watch, collector);
    });
    if (ctx.$contexts$) {
      ctx.$contexts$.forEach((obj) => {
        collectValue(obj, collector);
      });
    }
  }
};

export const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/g, '\\x3C$1');
};

export const unescapeText = (str: string) => {
  return str.replace(/\\x3C(\/?script)/g, '<$1');
};

const collectSubscriptions = (subs: SubscriberMap, collector: Collector) => {
  if (collector.$seen$.has(subs)) {
    return;
  }
  collector.$seen$.add(subs);
  Array.from(subs.keys()).forEach((key) => {
    if (isElement(key)) {
      collectElement(key, collector);
    } else {
      collectValue(key, collector);
    }
  });
};

const collectQObjects = (obj: any, collector: Collector) => {
  if (obj != null) {
    if (typeof obj === 'object') {
      const hasTarget = !!obj[QOjectTargetSymbol];
      if (!hasTarget && isNode(obj)) {
        if (obj.nodeType === 1) {
          return true;
        }
        return false;
      }
      if (isQrl(obj)) {
        collectQrl(obj, collector);
        return true;
      }
      const proxied = hasTarget ? obj : collector.$proxyMap$.get(obj);
      const subs = proxied?.[QOjectSubsSymbol] as SubscriberMap;
      if (subs) {
        collectSubscriptions(subs, collector);
      }
      obj = normalizeObj(obj, collector.$doc$);
    }
    if (typeof obj === 'object') {
      if (collector.$seen$.has(obj)) {
        return true;
      }
      collector.$seen$.add(obj);
      collector.$objSet$.add(obj);

      if (isArray(obj)) {
        for (let i = 0; i < obj.length; i++) {
          collectQObjects(obj[i], collector);
        }
      } else {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            collectQObjects(obj[key], collector);
          }
        }
      }
      return true;
    }
    if (isString(obj)) {
      collector.$objSet$.add(obj);
      return true;
    }
  }
  return false;
};

export const getProxyTarget = (obj: any): any => {
  if (isObject(obj)) {
    return obj[QOjectTargetSymbol];
  }
  return undefined;
};

export const isContainer = (el: Element) => {
  return el.hasAttribute(QContainerAttr);
};

const hasQId = (el: Element) => {
  return el.hasAttribute(ELEMENT_ID);
};

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const strToInt = (nu: string) => {
  return parseInt(nu, 36);
};
