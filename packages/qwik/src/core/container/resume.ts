import { assertDefined, assertTrue } from '../error/assert';
import { getDocument } from '../util/dom';
import { assertElement, assertQwikElement, isElement, isText } from '../util/element';
import { logDebug, logWarn } from '../util/log';
import {
  ELEMENT_ID,
  ELEMENT_ID_PREFIX,
  QContainerAttr,
  QScopedStyle,
  QStyle,
} from '../util/markers';

import { emitEvent } from '../util/event';

import { isArray, isSerializableObject, isString } from '../util/types';
import { directGetAttribute, directSetAttribute } from '../render/fast-calls';
import { createParser, OBJECT_TRANSFORMS, Parser, UNDEFINED_PREFIX } from './serializers';
import {
  ContainerState,
  getContainerState,
  GetObject,
  isContainer,
  SHOW_COMMENT,
  SnapshotState,
  strToInt,
} from './container';
import { findClose, QwikElement, VirtualElementImpl } from '../render/dom/virtual-element';
import { getDomListeners } from '../state/listeners';
import { parseSubscription, Subscriptions } from '../state/common';
import { createProxy } from '../state/store';
import { qSerialize } from '../util/qdev';
import { pauseContainer } from './pause';
import { getContext, HOST_FLAG_MOUNTED } from '../state/context';
import { QObjectFlagsSymbol, QObjectImmutable } from '../state/constants';
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

  const pauseState = JSON.parse(unescapeText(script.textContent || '{}')) as SnapshotState;

  // Collect all elements
  const elements = new Map<number, QwikElement | Node>();
  let node: Comment | null = null;
  let container = 0;

  // Collect all virtual elements
  const elementWalker = doc.createNodeIterator(containerEl, SHOW_COMMENT);

  while ((node = elementWalker.nextNode() as Comment)) {
    const data = node.data;
    if (container === 0) {
      if (data.startsWith('qv ')) {
        const close = findClose(node);
        const virtual = new VirtualElementImpl(node, close);
        const id = directGetAttribute(virtual, ELEMENT_ID);
        if (id) {
          const elCtx = getContext(virtual, containerState);
          const index = strToInt(id);
          elCtx.$id$ = id;
          elements.set(index, virtual);
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

    assertElement(el);
    const id = directGetAttribute(el, ELEMENT_ID);
    assertDefined(id, `resume: element missed q:id`, el);
    const elCtx = getContext(el, containerState);
    elCtx.$id$ = id;
    elCtx.$vdom$ = domToVnode(el);
    elements.set(strToInt(id), el);
    maxId = Math.max(maxId, strToInt(id));
  });
  containerState.$elementIndex$ = maxId;

  const parser = createParser(containerState, doc);

  const getObject: GetObject = (id) => {
    return getObjectImpl(id, elements, pauseState.objs, containerState);
  };

  // Revive proxies with subscriptions into the proxymap
  reviveValues(pauseState.objs, parser);

  reviveSubscriptions(pauseState.objs, pauseState.subs, getObject, containerState, parser);

  // Rebuild target objects
  for (const obj of pauseState.objs) {
    reviveNestedObjects(obj, getObject, parser);
  }

  for (const elementID of Object.keys(pauseState.ctx)) {
    const ctxMeta = pauseState.ctx[elementID];
    const index = strToInt(elementID);
    const el = elements.get(index);
    assertDefined(el, `resume: cant find dom node for id`, elementID);
    assertQwikElement(el);
    const elCtx = getContext(el, containerState);
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
      const [renderQrl, props] = host.split(' ') as [string | undefined, string | undefined];
      const styleIds = el.getAttribute(QScopedStyle);
      assertDefined(renderQrl, `resume: renderQRL missing in host metadata`, host);
      elCtx.$scopeIds$ = styleIds ? styleIds.split(' ') : null;
      elCtx.$flags$ = HOST_FLAG_MOUNTED;
      elCtx.$componentQrl$ = getObject(renderQrl);
      if (props) {
        elCtx.$props$ = getObject(props);
      } else {
        elCtx.$props$ = createProxy(
          {
            [QObjectFlagsSymbol]: QObjectImmutable,
          },
          containerState
        );
      }
    }
  }

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

const getObjectImpl = (
  id: string,
  elements: Map<number, QwikElement | Node>,
  objs: any[],
  containerState: ContainerState
) => {
  assertTrue(
    typeof id === 'string' && id.length > 0,
    'resume: id must be an non-empty string, got:',
    id
  );

  if (id.startsWith(ELEMENT_ID_PREFIX)) {
    const index = strToInt(id.slice(ELEMENT_ID_PREFIX.length));
    assertTrue(elements.has(index), `missing element for id:`, index);
    return elements.get(index);
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

export const moveStyles = (containerEl: Element, containerState: ContainerState) => {
  const head = containerEl.ownerDocument.head;
  containerEl.querySelectorAll('style[q\\:style]').forEach((el) => {
    containerState.$styleIds$.add(directGetAttribute(el, QStyle)!);
    head.appendChild(el);
  });
};

export const unescapeText = (str: string) => {
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
    state: getContainerState(containerEl),
  };
};

export const getID = (stuff: string) => {
  const index = stuff.indexOf('q:id=');
  if (index > 0) {
    return strToInt(stuff.slice(index + 5));
  }
  return -1;
};
