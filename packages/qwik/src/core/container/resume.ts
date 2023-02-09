import { assertDefined, assertTrue } from '../error/assert';
import { getDocument } from '../util/dom';
import { isComment, isElement, isText } from '../util/element';
import { logDebug, logWarn } from '../util/log';
import { ELEMENT_ID, ELEMENT_ID_PREFIX, QContainerAttr, QStyle } from '../util/markers';

import { emitEvent } from '../util/event';

import { isArray, isSerializableObject, isString } from '../util/types';
import { directGetAttribute, directSetAttribute } from '../render/fast-calls';
import { createParser, OBJECT_TRANSFORMS, Parser, UNDEFINED_PREFIX } from './serializers';
import {
  ContainerState,
  _getContainerState,
  GetObject,
  isContainer,
  SHOW_COMMENT,
  SnapshotState,
  strToInt,
} from './container';
import { findClose, VirtualElementImpl } from '../render/dom/virtual-element';
import { getProxyManager, parseSubscription, Subscriptions } from '../state/common';
import { createProxy, setObjectFlags } from '../state/store';
import { qSerialize } from '../util/qdev';
import { pauseContainer } from './pause';
import { isPrimitive } from '../render/dom/render-dom';
import { getContext } from '../state/context';
import { domToVnode } from '../render/dom/visitor';

export const resumeIfNeeded = (containerEl: Element): void => {
  const isResumed = directGetAttribute(containerEl, QContainerAttr);
  if (isResumed === 'paused') {
    resumeContainer(containerEl);
    if (qSerialize) {
      appendQwikDevTools(containerEl);
    }
  }
};

export const getPauseState = (containerEl: Element): SnapshotState | undefined => {
  const doc = getDocument(containerEl);
  const isDocElement = containerEl === doc.documentElement;
  const parentJSON = isDocElement ? doc.body : containerEl;
  const script = getQwikJSON(parentJSON);
  if (script) {
    const data = (script.firstChild! as any).data;
    return JSON.parse(unescapeText(data) || '{}') as SnapshotState;
  }
};

/**
 * @internal
 */
export const _deserializeData = (data: string) => {
  const obj = JSON.parse(data);
  if (typeof obj !== 'object') {
    return null;
  }
  const { _objs, _entry } = obj;
  if (typeof _objs === 'undefined' || typeof _entry === 'undefined') {
    return null;
  }
  const parser = createParser({} as any, {} as any);
  reviveValues(_objs, parser);
  const getObject: GetObject = (id) => _objs[strToInt(id)];
  for (const obj of _objs) {
    reviveNestedObjects(obj, getObject, parser);
  }
  return getObject(_entry);
};

export const resumeContainer = (containerEl: Element) => {
  if (!isContainer(containerEl)) {
    logWarn('Skipping hydration because parent element is not q:container');
    return;
  }

  const pauseState =
    (containerEl as any)['_qwikjson_'] ?? (getPauseState(containerEl) as SnapshotState);

  (containerEl as any)['_qwikjson_'] = null;
  if (!pauseState) {
    logWarn('Skipping hydration qwik/json metadata was not found.');
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
  const containerState = _getContainerState(containerEl);
  moveStyles(containerEl, containerState);

  // Collect all elements
  const elements = new Map<number, Node>();
  let node: Comment | null = null;
  let container = 0;

  // Collect all virtual elements
  const elementWalker = doc.createTreeWalker(containerEl, SHOW_COMMENT);

  while ((node = elementWalker.nextNode() as Comment)) {
    const data = node.data;
    if (container === 0) {
      if (data.startsWith('qv ')) {
        const id = getID(data); // TODO: remove
        if (id >= 0) {
          elements.set(id, node);
        }
      } else if (data.startsWith('t=')) {
        const id = data.slice(2);
        const index = strToInt(id);
        elements.set(index, getTextNode(node));
      }
    }
    if (data === 'cq') {
      container++;
    } else if (data === '/cq') {
      container--;
    }
  }

  // Collect all elements
  // If there are nested container, we are forced to take a slower path.
  // In order to check if there are nested containers, we use the `'qc📦'` class.
  // This is because checking for class is the fastest way for the browser to find it.
  const slotPath = containerEl.getElementsByClassName('qc📦').length !== 0;
  containerEl.querySelectorAll('[q\\:id]').forEach((el) => {
    if (slotPath && el.closest('[q\\:container]') !== containerEl) {
      return;
    }
    const id = directGetAttribute(el, ELEMENT_ID);
    assertDefined(id, `resume: element missed q:id`, el);
    const index = strToInt(id);
    elements.set(index, el);
  });
  const parser = createParser(containerState, doc);

  const finalized = new Map<string, any>();
  const revived = new Set<number>();

  const getObject: GetObject = (id) => {
    assertTrue(
      typeof id === 'string' && id.length > 0,
      'resume: id must be an non-empty string, got:',
      id
    );
    if (finalized.has(id)) {
      return finalized.get(id);
    }
    return computeObject(id);
  };

  const computeObject: GetObject = (id) => {
    // Handle elements
    if (id.startsWith(ELEMENT_ID_PREFIX)) {
      const elementId = id.slice(ELEMENT_ID_PREFIX.length);
      const index = strToInt(elementId);
      assertTrue(elements.has(index), `missing element for id:`, elementId);
      const rawElement = elements.get(index);
      assertDefined(rawElement, `missing element for id:`, elementId);
      if (isComment(rawElement)) {
        if (!rawElement.isConnected) {
          finalized.set(id, undefined);
          return undefined;
        }
        const close = findClose(rawElement);
        const virtual = new VirtualElementImpl(rawElement, close);
        finalized.set(id, virtual);
        getContext(virtual, containerState);
        return virtual;
      } else if (isElement(rawElement)) {
        finalized.set(id, rawElement);
        getContext(rawElement, containerState).$vdom$ = domToVnode(rawElement);
        return rawElement;
      }
      finalized.set(id, rawElement);
      return rawElement;
    }
    const index = strToInt(id);
    const objs = pauseState.objs;
    assertTrue(objs.length > index, 'resume: index is out of bounds', id);
    const value = objs[index];
    let obj = value;
    for (let i = id.length - 1; i >= 0; i--) {
      const code = id[i];
      const transform = OBJECT_TRANSFORMS[code];
      if (!transform) {
        break;
      }
      obj = transform(obj, containerState);
    }
    finalized.set(id, obj);

    if (!isPrimitive(value) && !revived.has(index)) {
      revived.add(index);
      reviveSubscriptions(value, index, pauseState.subs, getObject, containerState, parser);
      reviveNestedObjects(value, getObject, parser);
    }
    return obj;
  };

  containerState.$elementIndex$ = 100000;
  containerState.$pauseCtx$ = {
    getObject,
    meta: pauseState.ctx,
    refs: pauseState.refs,
  };

  reviveValues(pauseState.objs, parser);
  directSetAttribute(containerEl, QContainerAttr, 'resumed');
  logDebug('Container resumed');
  emitEvent(containerEl, 'qresume', undefined, true);
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
  value: any,
  i: any,
  objsSubs: any[],
  getObject: GetObject,
  containerState: ContainerState,
  parser: Parser
) => {
  const subs = objsSubs[i] as string[];
  if (subs) {
    const converted: Subscriptions[] = [];
    let flag = 0;
    for (const sub of subs) {
      if (sub.startsWith('_')) {
        flag = parseInt(sub.slice(1), 10);
      } else {
        const parsed = parseSubscription(sub, getObject);
        if (parsed) {
          converted.push(parsed);
        }
      }
    }
    if (flag > 0) {
      setObjectFlags(value, flag);
    }
    if (!parser.subs(value, converted)) {
      const proxy = containerState.$proxyMap$.get(value);
      if (proxy) {
        getProxyManager(proxy)!.$addSubs$(converted);
      } else {
        createProxy(value, containerState, converted);
      }
    }
  }
};

const reviveNestedObjects = (obj: any, getObject: GetObject, parser: Parser) => {
  if (parser.fill(obj, getObject)) {
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

export const moveStyles = (containerEl: Element, containerState: ContainerState) => {
  const head = containerEl.ownerDocument.head;
  containerEl.querySelectorAll('style[q\\:style]').forEach((el) => {
    containerState.$styleIds$.add(directGetAttribute(el, QStyle)!);
    head.appendChild(el);
  });
};

const unescapeText = (str: string) => {
  return str.replace(/\\x3C(\/?script)/g, '<$1');
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

export const appendQwikDevTools = (containerEl: Element) => {
  (containerEl as any)['qwik'] = {
    pause: () => pauseContainer(containerEl),
    state: _getContainerState(containerEl),
  };
};

export const getID = (stuff: string) => {
  const index = stuff.indexOf('q:id=');
  if (index > 0) {
    return strToInt(stuff.slice(index + 5));
  }
  return -1;
};
