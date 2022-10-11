import { assertDefined, assertEqual, assertTrue } from '../assert/assert';
import { getContext, QContext, tryGetContext } from '../props/props';
import { getDocument } from '../util/dom';
import {
  assertElement,
  assertQwikElement,
  isComment,
  isDocument,
  isElement,
  isNode,
  isQwikElement,
  isText,
  isVirtualElement,
} from '../util/element';
import { logDebug, logWarn } from '../util/log';
import {
  ELEMENT_ID,
  ELEMENT_ID_PREFIX,
  QContainerAttr,
  QScopedStyle,
  QStyle,
} from '../util/markers';
import { qDev } from '../util/qdev';
import {
  createProxy,
  fastShouldSerialize,
  getOrCreateProxy,
  getProxyFlags,
  getProxyManager,
  getProxyTarget,
  isConnected,
  QObjectFlagsSymbol,
  SignalImpl,
} from './q-object';
import { destroyWatch, WatchFlagsIsDirty } from '../use/use-watch';
import type { QRL } from '../import/qrl.public';
import { emitEvent } from '../util/event';
import {
  qError,
  QError_containerAlreadyPaused,
  QError_missingObjectId,
  QError_verifySerializable,
} from '../error/error';
import { isArray, isObject, isSerializableObject, isString } from '../util/types';
import { directGetAttribute, directSetAttribute } from '../render/fast-calls';
import { isNotNullable, isPromise } from '../util/promises';
import { collectDeps, createParser, Parser, serializeValue, UNDEFINED_PREFIX } from './serializers';
import {
  ContainerState,
  getContainerState,
  LocalSubscriptionManager,
  parseSubscription,
  serializeSubscription,
  Subscriptions,
} from '../render/container';
import { getQId } from '../render/execute-component';
import {
  findClose,
  processVirtualNodes,
  QwikElement,
  VirtualElement,
  VirtualElementImpl,
} from '../render/dom/virtual-element';
import { getDomListeners } from '../props/props-on';
import { fromKebabToCamelCase } from '../util/case';
import { domToVnode } from '../render/dom/visitor';

export type GetObject = (id: string) => any;
export type GetObjID = (obj: any) => string | null;
export type MustGetObjID = (obj: any) => string;

// <docs markdown="../readme.md#pauseContainer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#pauseContainer instead)
/**
 * Serialize the current state of the application into DOM
 *
 * @alpha
 */
// </docs>
export const pauseContainer = async (
  elmOrDoc: Element | Document,
  defaultParentJSON?: Element
): Promise<SnapshotResult> => {
  const doc = getDocument(elmOrDoc);
  const documentElement = doc.documentElement;
  const containerEl = isDocument(elmOrDoc) ? documentElement : elmOrDoc;
  if (directGetAttribute(containerEl, QContainerAttr) === 'paused') {
    throw qError(QError_containerAlreadyPaused);
  }
  const parentJSON =
    defaultParentJSON ?? (containerEl === doc.documentElement ? doc.body : containerEl);
  const data = await pauseFromContainer(containerEl);
  const script = doc.createElement('script');
  directSetAttribute(script, 'type', 'qwik/json');
  script.textContent = escapeText(JSON.stringify(data.state, undefined, qDev ? '  ' : undefined));
  parentJSON.appendChild(script);
  directSetAttribute(containerEl, QContainerAttr, 'paused');
  return data;
};

export const moveStyles = (containerEl: Element, containerState: ContainerState) => {
  const head = containerEl.ownerDocument.head;
  containerEl.querySelectorAll('style[q\\:style]').forEach((el) => {
    containerState.$styleIds$.add(directGetAttribute(el, QStyle)!);
    head.appendChild(el);
  });
};

export const resumeContainer = (containerEl: Element) => {
  if (!isContainer(containerEl)) {
    logWarn('Skipping hydration because parent element is not q:container');
    return;
  }
  let maxId = 0;

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
  moveStyles(containerEl, containerState);
  const meta = JSON.parse(unescapeText(script.textContent || '{}')) as SnapshotState;

  // Collect all elements
  const elements = new Map<string, QwikElement | Node>();

  const getObject: GetObject = (id) => {
    return getObjectImpl(id, elements, meta.objs, containerState);
  };

  const elementWalker = doc.createTreeWalker(containerEl, SHOW_COMMENT | SHOW_ELEMENT, {
    acceptNode(node: Element | Comment) {
      if (isComment(node)) {
        const data = node.data;
        if (data.startsWith('qv ')) {
          const close = findClose(node);
          const virtual = new VirtualElementImpl(node, close);
          const id = directGetAttribute(virtual, ELEMENT_ID);
          if (id) {
            const elCtx = getContext(virtual);
            elCtx.$id$ = id;
            elements.set(ELEMENT_ID_PREFIX + id, virtual);
            maxId = Math.max(maxId, strToInt(id));
          }
        } else if (data.startsWith('t=')) {
          const id = data.slice(2);
          elements.set(ELEMENT_ID_PREFIX + data.slice(2), getTextNode(node));
          maxId = Math.max(maxId, strToInt(id));
        }
        return FILTER_SKIP;
      }
      if (isContainer(node)) {
        return FILTER_REJECT;
      }
      return node.hasAttribute(ELEMENT_ID) ? FILTER_ACCEPT : FILTER_SKIP;
    },
  });

  let el: Node | null = null;
  while ((el = elementWalker.nextNode())) {
    assertElement(el);
    const id = directGetAttribute(el, ELEMENT_ID);
    assertDefined(id, `resume: element missed q:id`, el);
    const elCtx = getContext(el);
    elCtx.$id$ = id;
    elCtx.$vdom$ = domToVnode(el);
    elements.set(ELEMENT_ID_PREFIX + id, el);
    maxId = Math.max(maxId, strToInt(id));
  }

  containerState.$elementIndex$ = ++maxId;

  const parser = createParser(getObject, containerState, doc);

  // Revive proxies with subscriptions into the proxymap
  reviveValues(meta.objs, parser);
  reviveSubscriptions(meta.objs, meta.subs, getObject, containerState, parser);

  // Rebuild target objects
  for (const obj of meta.objs) {
    reviveNestedObjects(obj, getObject, parser);
  }

  for (const elementID of Object.keys(meta.ctx)) {
    assertTrue(elementID.startsWith('#'), 'elementId must start with #');
    const ctxMeta = meta.ctx[elementID];
    const el = elements.get(elementID);
    assertDefined(el, `resume: cant find dom node for id`, elementID);
    assertQwikElement(el);
    const elCtx = getContext(el);
    const refMap = ctxMeta.r;
    const seq = ctxMeta.s;
    const host = ctxMeta.h;
    const contexts = ctxMeta.c;
    const watches = ctxMeta.w;

    if (refMap) {
      assertTrue(isElement(el), 'el must be an actual DOM element');
      elCtx.$refMap$ = refMap.split(' ').map(getObject);
      elCtx.li = getDomListeners(elCtx, containerEl);
    }
    if (seq) {
      elCtx.$seq$ = seq.split(' ').map(getObject);
    }
    if (watches) {
      elCtx.$watches$ = watches.split(' ').map(getObject);
    }
    if (contexts) {
      elCtx.$contexts$ = new Map();
      for (const part of contexts.split(' ')) {
        const [key, value] = part.split('=');
        elCtx.$contexts$.set(key, getObject(value));
      }
    }

    // Restore sequence scoping
    if (host) {
      const [props, renderQrl] = host.split(' ');
      const styleIds = el.getAttribute(QScopedStyle);
      assertDefined(props, `resume: props missing in host metadata`, host);
      assertDefined(renderQrl, `resume: renderQRL missing in host metadata`, host);
      elCtx.$scopeIds$ = styleIds ? styleIds.split(' ') : null;
      elCtx.$mounted$ = true;
      elCtx.$props$ = getObject(props);
      elCtx.$componentQrl$ = getObject(renderQrl);
    }
  }

  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  logDebug('Container resumed');
  emitEvent(containerEl, 'qresume', undefined, true);
};

/**
 * @alpha
 */
export interface SnapshotMetaValue {
  r?: string; // q:obj
  w?: string; // q:watches
  s?: string; // q:seq
  h?: string; // q:host
  c?: string; // q:context
}

/**
 * @alpha
 */
export type SnapshotMeta = Record<string, SnapshotMetaValue>;

/**
 * @alpha
 */
export interface SnapshotState {
  ctx: SnapshotMeta;
  objs: any[];
  subs: any[];
}

/**
 * @alpha
 */
export interface SnapshotListener {
  key: string;
  qrl: QRL<any>;
  el: Element;
}

/**
 * @alpha
 */
export interface SnapshotResult {
  state: SnapshotState;
  listeners: SnapshotListener[];
  objs: any[];
  mode: 'render' | 'listeners' | 'static';
}

export const pauseFromContainer = async (containerEl: Element): Promise<SnapshotResult> => {
  const containerState = getContainerState(containerEl);
  const contexts = getNodesInScope(containerEl, hasQId).map(tryGetContext) as QContext[];
  return _pauseFromContexts(contexts, containerState);
};

/**
 * @internal
 */
export const _pauseFromContexts = async (
  allContexts: QContext[],
  containerState: ContainerState
): Promise<SnapshotResult> => {
  const collector = createCollector(containerState);
  const listeners: SnapshotListener[] = [];

  // TODO: optimize
  for (const ctx of allContexts) {
    if (ctx.$watches$) {
      for (const watch of ctx.$watches$) {
        if (qDev) {
          if (watch.$flags$ & WatchFlagsIsDirty) {
            logWarn('Serializing dirty watch. Looks like an internal error.');
          }
          if (!isConnected(watch)) {
            logWarn('Serializing disconneted watch. Looks like an internal error.');
          }
        }
        destroyWatch(watch);
      }
    }
  }

  for (const ctx of allContexts) {
    const el = ctx.$element$;
    const ctxListeners = ctx.li;
    for (const listener of ctxListeners) {
      const key = listener[0];
      const qrl = listener[1];
      const captured = qrl.$captureRef$;
      if (captured) {
        for (const obj of captured) {
          collectValue(obj, collector, true);
        }
      }
      if (isElement(el)) {
        listeners.push({
          key,
          qrl,
          el,
        });
      }
    }
  }

  // No listeners implies static page
  if (listeners.length === 0) {
    return {
      state: {
        ctx: {},
        objs: [],
        subs: [],
      },
      objs: [],
      listeners: [],
      mode: 'static',
    };
  }

  // Wait for remaining promises
  let promises: Promise<any>[];
  while ((promises = collector.$promises$).length > 0) {
    collector.$promises$ = [];
    await Promise.allSettled(promises);
  }

  // If at this point any component can render, we need to capture Context and Props
  const canRender = collector.$elements$.length > 0;
  if (canRender) {
    for (const element of collector.$elements$) {
      collectElementData(tryGetContext(element)!, collector);
    }

    for (const ctx of allContexts) {
      if (ctx.$props$) {
        collectProps(ctx, collector);
      }
      if (ctx.$contexts$) {
        for (const item of ctx.$contexts$.values()) {
          collectValue(item, collector, false);
        }
      }
    }
  }

  // Wait for remaining promises
  while ((promises = collector.$promises$).length > 0) {
    collector.$promises$ = [];
    await Promise.all(promises);
  }

  // Convert objSet to array
  const elementToIndex = new Map<QwikElement, string | null>();
  const objs = Array.from(collector.$objSet$.keys());
  const objToId = new Map<any, string>();

  const getElementID = (el: QwikElement): string | null => {
    let id = elementToIndex.get(el);
    if (id === undefined) {
      id = getQId(el);
      if (!id) {
        console.warn('Missing ID', el);
      } else {
        id = ELEMENT_ID_PREFIX + id;
      }
      elementToIndex.set(el, id);
    }
    return id;
  };

  const getObjId = (obj: any): string | null => {
    let suffix = '';
    if (isPromise(obj)) {
      const { value, resolved } = getPromiseValue(obj);
      obj = value;
      if (resolved) {
        suffix += '~';
      } else {
        suffix += '_';
      }
    }

    if (isObject(obj)) {
      const target = getProxyTarget(obj);
      if (target) {
        suffix += '!';
        obj = target;
      } else if (isQwikElement(obj)) {
        const elID = getElementID(obj);
        if (elID) {
          return elID + suffix;
        }
        return null;
      }
    }
    const id = objToId.get(obj);
    if (id) {
      return id + suffix;
    }
    return null;
  };

  const mustGetObjId = (obj: any): string => {
    const key = getObjId(obj);
    if (key === null) {
      throw qError(QError_missingObjectId, obj);
    }
    return key;
  };

  // Compute subscriptions
  const subsMap = new Map<any, (Subscriptions | number)[]>();
  objs.forEach((obj) => {
    const subs = getManager(obj, containerState)?.$subs$;
    if (!subs) {
      return null;
    }
    const flags = getProxyFlags(obj) ?? 0;
    const convered: (Subscriptions | number)[] = [];
    if (flags > 0) {
      convered.push(flags);
    }
    for (const sub of subs) {
      const host = sub[1];
      if (sub[0] === 0 && isNode(host) && isVirtualElement(host)) {
        if (!collector.$elements$.includes(host)) {
          continue;
        }
      }
      convered.push(sub);
    }
    if (convered.length > 0) {
      subsMap.set(obj, convered);
    }
  });

  // Sort objects: the ones with subscriptions go first
  objs.sort((a, b) => {
    const isProxyA = subsMap.has(a) ? 0 : 1;
    const isProxyB = subsMap.has(b) ? 0 : 1;
    return isProxyA - isProxyB;
  });

  // Generate object ID by using a monotonic counter
  let count = 0;
  for (const obj of objs) {
    objToId.set(obj, intToStr(count));
    count++;
  }
  if (collector.$noSerialize$.length > 0) {
    const undefinedID = objToId.get(undefined);
    assertDefined(undefinedID, 'undefined ID must be defined');
    for (const obj of collector.$noSerialize$) {
      objToId.set(obj, undefinedID);
    }
  }

  // Serialize object subscriptions
  const subs: string[][] = [];
  for (const obj of objs) {
    const value = subsMap.get(obj);
    if (value == null) {
      break;
    }
    subs.push(
      value
        .map((s) => {
          if (typeof s === 'number') {
            return `_${s}`;
          }
          return serializeSubscription(s, getObjId);
        })
        .filter(isNotNullable)
    );
  }
  assertEqual(subs.length, subsMap.size, 'missing subscriptions to serialize', subs, subsMap);

  // Serialize objects
  const convertedObjs = objs.map((obj) => {
    if (obj === null) {
      return null;
    }
    const typeObj = typeof obj;
    switch (typeObj) {
      case 'undefined':
        return UNDEFINED_PREFIX;
      case 'number':
        if (!Number.isFinite(obj)) {
          break;
        }
        return obj;
      case 'string':
      case 'boolean':
        return obj;
    }
    const value = serializeValue(obj, mustGetObjId, containerState);
    if (value !== undefined) {
      return value;
    }
    if (typeObj === 'object') {
      if (isArray(obj)) {
        return obj.map(mustGetObjId);
      }
      if (isSerializableObject(obj)) {
        const output: Record<string, any> = {};
        for (const key of Object.keys(obj)) {
          output[key] = mustGetObjId(obj[key]);
        }
        return output;
      }
    }
    throw qError(QError_verifySerializable, obj);
  });

  const meta: SnapshotMeta = {};

  // Write back to the dom
  allContexts.forEach((ctx) => {
    assertDefined(ctx, `pause: missing context for dom node`);
    const node = ctx.$element$;
    const ref = ctx.$refMap$;
    const props = ctx.$props$;
    const contexts = ctx.$contexts$;
    const watches = ctx.$watches$;
    const renderQrl = ctx.$componentQrl$;
    const seq = ctx.$seq$;
    const metaValue: SnapshotMetaValue = {};
    const elementCaptured = isVirtualElement(node) && collector.$elements$.includes(node);

    let add = false;
    if (ref.length > 0) {
      const value = ref.map(mustGetObjId).join(' ');
      if (value) {
        metaValue.r = value;
        add = true;
      }
    }

    if (canRender) {
      if (elementCaptured && props) {
        metaValue.h = mustGetObjId(props) + ' ' + mustGetObjId(renderQrl);
        add = true;
      }

      if (watches && watches.length > 0) {
        const value = watches.map(getObjId).filter(isNotNullable).join(' ');
        if (value) {
          metaValue.w = value;
          add = true;
        }
      }

      if (elementCaptured && seq && seq.length > 0) {
        const value = seq.map(mustGetObjId).join(' ');
        metaValue.s = value;
        add = true;
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
    }

    if (add) {
      const elementID = getElementID(node);
      assertDefined(elementID, `pause: can not generate ID for dom node`, node);
      meta[elementID] = metaValue;
    }
  });

  // Sanity check of serialized element
  if (qDev) {
    elementToIndex.forEach((value, el) => {
      if (!value) {
        logWarn('unconnected element', el.nodeName, '\n');
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
    mode: canRender ? 'render' : 'listeners',
  };
};

export const getManager = (obj: any, containerState: ContainerState) => {
  if (!isObject(obj)) {
    return undefined;
  }
  if (obj instanceof SignalImpl) {
    return getProxyManager(obj);
  }
  const proxy = containerState.$proxyMap$.get(obj);
  if (proxy) {
    return getProxyManager(proxy);
  }
  return undefined;
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

const SHOW_ELEMENT = 1;
const SHOW_COMMENT = 128;
const FILTER_ACCEPT = 1;
const FILTER_REJECT = 2;
const FILTER_SKIP = 3;

export const getNodesInScope = (parent: Element, predicate: (el: Node) => boolean) => {
  const nodes: Element[] = [];
  if (predicate(parent)) {
    nodes.push(parent);
  }
  const walker = parent.ownerDocument.createTreeWalker(parent, SHOW_ELEMENT | SHOW_COMMENT, {
    acceptNode(node) {
      if (isContainer(node)) {
        return FILTER_REJECT;
      }
      return predicate(node) ? FILTER_ACCEPT : FILTER_SKIP;
    },
  });
  const pars: QwikElement[] = [];
  let currentNode: Node | null = null;
  while ((currentNode = walker.nextNode())) {
    pars.push(processVirtualNodes(currentNode) as Element);
  }
  return pars;
};

const reviveValues = (objs: any[], parser: Parser) => {
  for (let i = 0; i < objs.length; i++) {
    const value = objs[i];
    if (isString(value)) {
      objs[i] = value === UNDEFINED_PREFIX ? undefined : parser.prepare(value);
    }
  }
};

const reviveSubscriptions = (
  objs: any[],
  objsSubs: any[],
  getObject: GetObject,
  containerState: ContainerState,
  parser: Parser
) => {
  for (let i = 0; i < objsSubs.length; i++) {
    const value = objs[i];
    const subs = objsSubs[i] as string[];
    if (subs) {
      const converted: Subscriptions[] = [];
      let flag = 0;
      for (const sub of subs) {
        if (sub.startsWith('_')) {
          flag = parseInt(sub.slice(1), 10);
        } else {
          converted.push(parseSubscription(sub, getObject));
        }
      }
      if (flag > 0) {
        value[QObjectFlagsSymbol] = flag;
      }
      if (!parser.subs(value, converted)) {
        createProxy(value, containerState, converted);
      }
    }
  }
};

const reviveNestedObjects = (obj: any, getObject: GetObject, parser: Parser) => {
  if (parser.fill(obj)) {
    return;
  }

  if (obj && typeof obj == 'object') {
    if (isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        obj[i] = getObject(obj[i]);
      }
    } else if (isSerializableObject(obj)) {
      for (const key of Object.keys(obj)) {
        obj[key] = getObject(obj[key]);
      }
    }
  }
};

const OBJECT_TRANSFORMS: Record<string, (obj: any, containerState: ContainerState) => any> = {
  '!': (obj: any, containerState: ContainerState) => {
    return containerState.$proxyMap$.get(obj) ?? getOrCreateProxy(obj, containerState);
  },
  '~': (obj: any) => {
    return Promise.resolve(obj);
  },
  _: (obj: any) => {
    return Promise.reject(obj);
  },
};

const getObjectImpl = (
  id: string,
  elements: Map<string, QwikElement | Node>,
  objs: any[],
  containerState: ContainerState
) => {
  assertTrue(
    typeof id === 'string' && id.length > 0,
    'resume: id must be an non-empty string, got:',
    id
  );

  if (id.startsWith(ELEMENT_ID_PREFIX)) {
    assertTrue(elements.has(id), `missing element for id:`, id);
    return elements.get(id);
  }
  const index = strToInt(id);
  assertTrue(objs.length > index, 'resume: index is out of bounds', id);
  let obj = objs[index];
  for (let i = id.length - 1; i >= 0; i--) {
    const code = id[i];
    const transform = OBJECT_TRANSFORMS[code];
    if (!transform) {
      break;
    }
    obj = transform(obj, containerState);
  }
  return obj;
};

const collectProps = (elCtx: QContext, collector: Collector) => {
  const parentCtx = elCtx.$parent$;
  if (parentCtx && elCtx.$props$ && collector.$elements$.includes(parentCtx.$element$ as any)) {
    const subs = getProxyManager(elCtx.$props$)?.$subs$;
    const el = elCtx.$element$ as VirtualElement;
    if (subs && subs.some((e) => e[0] === 0 && e[1] === el)) {
      collectElement(el, collector);
    }
  }
};

export interface Collector {
  $seen$: Set<any>;
  $objSet$: Set<any>;
  $noSerialize$: any[];
  $elements$: VirtualElement[];
  $containerState$: ContainerState;
  $promises$: Promise<any>[];
}

const createCollector = (containerState: ContainerState): Collector => {
  return {
    $containerState$: containerState,
    $seen$: new Set(),
    $objSet$: new Set(),
    $noSerialize$: [],
    $elements$: [],
    $promises$: [],
  };
};

const collectDeferElement = (el: VirtualElement, collector: Collector) => {
  if (collector.$elements$.includes(el)) {
    return;
  }
  collector.$elements$.push(el);
};

const collectElement = (el: VirtualElement, collector: Collector) => {
  if (collector.$elements$.includes(el)) {
    return;
  }
  const ctx = tryGetContext(el);
  if (ctx) {
    collector.$elements$.push(el);
    collectElementData(ctx, collector);
  }
};

export const collectElementData = (elCtx: QContext, collector: Collector) => {
  if (elCtx.$props$) {
    collectValue(elCtx.$props$, collector, false);
  }
  if (elCtx.$componentQrl$) {
    collectValue(elCtx.$componentQrl$, collector, false);
  }
  if (elCtx.$seq$) {
    for (const obj of elCtx.$seq$) {
      collectValue(obj, collector, false);
    }
  }
  if (elCtx.$watches$) {
    for (const obj of elCtx.$watches$) {
      collectValue(obj, collector, false);
    }
  }
  if (elCtx.$contexts$) {
    for (const obj of elCtx.$contexts$.values()) {
      collectValue(obj, collector, false);
    }
  }
};

export const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/g, '\\x3C$1');
};

export const unescapeText = (str: string) => {
  return str.replace(/\\x3C(\/?script)/g, '<$1');
};

export const collectSubscriptions = (manager: LocalSubscriptionManager, collector: Collector) => {
  if (collector.$seen$.has(manager)) {
    return;
  }
  collector.$seen$.add(manager);

  const subs = manager.$subs$;
  assertDefined(subs, 'subs must be defined');
  for (const key of subs) {
    const host = key[1];
    if (isNode(host) && isVirtualElement(host)) {
      if (key[0] === 0) {
        collectDeferElement(host, collector);
      }
    } else {
      collectValue(host, collector, true);
    }
  }
};

const PROMISE_VALUE = Symbol();

interface PromiseValue {
  resolved: boolean;
  value: any;
}
const resolvePromise = (promise: Promise<any>) => {
  return promise.then(
    (value) => {
      const v: PromiseValue = {
        resolved: true,
        value,
      };
      (promise as any)[PROMISE_VALUE] = v;
      return value;
    },
    (value) => {
      const v: PromiseValue = {
        resolved: false,
        value,
      };
      (promise as any)[PROMISE_VALUE] = v;
      return value;
    }
  );
};

const getPromiseValue = (promise: Promise<any>): PromiseValue => {
  assertTrue(PROMISE_VALUE in promise, 'pause: promise was not resolved previously', promise);
  return (promise as any)[PROMISE_VALUE];
};

export const collectValue = (obj: any, collector: Collector, leaks: boolean) => {
  if (obj !== null) {
    const objType = typeof obj;
    switch (objType) {
      case 'function':
      case 'object': {
        const seen = collector.$seen$;
        if (seen.has(obj)) {
          return;
        }
        seen.add(obj);
        if (!fastShouldSerialize(obj)) {
          collector.$objSet$.add(undefined);
          collector.$noSerialize$.push(obj);
          return;
        }

        const input = obj;
        const target = getProxyTarget(obj);
        if (target) {
          obj = target;
          if (seen.has(obj)) {
            return;
          }
          seen.add(obj);
          if (leaks) {
            collectSubscriptions(getProxyManager(input)!, collector);
          }
        }
        const collected = collectDeps(obj, collector, leaks);
        if (collected) {
          collector.$objSet$.add(obj);
          return;
        }

        if (isPromise(obj)) {
          collector.$promises$.push(
            resolvePromise(obj).then((value) => {
              collectValue(value, collector, leaks);
            })
          );
          return;
        }

        if (objType === 'object') {
          if (isNode(obj)) {
            return;
          }
          if (isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
              collectValue(obj[i], collector, leaks);
            }
          } else if (isSerializableObject(obj)) {
            for (const key of Object.keys(obj)) {
              collectValue(obj[key], collector, leaks);
            }
          }
        }
        break;
      }
    }
  }
  collector.$objSet$.add(obj);
};

export const isContainer = (el: Node) => {
  return isElement(el) && el.hasAttribute(QContainerAttr);
};

const hasQId = (el: Node) => {
  const node = processVirtualNodes(el);
  if (isQwikElement(node)) {
    return node.hasAttribute(ELEMENT_ID);
  }
  return false;
};

export const intToStr = (nu: number) => {
  return nu.toString(36);
};

export const strToInt = (nu: string) => {
  return parseInt(nu, 36);
};

export const getEventName = (attribute: string) => {
  const colonPos = attribute.indexOf(':');
  if (attribute) {
    return fromKebabToCamelCase(attribute.slice(colonPos + 1));
  } else {
    return attribute;
  }
};

const getTextNode = (mark: Comment) => {
  const nextNode = mark.nextSibling!;
  if (isText(nextNode)) {
    return nextNode;
  } else {
    const textNode = mark.ownerDocument.createTextNode('');
    mark.parentElement!.insertBefore(textNode, mark);
    return textNode;
  }
};
