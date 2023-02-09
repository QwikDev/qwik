import { assertDefined, assertEqual, assertTrue } from '../error/assert';
import { getDocument } from '../util/dom';
import {
  assertElement,
  isComment,
  isDocument,
  isElement,
  isNode,
  isQwikElement,
  isText,
  isVirtualElement,
} from '../util/element';
import { logWarn } from '../util/log';
import { ELEMENT_ID, ELEMENT_ID_PREFIX, QContainerAttr, QScopedStyle } from '../util/markers';
import { qDev } from '../util/qdev';

import {
  destroyWatch,
  isResourceTask,
  ResourceReturnInternal,
  WatchFlagsIsDirty,
} from '../use/use-task';
import {
  qError,
  QError_containerAlreadyPaused,
  QError_missingObjectId,
  QError_verifySerializable,
} from '../error/error';
import { isArray, isObject, isSerializableObject } from '../util/types';
import { directGetAttribute, directSetAttribute } from '../render/fast-calls';
import { isNotNullable, isPromise } from '../util/promises';
import { collectDeps, serializeValue, UNDEFINED_PREFIX } from './serializers';
import {
  ContainerState,
  FILTER_REJECT,
  FILTER_SKIP,
  _getContainerState,
  GetObjID,
  intToStr,
  SHOW_COMMENT,
  SHOW_ELEMENT,
  SnapshotMeta,
  SnapshotMetaValue,
  SnapshotResult,
} from './container';
import { processVirtualNodes, QwikElement, VirtualElement } from '../render/dom/virtual-element';
import { groupListeners } from '../state/listeners';
import { serializeSStyle } from '../style/qrl-styles';
import { serializeQRLs } from '../qrl/qrl';
import {
  fastSkipSerialize,
  fastWeakSerialize,
  getProxyFlags,
  getProxyManager,
  getProxyTarget,
  isConnected,
  LocalSubscriptionManager,
  serializeSubscription,
  Subscriptions,
} from '../state/common';
import { HOST_FLAG_DYNAMIC, QContext, tryGetContext } from '../state/context';
import { SignalImpl } from '../state/signal';
import type { QRL } from '../qrl/qrl.public';

/**
 * @internal
 */
export const _serializeData = async (data: any) => {
  const containerState = {} as any;
  const collector = createCollector(containerState);
  collectValue(data, collector, false);

  // Wait for remaining promises
  let promises: Promise<any>[];
  while ((promises = collector.$promises$).length > 0) {
    collector.$promises$ = [];
    await Promise.all(promises);
  }

  const objs = Array.from(collector.$objSet$.keys());
  let count = 0;
  const objToId = new Map<any, string>();
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

  const mustGetObjId = (obj: any): string => {
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
    const key = objToId.get(obj);
    if (key === undefined) {
      throw qError(QError_missingObjectId, obj);
    }
    return key + suffix;
  };

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

  return JSON.stringify({
    _entry: mustGetObjId(data),
    _objs: convertedObjs,
  });
};

// <docs markdown="../readme.md#pauseContainer">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit ../readme.md#pauseContainer instead)
/**
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

  const containerState = _getContainerState(containerEl);
  const contexts = getNodesInScope(containerEl, hasContext);

  // Set container to paused
  directSetAttribute(containerEl, QContainerAttr, 'paused');

  // Update elements with context
  for (const elCtx of contexts) {
    const elm = elCtx.$element$;
    const listeners = elCtx.li;
    if (elCtx.$scopeIds$) {
      const value = serializeSStyle(elCtx.$scopeIds$);
      if (value) {
        elm.setAttribute(QScopedStyle, value);
      }
    }
    if (elCtx.$id$) {
      elm.setAttribute(ELEMENT_ID, elCtx.$id$);
    }
    if (isElement(elm) && listeners.length > 0) {
      const groups = groupListeners(listeners);
      for (const listener of groups) {
        elm.setAttribute(listener[0], serializeQRLs(listener[1], elCtx));
      }
    }
  }

  // Serialize data
  const data = await _pauseFromContexts(contexts, containerState, (el) => {
    if (isNode(el) && isText(el)) {
      return getTextID(el, containerState);
    }
    return null;
  });

  // Emit Qwik JSON
  const qwikJson = doc.createElement('script');
  directSetAttribute(qwikJson, 'type', 'qwik/json');
  qwikJson.textContent = escapeText(JSON.stringify(data.state, undefined, qDev ? '  ' : undefined));
  parentJSON.appendChild(qwikJson);

  // Emit event registration
  const extraListeners = Array.from(containerState.$events$, (s) => JSON.stringify(s));
  const eventsScript = doc.createElement('script');
  eventsScript.textContent = `window.qwikevents||=[];window.qwikevents.push(${extraListeners.join(
    ', '
  )})`;
  parentJSON.appendChild(eventsScript);

  return data;
};

/**
 * @internal
 */
export const _pauseFromContexts = async (
  allContexts: QContext[],
  containerState: ContainerState,
  fallbackGetObjId?: GetObjID
): Promise<SnapshotResult> => {
  const collector = createCollector(containerState);
  let hasListeners = false;

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
        if (isResourceTask(watch)) {
          collector.$resources$.push(watch.$resource$);
        }
        destroyWatch(watch);
      }
    }
  }

  for (const ctx of allContexts) {
    const el = ctx.$element$;
    const ctxListeners = ctx.li;
    for (const listener of ctxListeners) {
      if (isElement(el)) {
        const qrl = listener[1];
        const captured = qrl.$captureRef$;
        if (captured) {
          for (const obj of captured) {
            collectValue(obj, collector, true);
          }
        }
        collector.$qrls$.push(qrl);
        hasListeners = true;
      }
    }
  }

  // No listeners implies static page
  if (!hasListeners) {
    return {
      state: {
        refs: {},
        ctx: {},
        objs: [],
        subs: [],
      },
      objs: [],
      qrls: [],
      resources: collector.$resources$,
      mode: 'static',
    };
  }

  // Wait for remaining promises
  let promises: Promise<any>[];
  while ((promises = collector.$promises$).length > 0) {
    collector.$promises$ = [];
    await Promise.all(promises);
  }

  // If at this point any component can render, we need to capture Context and Props
  const canRender = collector.$elements$.length > 0;
  if (canRender) {
    for (const elCtx of collector.$deferElements$) {
      collectElementData(elCtx, collector, false);
    }

    for (const ctx of allContexts) {
      collectProps(ctx, collector);
    }
  }

  // Wait for remaining promises
  while ((promises = collector.$promises$).length > 0) {
    collector.$promises$ = [];
    await Promise.all(promises);
  }

  // Convert objSet to array
  const elementToIndex = new Map<Node | QwikElement, string | null>();
  const objs = Array.from(collector.$objSet$.keys());
  const objToId = new Map<any, string>();

  const getElementID = (el: QwikElement): string | null => {
    let id = elementToIndex.get(el);
    if (id === undefined) {
      id = getQId(el);
      if (!id) {
        console.warn('Missing ID', el);
      }
      elementToIndex.set(el, id);
    }
    return id;
  };

  const getObjId: GetObjID = (obj) => {
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
          return ELEMENT_ID_PREFIX + elID + suffix;
        }
        return null;
      }
    }
    const id = objToId.get(obj);
    if (id) {
      return id + suffix;
    }
    if (fallbackGetObjId) {
      return fallbackGetObjId(obj);
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
        if (!collector.$elements$.includes(tryGetContext(host)!)) {
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
          const id = getObjId(obj[key]);
          if (id !== null) {
            output[key] = id;
          }
        }
        return output;
      }
    }
    throw qError(QError_verifySerializable, obj);
  });

  const meta: SnapshotMeta = {};
  const refs: Record<string, string> = {};

  // Write back to the dom
  allContexts.forEach((ctx) => {
    const node = ctx.$element$;
    const elementID = ctx.$id$;
    const ref = ctx.$refMap$;
    const props = ctx.$props$;
    const contexts = ctx.$contexts$;
    const watches = ctx.$watches$;
    const renderQrl = ctx.$componentQrl$;
    const seq = ctx.$seq$;
    const metaValue: SnapshotMetaValue = {};
    const elementCaptured = isVirtualElement(node) && collector.$elements$.includes(ctx);
    assertDefined(elementID, `pause: can not generate ID for dom node`, node);

    if (ref.length > 0) {
      assertElement(node);
      const value = ref.map(mustGetObjId).join(' ');
      if (value) {
        refs[elementID] = value;
      }
    } else if (canRender) {
      let add = false;
      if (elementCaptured) {
        assertDefined(renderQrl, 'renderQrl must be defined');
        const propsId = getObjId(props);
        metaValue.h = mustGetObjId(renderQrl) + (propsId ? ' ' + propsId : '');
        add = true;
      } else {
        const propsId = getObjId(props);
        if (propsId) {
          metaValue.h = ' ' + propsId;
          add = true;
        }
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
          const id = getObjId(value);
          if (id) {
            serializedContexts.push(`${key}=${id}`);
          }
        });
        const value = serializedContexts.join(' ');
        if (value) {
          metaValue.c = value;
          add = true;
        }
      }
      if (add) {
        meta[elementID] = metaValue;
      }
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
      refs,
      ctx: meta,
      objs: convertedObjs,
      subs,
    },
    objs,
    resources: collector.$resources$,
    qrls: collector.$qrls$,
    mode: canRender ? 'render' : 'listeners',
  };
};

export const getNodesInScope = <T>(
  parent: Element,
  predicate: (el: Node) => T | undefined
): T[] => {
  const results: T[] = [];
  const v = predicate(parent);
  if (v !== undefined) {
    results.push(v);
  }
  const walker = parent.ownerDocument.createTreeWalker(parent, SHOW_ELEMENT | SHOW_COMMENT, {
    acceptNode(node) {
      if (isContainer(node)) {
        return FILTER_REJECT;
      }
      const v = predicate(node);
      if (v !== undefined) {
        results.push(v);
      }
      return FILTER_SKIP;
    },
  });
  while (walker.nextNode());

  return results;
};

export interface Collector {
  $seen$: Set<any>;
  $objSet$: Set<any>;
  $noSerialize$: any[];
  $elements$: QContext[];
  $qrls$: QRL[];
  $resources$: ResourceReturnInternal<any>[];
  $prefetch$: number;
  $deferElements$: QContext[];
  $containerState$: ContainerState;
  $promises$: Promise<any>[];
}

const collectProps = (elCtx: QContext, collector: Collector) => {
  const parentCtx = elCtx.$parent$;
  const props = elCtx.$props$;
  if (parentCtx && props && !isEmptyObj(props) && collector.$elements$.includes(parentCtx)) {
    const subs = getProxyManager(props)?.$subs$;
    const el = elCtx.$element$ as VirtualElement;
    if (subs) {
      for (const sub of subs) {
        if (sub[1] === el) {
          if (sub[0] === 0) {
            collectElement(el, collector);
            return;
          } else {
            collectValue(props, collector, false);
          }
        }
      }
    }
  }
};

const createCollector = (containerState: ContainerState): Collector => {
  return {
    $containerState$: containerState,
    $seen$: new Set(),
    $objSet$: new Set(),
    $prefetch$: 0,
    $noSerialize$: [],
    $resources$: [],
    $elements$: [],
    $qrls$: [],
    $deferElements$: [],
    $promises$: [],
  };
};

const collectDeferElement = (el: VirtualElement, collector: Collector) => {
  const ctx = tryGetContext(el)!;
  if (collector.$elements$.includes(ctx)) {
    return;
  }
  collector.$elements$.push(ctx);
  collector.$prefetch$++;
  if (ctx.$flags$ & HOST_FLAG_DYNAMIC) {
    collectElementData(ctx, collector, true);
  } else {
    collector.$deferElements$.push(ctx);
  }
  collector.$prefetch$--;
};

const collectElement = (el: VirtualElement, collector: Collector) => {
  const ctx = tryGetContext(el);
  if (ctx) {
    if (collector.$elements$.includes(ctx)) {
      return;
    }
    collector.$elements$.push(ctx);
    collectElementData(ctx, collector, false);
  }
};

export const collectElementData = (elCtx: QContext, collector: Collector, dynamic: boolean) => {
  if (elCtx.$props$ && !isEmptyObj(elCtx.$props$)) {
    collectValue(elCtx.$props$, collector, dynamic);
  }
  if (elCtx.$componentQrl$) {
    collectValue(elCtx.$componentQrl$, collector, dynamic);
  }
  if (elCtx.$seq$) {
    for (const obj of elCtx.$seq$) {
      collectValue(obj, collector, dynamic);
    }
  }
  if (elCtx.$watches$) {
    for (const obj of elCtx.$watches$) {
      collectValue(obj, collector, dynamic);
    }
  }

  if (dynamic) {
    collectContext(elCtx, collector);
    if (elCtx.$dynamicSlots$) {
      for (const slotCtx of elCtx.$dynamicSlots$) {
        collectContext(slotCtx, collector);
      }
    }
  }
};

const collectContext = (elCtx: QContext | null, collector: Collector) => {
  while (elCtx) {
    if (elCtx.$contexts$) {
      for (const obj of elCtx.$contexts$.values()) {
        collectValue(obj, collector, true);
      }
      if (elCtx.$contexts$.get('_') === true) {
        break;
      }
    }
    elCtx = elCtx.$slotParent$ ?? elCtx.$parent$;
  }
};

export const escapeText = (str: string) => {
  return str.replace(/<(\/?script)/g, '\\x3C$1');
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
        if (fastSkipSerialize(obj)) {
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
          if (fastWeakSerialize(input)) {
            collector.$objSet$.add(obj);
            return;
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

const hasContext = (el: Node) => {
  const node = processVirtualNodes(el);
  if (isQwikElement(node)) {
    const ctx = tryGetContext(node);
    if (ctx && ctx.$id$) {
      return ctx;
    }
  }
  return undefined;
};

const getManager = (obj: any, containerState: ContainerState) => {
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

const getQId = (el: QwikElement): string | null => {
  const ctx = tryGetContext(el);
  if (ctx) {
    return ctx.$id$;
  }
  return null;
};

const getTextID = (node: Text, containerState: ContainerState) => {
  const prev = node.previousSibling;
  if (prev && isComment(prev)) {
    if (prev.data.startsWith('t=')) {
      return ELEMENT_ID_PREFIX + prev.data.slice(2);
    }
  }
  const doc = node.ownerDocument;
  const id = intToStr(containerState.$elementIndex$++);
  const open = doc.createComment(`t=${id}`);
  const close = doc.createComment('');
  const parent = node.parentElement!;
  parent.insertBefore(open, node);
  parent.insertBefore(close, node.nextSibling);
  return ELEMENT_ID_PREFIX + id;
};

const isEmptyObj = (obj: Record<string, any>) => {
  return Object.keys(obj).length === 0;
};
