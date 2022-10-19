import { assertDefined, assertTrue } from '../error/assert';
import { getDocument } from '../util/dom';
import { assertElement, assertQwikElement, isComment, isElement, isText } from '../util/element';
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
  FILTER_ACCEPT,
  FILTER_REJECT,
  FILTER_SKIP,
  getContainerState,
  GetObject,
  isContainer,
  SHOW_COMMENT,
  SHOW_ELEMENT,
  SnapshotState,
  strToInt,
} from './container';
import { findClose, QwikElement, VirtualElementImpl } from '../render/dom/virtual-element';
import { getDomListeners } from '../state/listeners';
import { domToVnode } from '../render/dom/visitor';
import { parseSubscription, Subscriptions } from '../state/common';
import { createProxy } from '../state/store';
import { qSerialize } from '../util/qdev';
import { pauseContainer } from './pause';
import { getContext, HOST_FLAG_MOUNTED } from '../state/context';
import { QObjectFlagsSymbol } from '../state/constants';

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
      elCtx.$flags$ = HOST_FLAG_MOUNTED;
      elCtx.$props$ = getObject(props);
      elCtx.$componentQrl$ = getObject(renderQrl);
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
