import {
  ComponentStylesPrefixContent,
  ELEMENT_ID,
  OnRenderProp,
  QSlot,
  QSlotRef,
  QSlotS,
} from '../../util/markers';
import { isOnProp, PREVENT_DEFAULT, setEvent } from '../../state/listeners';
import type { ValueOrPromise } from '../../util/types';
import { isPromise, promiseAll, promiseAllLazy, then } from '../../util/promises';
import { assertDefined, assertEqual, assertTrue } from '../../error/assert';
import { logWarn } from '../../util/log';
import { qDev, qSerialize } from '../../util/qdev';
import type { OnRenderFn } from '../../component/component.public';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import { SKIP_RENDER_TYPE } from '../jsx/jsx-runtime';
import { assertQrl, isQrl } from '../../qrl/qrl-class';
import {
  assertElement,
  assertQwikElement,
  isElement,
  isQwikElement,
  isText,
  isVirtualElement,
} from '../../util/element';
import { getVdom, ProcessedJSXNode, ProcessedJSXNodeImpl, renderComponent } from './render-dom';
import type { RenderContext, RenderStaticContext } from '../types';
import {
  parseClassList,
  pushRenderContext,
  serializeClass,
  setQId,
  stringifyStyle,
} from '../execute-component';
import { addQwikEvent, setRef } from '../../container/container';
import {
  getRootNode,
  newVirtualElement,
  processVirtualNodes,
  queryAllVirtualByAttribute,
  QwikElement,
  VIRTUAL,
  VirtualElement,
} from './virtual-element';

import {
  appendChild,
  createElement,
  createTemplate,
  createTextNode,
  executeDOMRender,
  getKey,
  insertBefore,
  prepend,
  removeNode,
  setAttribute,
  setClasslist,
  setKey,
  setProperty,
} from './operations';
import { QOnce } from '../jsx/utils.public';
import { EMPTY_OBJ } from '../../util/flyweight';
import { addSignalSub, isSignal } from '../../state/signal';
import {
  cleanupContext,
  getContext,
  HOST_FLAG_DIRTY,
  HOST_FLAG_NEED_ATTACH_LISTENER,
  QContext,
  tryGetContext,
} from '../../state/context';
import { getProxyManager, getProxyTarget, SubscriptionManager } from '../../state/common';
import { createProxy } from '../../state/store';
import {
  QObjectFlagsSymbol,
  QObjectImmutable,
  _IMMUTABLE,
  _IMMUTABLE_PREFIX,
} from '../../state/constants';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const IS_SVG = 1 << 0;
export const IS_HEAD = 1 << 1;

type KeyToIndexMap = { [key: string]: number };

const CHILDREN_PLACEHOLDER: ProcessedJSXNode[] = [];
type PropHandler = (
  ctx: RenderStaticContext | undefined,
  el: HTMLElement,
  key: string,
  newValue: any,
  oldValue: any
) => boolean;

export type ChildrenMode = 'root' | 'head' | 'elements';

export const visitJsxNode = (
  ctx: RenderContext,
  oldVnode: ProcessedJSXNode,
  newVnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  return smartUpdateChildren(ctx, oldVnode, newVnode, 'root', flags);
};

export const smartUpdateChildren = (
  ctx: RenderContext,
  oldVnode: ProcessedJSXNode,
  newVnode: ProcessedJSXNode,
  mode: ChildrenMode,
  flags: number
) => {
  assertQwikElement(oldVnode.$elm$);

  const ch = newVnode.$children$;
  if (ch.length === 1 && ch[0].$type$ === SKIP_RENDER_TYPE) {
    return;
  }
  const elm = oldVnode.$elm$;
  const needsDOMRead = oldVnode.$children$ === CHILDREN_PLACEHOLDER;
  if (needsDOMRead) {
    const isHead = elm.nodeName === 'HEAD';
    if (isHead) {
      mode = 'head';
      flags |= IS_HEAD;
    }
  }

  const oldCh = getVnodeChildren(oldVnode, mode);
  if (oldCh.length > 0 && ch.length > 0) {
    return updateChildren(ctx, elm, oldCh, ch, flags);
  } else if (ch.length > 0) {
    return addVnodes(ctx, elm, null, ch, 0, ch.length - 1, flags);
  } else if (oldCh.length > 0) {
    return removeVnodes(ctx.$static$, oldCh, 0, oldCh.length - 1);
  }
};

export const getVnodeChildren = (vnode: ProcessedJSXNode, mode: ChildrenMode) => {
  const oldCh = vnode.$children$;
  const elm = vnode.$elm$ as Element;
  if (oldCh === CHILDREN_PLACEHOLDER) {
    return (vnode.$children$ = getChildrenVnodes(elm, mode));
  }
  return oldCh;
};

export const updateChildren = (
  ctx: RenderContext,
  parentElm: QwikElement,
  oldCh: ProcessedJSXNode[],
  newCh: ProcessedJSXNode[],
  flags: number
): ValueOrPromise<void> => {
  let oldStartIdx = 0;
  let newStartIdx = 0;
  let oldEndIdx = oldCh.length - 1;
  let oldStartVnode = oldCh[0] as ProcessedJSXNode | undefined;
  let oldEndVnode = oldCh[oldEndIdx] as ProcessedJSXNode | undefined;
  let newEndIdx = newCh.length - 1;
  let newStartVnode = newCh[0] as ProcessedJSXNode | undefined;
  let newEndVnode = newCh[newEndIdx] as ProcessedJSXNode | undefined;
  let oldKeyToIdx: KeyToIndexMap | undefined;
  let idxInOld: number;
  let elmToMove: ProcessedJSXNode;
  const results: any[] = [];
  const staticCtx = ctx.$static$;

  while (oldStartIdx <= oldEndIdx && newStartIdx <= newEndIdx) {
    if (oldStartVnode == null) {
      oldStartVnode = oldCh[++oldStartIdx]; // Vnode might have been moved left
    } else if (oldEndVnode == null) {
      oldEndVnode = oldCh[--oldEndIdx];
    } else if (newStartVnode == null) {
      newStartVnode = newCh[++newStartIdx];
    } else if (newEndVnode == null) {
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newStartVnode)) {
      results.push(patchVnode(ctx, oldStartVnode, newStartVnode, flags));
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      results.push(patchVnode(ctx, oldEndVnode, newEndVnode, flags));
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newEndVnode)) {
      assertDefined(oldStartVnode.$elm$, 'oldStartVnode $elm$ must be defined');
      assertDefined(oldEndVnode.$elm$, 'oldEndVnode $elm$ must be defined');

      // Vnode moved right
      results.push(patchVnode(ctx, oldStartVnode, newEndVnode, flags));
      insertBefore(staticCtx, parentElm, oldStartVnode.$elm$, oldEndVnode.$elm$.nextSibling);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) {
      assertDefined(oldStartVnode.$elm$, 'oldStartVnode $elm$ must be defined');
      assertDefined(oldEndVnode.$elm$, 'oldEndVnode $elm$ must be defined');

      // Vnode moved left
      results.push(patchVnode(ctx, oldEndVnode, newStartVnode, flags));
      insertBefore(staticCtx, parentElm, oldEndVnode.$elm$, oldStartVnode.$elm$);
      oldEndVnode = oldCh[--oldEndIdx];
      newStartVnode = newCh[++newStartIdx];
    } else {
      if (oldKeyToIdx === undefined) {
        oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
      }
      idxInOld = oldKeyToIdx[newStartVnode.$key$ as string];
      if (idxInOld === undefined) {
        // New element
        const newElm = createElm(ctx, newStartVnode, flags, results);
        insertBefore(staticCtx, parentElm, newElm, oldStartVnode?.$elm$);
      } else {
        elmToMove = oldCh[idxInOld];
        if (!isTagName(elmToMove, newStartVnode.$type$)) {
          const newElm = createElm(ctx, newStartVnode, flags, results);
          then(newElm, (newElm) => {
            insertBefore(staticCtx, parentElm, newElm, oldStartVnode?.$elm$);
          });
        } else {
          results.push(patchVnode(ctx, elmToMove, newStartVnode, flags));
          oldCh[idxInOld] = undefined as any;
          assertDefined(elmToMove.$elm$, 'elmToMove $elm$ must be defined');
          insertBefore(staticCtx, parentElm, elmToMove.$elm$, oldStartVnode.$elm$);
        }
      }
      newStartVnode = newCh[++newStartIdx];
    }
  }

  if (newStartIdx <= newEndIdx) {
    const before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].$elm$;
    results.push(addVnodes(ctx, parentElm, before, newCh, newStartIdx, newEndIdx, flags));
  }

  let wait = promiseAll(results) as any;
  if (oldStartIdx <= oldEndIdx) {
    wait = then(wait, () => {
      removeVnodes(staticCtx, oldCh, oldStartIdx, oldEndIdx);
    });
  }
  return wait;
};

const getCh = (elm: QwikElement, filter: (el: Node | VirtualElement) => boolean) => {
  const end = isVirtualElement(elm) ? elm.close : null;

  const nodes: (Node | VirtualElement)[] = [];
  let node: Node | null | VirtualElement = elm.firstChild;
  while ((node = processVirtualNodes(node))) {
    if (filter(node)) {
      nodes.push(node);
    }
    node = node.nextSibling;
    if (node === end) {
      break;
    }
  }
  return nodes;
};

export const getChildren = (elm: QwikElement, mode: ChildrenMode): (Node | VirtualElement)[] => {
  // console.warn('DOM READ: getChildren()', elm);
  switch (mode) {
    case 'root':
      return getCh(elm, isChildComponent);
    case 'head':
      return getCh(elm, isHeadChildren);
    case 'elements':
      return getCh(elm, isQwikElement);
  }
};

export const getChildrenVnodes = (elm: QwikElement, mode: ChildrenMode) => {
  return getChildren(elm, mode).map(getVnodeFromEl);
};

export const getVnodeFromEl = (el: Node | VirtualElement) => {
  if (isElement(el)) {
    return tryGetContext(el)?.$vdom$ ?? domToVnode(el);
  }
  return domToVnode(el);
};

export const domToVnode = (node: Node | VirtualElement): ProcessedJSXNode => {
  if (isQwikElement(node)) {
    const props = isVirtualElement(node) ? EMPTY_OBJ : getProps(node);
    const t = new ProcessedJSXNodeImpl(node.localName, props, CHILDREN_PLACEHOLDER, getKey(node));
    t.$elm$ = node;
    return t;
  } else if (isText(node)) {
    const t = new ProcessedJSXNodeImpl(node.nodeName, {}, CHILDREN_PLACEHOLDER, null);
    t.$text$ = node.data;
    t.$elm$ = node;
    return t;
  }
  throw new Error('invalid node');
};

export const getProps = (node: Element) => {
  const props: Record<string, any> = {};
  const attributes = node.attributes;
  const len = attributes.length;
  for (let i = 0; i < len; i++) {
    const attr = attributes.item(i);
    assertDefined(attr, 'attribute must be defined');

    const name = attr.name;
    if (!name.includes(':')) {
      if (name === 'class') {
        props[name] = parseDomClass(attr.value);
      } else {
        props[name] = attr.value;
      }
    }
  }
  return props;
};

const parseDomClass = (value: string): string => {
  return parseClassList(value)
    .filter((c) => !c.startsWith(ComponentStylesPrefixContent))
    .join(' ');
};

export const isNode = (elm: Node | VirtualElement): boolean => {
  const type = elm.nodeType;
  return type === 1 || type === 3 || type === 111;
};

const isHeadChildren = (node: Node | VirtualElement): boolean => {
  const type = node.nodeType;
  if (type === 1) {
    return (node as Element).hasAttribute('q:head');
  }
  return type === 111;
};

export const isSlotTemplate = (node: Node | VirtualElement): node is Element => {
  return node.nodeName === 'Q:TEMPLATE';
};

const isChildComponent = (node: Node | VirtualElement): boolean => {
  const type = node.nodeType;
  if (type === 3 || type === 111) {
    return true;
  }
  if (type !== 1) {
    return false;
  }
  const nodeName = node.nodeName;
  if (nodeName === 'Q:TEMPLATE') {
    return false;
  }
  if (nodeName === 'HEAD') {
    return (node as Element).hasAttribute('q:head');
  }
  return true;
};

export const splitChildren = (input: ProcessedJSXNode[]): Record<string, ProcessedJSXNode> => {
  const output: Record<string, ProcessedJSXNode> = {};
  for (const item of input) {
    const key = getSlotName(item);
    const node =
      output[key] ??
      (output[key] = new ProcessedJSXNodeImpl(
        VIRTUAL,
        {
          [QSlotS]: '',
        },
        [],
        key
      ));
    node.$children$.push(item);
  }
  return output;
};

export const patchVnode = (
  rCtx: RenderContext,
  oldVnode: ProcessedJSXNode,
  newVnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  assertEqual(oldVnode.$type$, newVnode.$type$, 'old and new vnodes type must be the same');

  const elm = oldVnode.$elm$;
  const tag = newVnode.$type$;
  const staticCtx = rCtx.$static$;
  const isVirtual = tag === VIRTUAL;
  const currentComponent = rCtx.$cmpCtx$;
  assertDefined(elm, 'while patching element must be defined');
  assertDefined(currentComponent, 'while patching current component must be defined');

  newVnode.$elm$ = elm;

  // Render text nodes
  if (tag === '#text') {
    const signal = newVnode.$signal$;
    if (signal) {
      addSignalSub(2, currentComponent.$element$, signal, elm as Text, 'data');
    }
    if (oldVnode.$text$ !== newVnode.$text$) {
      setProperty(staticCtx, elm, 'data', newVnode.$text$);
    }
    return;
  }
  assertQwikElement(elm);

  // Track SVG state
  let isSvg = !!(flags & IS_SVG);
  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }

  const props = newVnode.$props$;
  const isComponent = isVirtual && OnRenderProp in props;
  const elCtx = getContext(elm);
  assertDefined(currentComponent, 'slots can not be rendered outside a component', elm);
  if (!isComponent) {
    const pendingListeners = currentComponent.li;
    const listeners = elCtx.li;
    listeners.length = 0;
    newVnode.$props$ = updateProperties(
      staticCtx,
      elCtx,
      currentComponent.$element$,
      oldVnode.$props$,
      props,
      isSvg
    );
    if (pendingListeners.length > 0) {
      listeners.push(...pendingListeners);
      pendingListeners.length = 0;
    }

    if (isSvg && newVnode.$type$ === 'foreignObject') {
      flags &= ~IS_SVG;
      isSvg = false;
    }

    const isSlot = isVirtual && QSlotS in props;
    if (isSlot) {
      assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');
      currentComponent.$slots$.push(newVnode);
      return;
    }
    const setsInnerHTML = props[dangerouslySetInnerHTML] !== undefined;
    if (setsInnerHTML) {
      if (qDev && newVnode.$children$.length > 0) {
        logWarn('Node can not have children when innerHTML is set');
      }
      return;
    }
    const isRenderOnce = isVirtual && QOnce in props;
    if (isRenderOnce) {
      return;
    }
    return smartUpdateChildren(rCtx, oldVnode, newVnode, 'root', flags);
  }

  const cmpProps = props.props;
  let needsRender = setComponentProps(elCtx, rCtx, cmpProps);

  // TODO: review this corner case
  if (!needsRender && !elCtx.$componentQrl$ && !elCtx.$element$.hasAttribute(ELEMENT_ID)) {
    setQId(rCtx, elCtx);
    elCtx.$componentQrl$ = cmpProps[OnRenderProp];
    assertQrl(elCtx.$componentQrl$ as any);
    needsRender = true;
  }

  // Rendering of children of component is more complicated,
  // since the children must be projected into the rendered slots
  // In addition, nested childen might need rerendering, if that's the case
  // we need to render the nested component, and wait before projecting the content
  // since otherwise we don't know where the slots
  if (needsRender) {
    return then(renderComponent(rCtx, elCtx, flags), () =>
      renderContentProjection(rCtx, elCtx, newVnode, flags)
    );
  }
  return renderContentProjection(rCtx, elCtx, newVnode, flags);
};

const renderContentProjection = (
  rCtx: RenderContext,
  hostCtx: QContext,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  const newChildren = vnode.$children$;
  const staticCtx = rCtx.$static$;
  const splittedNewChidren = splitChildren(newChildren);
  const slotRctx = pushRenderContext(rCtx, hostCtx);
  const slotMaps = getSlotMap(hostCtx);

  // Remove content from empty slots
  for (const key of Object.keys(slotMaps.slots)) {
    if (!splittedNewChidren[key]) {
      const slotEl = slotMaps.slots[key];
      const oldCh = getChildrenVnodes(slotEl, 'root');
      if (oldCh.length > 0) {
        const slotCtx = tryGetContext(slotEl);
        if (slotCtx && slotCtx.$vdom$) {
          slotCtx.$vdom$.$children$ = [];
        }
        removeVnodes(staticCtx, oldCh, 0, oldCh.length - 1);
      }
    }
  }

  // Remove empty templates
  for (const key of Object.keys(slotMaps.templates)) {
    const templateEl = slotMaps.templates[key];
    if (templateEl) {
      if (!splittedNewChidren[key] || slotMaps.slots[key]) {
        removeNode(staticCtx, templateEl);
        slotMaps.templates[key] = undefined;
      }
    }
  }

  // Render into slots
  return promiseAll(
    Object.keys(splittedNewChidren).map((key) => {
      const newVdom = splittedNewChidren[key];
      const slotElm = getSlotElement(staticCtx, slotMaps, hostCtx.$element$, key);
      const slotCtx = getContext(slotElm);
      const oldVdom = getVdom(slotCtx);
      slotCtx.$vdom$ = newVdom;
      newVdom.$elm$ = slotElm;
      return smartUpdateChildren(slotRctx, oldVdom, newVdom, 'root', flags);
    })
  ) as any;
};

const addVnodes = (
  ctx: RenderContext,
  parentElm: QwikElement,
  before: Node | VirtualElement | null,
  vnodes: ProcessedJSXNode[],
  startIdx: number,
  endIdx: number,
  flags: number
): ValueOrPromise<void> => {
  const promises: Promise<any>[] = [];
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    assertDefined(ch, 'render: node must be defined at index', startIdx, vnodes);
    const elm = createElm(ctx, ch, flags, promises);
    insertBefore(ctx.$static$, parentElm, elm, before);
  }
  return promiseAllLazy(promises);
};

const removeVnodes = (
  ctx: RenderStaticContext,
  nodes: ProcessedJSXNode[],
  startIdx: number,
  endIdx: number
): void => {
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = nodes[startIdx];
    if (ch) {
      assertDefined(ch.$elm$, 'vnode elm must be defined');
      removeNode(ctx, ch.$elm$);
    }
  }
};

const getSlotElement = (
  ctx: RenderStaticContext,
  slotMaps: SlotMaps,
  parentEl: QwikElement,
  slotName: string
): QwikElement => {
  const slotEl = slotMaps.slots[slotName];
  if (slotEl) {
    return slotEl;
  }
  const templateEl = slotMaps.templates[slotName];
  if (templateEl) {
    return templateEl;
  }
  const template = createTemplate(ctx.$doc$, slotName);
  prepend(ctx, parentEl, template);
  slotMaps.templates[slotName] = template;
  return template;
};

const getSlotName = (node: ProcessedJSXNode): string => {
  return node.$props$[QSlot] ?? '';
};

const createElm = (
  rCtx: RenderContext,
  vnode: ProcessedJSXNode,
  flags: number,
  promises: Promise<any>[]
): Node | VirtualElement => {
  const tag = vnode.$type$;
  const doc = rCtx.$static$.$doc$;
  const currentComponent = rCtx.$cmpCtx$;
  if (tag === '#text') {
    const signal = vnode.$signal$;
    const elm = createTextNode(doc, vnode.$text$!);
    if (signal && currentComponent) {
      addSignalSub(2, currentComponent.$element$, signal, elm, 'data');
    }
    return (vnode.$elm$ = elm);
  }

  let elm: QwikElement;
  let isHead = !!(flags & IS_HEAD);
  let isSvg = !!(flags & IS_SVG);
  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }
  const isVirtual = tag === VIRTUAL;
  const props = vnode.$props$;
  const isComponent = OnRenderProp in props;
  const staticCtx = rCtx.$static$;
  if (isVirtual) {
    elm = newVirtualElement(doc);
  } else if (tag === 'head') {
    elm = doc.head;
    flags |= IS_HEAD;
    isHead = true;
  } else {
    elm = createElement(doc, tag, isSvg);
    flags &= ~IS_HEAD;
  }

  vnode.$elm$ = elm;
  if (isSvg && tag === 'foreignObject') {
    isSvg = false;
    flags &= ~IS_SVG;
  }
  const elCtx = getContext(elm);
  if (isComponent) {
    setKey(elm, vnode.$key$);
    assertTrue(isVirtual, 'component must be a virtual element');
    const renderQRL = props[OnRenderProp];
    assertQrl<OnRenderFn<any>>(renderQRL);
    setComponentProps(elCtx, rCtx, props.props);
    setQId(rCtx, elCtx);

    // Run mount hook
    elCtx.$componentQrl$ = renderQRL;

    const wait = then(renderComponent(rCtx, elCtx, flags), () => {
      let children = vnode.$children$;
      if (children.length === 0) {
        return;
      }
      if (children.length === 1 && children[0].$type$ === SKIP_RENDER_TYPE) {
        children = children[0].$children$;
      }
      const slotRctx = pushRenderContext(rCtx, elCtx);
      const slotMap = getSlotMap(elCtx);
      const p: Promise<void>[] = [];
      for (const node of children) {
        const nodeElm = createElm(slotRctx, node, flags, p);
        assertDefined(node.$elm$, 'vnode elm must be defined');
        assertEqual(nodeElm, node.$elm$, 'vnode elm must be defined');

        appendChild(staticCtx, getSlotElement(staticCtx, slotMap, elm, getSlotName(node)), nodeElm);
      }

      return promiseAllLazy(p);
    });
    if (isPromise(wait)) {
      promises.push(wait);
    }
    return elm;
  }

  const isSlot = isVirtual && QSlotS in props;
  const hasRef = !isVirtual && 'ref' in props;
  const listeners = elCtx.li;
  vnode.$props$ = setProperties(staticCtx, elCtx, currentComponent?.$element$, props, isSvg);

  if (currentComponent && !isVirtual) {
    const scopedIds = currentComponent.$scopeIds$;
    if (scopedIds) {
      scopedIds.forEach((styleId) => {
        (elm as Element).classList.add(styleId);
      });
    }
    if (currentComponent.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
      listeners.push(...currentComponent.li);
      currentComponent.$flags$ &= ~HOST_FLAG_NEED_ATTACH_LISTENER;
    }
  }

  if (isSlot) {
    assertDefined(currentComponent, 'slot can only be used inside component');
    assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');
    setKey(elm, vnode.$key$);

    directSetAttribute(elm, QSlotRef, currentComponent.$id$);
    currentComponent.$slots$.push(vnode);
    staticCtx.$addSlots$.push([elm, currentComponent.$element$]);
  }

  if (qSerialize) {
    setKey(elm, vnode.$key$);

    if (isHead && !isVirtual) {
      directSetAttribute(elm as Element, 'q:head', '');
    }
    if (listeners.length > 0 || hasRef) {
      setQId(rCtx, elCtx);
    }
  }

  const setsInnerHTML = props[dangerouslySetInnerHTML] !== undefined;
  if (setsInnerHTML) {
    if (qDev && vnode.$children$.length > 0) {
      logWarn('Node can not have children when innerHTML is set');
    }
    return elm;
  }
  let children = vnode.$children$;
  if (children.length === 0) {
    return elm;
  }
  if (children.length === 1 && children[0].$type$ === SKIP_RENDER_TYPE) {
    children = children[0].$children$;
  }
  const nodes = children.map((ch) => createElm(rCtx, ch, flags, promises));
  for (const node of nodes) {
    directAppendChild(elm, node);
  }
  return elm;
};

interface SlotMaps {
  slots: Record<string, QwikElement>;
  templates: Record<string, Element | undefined>;
}

const getSlots = (elCtx: QContext): ProcessedJSXNode[] => {
  const slots = elCtx.$slots$;
  if (!slots) {
    const parent = elCtx.$element$.parentElement;
    assertDefined(parent, 'component should be already attached to the dom');
    return (elCtx.$slots$ = readDOMSlots(elCtx));
  }
  return slots;
};

const getSlotMap = (elCtx: QContext) => {
  const slotsArray = getSlots(elCtx);
  const slots: Record<string, QwikElement> = {};
  const templates: Record<string, Element | undefined> = {};
  const t = Array.from(elCtx.$element$.childNodes).filter(isSlotTemplate);

  // Map virtual slots
  for (const vnode of slotsArray) {
    assertQwikElement(vnode.$elm$);
    slots[vnode.$key$ ?? ''] = vnode.$elm$;
  }
  // Map templates
  for (const elm of t) {
    templates[directGetAttribute(elm, QSlot) ?? ''] = elm;
  }
  return { slots, templates };
};

const readDOMSlots = (elCtx: QContext): ProcessedJSXNode[] => {
  const parent = elCtx.$element$.parentElement;
  assertDefined(parent, 'component should be already attached to the dom');
  return queryAllVirtualByAttribute(parent, QSlotRef, elCtx.$id$).map(domToVnode);
};

const handleStyle: PropHandler = (ctx, elm, _, newValue) => {
  setProperty(ctx, elm.style, 'cssText', stringifyStyle(newValue));
  return true;
};

const handleClass: PropHandler = (ctx, elm, _, newValue, oldValue) => {
  assertTrue(
    oldValue == null || typeof oldValue === 'string',
    'class oldValue must be either nullish or string',
    oldValue
  );
  assertTrue(
    newValue == null || typeof newValue === 'string',
    'class newValue must be either nullish or string',
    newValue
  );

  const oldClasses = parseClassList(oldValue);
  const newClasses = parseClassList(newValue);
  setClasslist(
    ctx,
    elm,
    oldClasses.filter((c) => c && !newClasses.includes(c)),
    newClasses.filter((c) => c && !oldClasses.includes(c))
  );
  return true;
};

const checkBeforeAssign: PropHandler = (ctx, elm, prop, newValue) => {
  if (prop in elm) {
    if ((elm as any)[prop] !== newValue) {
      setProperty(ctx, elm, prop, newValue);
    }
  }
  return true;
};

const forceAttribute: PropHandler = (ctx, elm, prop, newValue) => {
  setAttribute(ctx, elm, prop.toLowerCase(), newValue);
  return true;
};

const dangerouslySetInnerHTML = 'dangerouslySetInnerHTML';
const setInnerHTML: PropHandler = (ctx, elm, _, newValue) => {
  if (dangerouslySetInnerHTML in elm) {
    setProperty(ctx, elm, dangerouslySetInnerHTML, newValue);
  } else if ('innerHTML' in elm) {
    setProperty(ctx, elm, 'innerHTML', newValue);
  }
  return true;
};

const noop: PropHandler = () => {
  return true;
};

export const PROP_HANDLER_MAP: Record<string, PropHandler | undefined> = {
  style: handleStyle,
  class: handleClass,
  value: checkBeforeAssign,
  checked: checkBeforeAssign,
  href: forceAttribute,
  list: forceAttribute,
  form: forceAttribute,
  tabIndex: forceAttribute,
  download: forceAttribute,
  [dangerouslySetInnerHTML]: setInnerHTML,
  innerHTML: noop,
};

export const updateProperties = (
  staticCtx: RenderStaticContext,
  elCtx: QContext,
  hostElm: QwikElement,
  oldProps: Record<string, any>,
  newProps: Record<string, any>,
  isSvg: boolean
): Record<string, any> => {
  const keys = getKeys(oldProps, newProps);
  const values: Record<string, any> = {};
  if (keys.length === 0) {
    return values;
  }
  const immutableMeta = (newProps as any)[_IMMUTABLE] ?? EMPTY_OBJ;
  const elm = elCtx.$element$;
  for (let prop of keys) {
    if (prop === 'ref') {
      assertElement(elm);
      setRef(newProps[prop], elm);
      continue;
    }

    let newValue = isSignal(immutableMeta[prop]) ? immutableMeta[prop] : newProps[prop];
    if (isOnProp(prop)) {
      browserSetEvent(staticCtx, elCtx, prop, newValue);
      continue;
    }

    if (prop === 'className') {
      prop = 'class';
    }
    if (isSignal(newValue)) {
      addSignalSub(1, hostElm, newValue, elm, prop);
      newValue = newValue.value;
    }
    if (prop === 'class') {
      newProps['class'] = newValue = serializeClass(newValue);
    }
    const normalizedProp = isSvg ? prop : prop.toLowerCase();
    const oldValue = oldProps[normalizedProp];
    values[normalizedProp] = newValue;

    if (oldValue === newValue) {
      continue;
    }
    smartSetProperty(staticCtx, elm as HTMLElement, prop, newValue, oldValue, isSvg);
  }
  return values;
};

export const smartSetProperty = (
  staticCtx: RenderStaticContext,
  elm: QwikElement,
  prop: string,
  newValue: any,
  oldValue: any,
  isSvg: boolean
) => {
  // Check if its an exception
  const exception = PROP_HANDLER_MAP[prop];
  if (exception) {
    if (exception(staticCtx, elm as HTMLElement, prop, newValue, oldValue)) {
      return;
    }
  }

  // Check if property in prototype
  if (!isSvg && prop in elm) {
    setProperty(staticCtx, elm, prop, newValue);
    return;
  }

  if (prop.startsWith(PREVENT_DEFAULT)) {
    addQwikEvent(prop.slice(PREVENT_DEFAULT.length), staticCtx.$containerState$);
  }

  // Fallback to render attribute
  setAttribute(staticCtx, elm, prop, newValue);
};

const getKeys = (oldProps: Record<string, any>, newProps: Record<string, any>) => {
  const keys = Object.keys(newProps);
  const normalizedKeys = keys.map((s) => s.toLowerCase());
  const oldKeys = Object.keys(oldProps);
  keys.push(...oldKeys.filter((p) => !normalizedKeys.includes(p)));
  return keys.filter((c) => c !== 'children');
};

export const areExactQRLs = (oldValue: any, newValue: any) => {
  if (!isQrl(oldValue) || !isQrl(newValue) || oldValue.$hash$ !== newValue.$hash$) {
    return false;
  }
  const cA = oldValue.$captureRef$;
  const cB = newValue.$captureRef$;
  if (cA && cB) {
    return sameArrays(cA, cB);
  }
  return false;
};

export const sameArrays = (a1: any[], a2: any[]) => {
  const len = a1.length;
  if (len !== a2.length) {
    return false;
  }

  for (let i = 0; i < len; i++) {
    if (a1[i] !== a2[i]) {
      return false;
    }
  }
  return true;
};

export const setProperties = (
  staticCtx: RenderStaticContext,
  elCtx: QContext,
  hostElm: QwikElement | undefined,
  newProps: Record<string, any>,
  isSvg: boolean
): Record<string, any> => {
  const elm = elCtx.$element$;
  const keys = Object.keys(newProps);
  const values: Record<string, any> = {};
  if (keys.length === 0) {
    return values;
  }
  const immutableMeta = (newProps as any)[_IMMUTABLE] ?? EMPTY_OBJ;
  for (let prop of keys) {
    if (prop === 'children') {
      continue;
    }
    if (prop === 'ref') {
      assertElement(elm);
      setRef(newProps[prop], elm);
      continue;
    }

    let newValue = isSignal(immutableMeta[prop]) ? immutableMeta[prop] : newProps[prop];
    if (isOnProp(prop)) {
      browserSetEvent(staticCtx, elCtx, prop, newValue);
      continue;
    }

    if (prop === 'className') {
      prop = 'class';
    }
    if (hostElm && isSignal(newValue)) {
      addSignalSub(1, hostElm, newValue, elm, prop);
      newValue = newValue.value;
    }
    if (prop === 'class') {
      newValue = serializeClass(newValue);
    }
    const normalizedProp = isSvg ? prop : prop.toLowerCase();
    values[normalizedProp] = newValue;
    smartSetProperty(staticCtx, elm, prop, newValue, undefined, isSvg);
  }
  return values;
};

export const setComponentProps = (
  elCtx: QContext,
  rCtx: RenderContext,
  expectProps: Record<string, any>
) => {
  const keys = Object.keys(expectProps);
  let props = elCtx.$props$;
  if (!props) {
    elCtx.$props$ = props = createProxy(
      {
        [QObjectFlagsSymbol]: QObjectImmutable,
      },
      rCtx.$static$.$containerState$
    );
  }
  if (keys.length === 0) {
    return false;
  }

  const manager = getProxyManager(props);
  assertDefined(manager, `props have to be a proxy, but it is not`, props);
  const target = getProxyTarget(props);
  assertDefined(target, `props have to be a proxy, but it is not`, props);

  const immutableMeta = ((target as any)[_IMMUTABLE] =
    (expectProps as any)[_IMMUTABLE] ?? EMPTY_OBJ);

  for (const prop of keys) {
    if (prop === 'children' || prop === QSlot) {
      continue;
    }
    if (isSignal(immutableMeta[prop])) {
      target[_IMMUTABLE_PREFIX + prop] = immutableMeta[prop];
    } else {
      const value = expectProps[prop];
      const oldValue = target[prop];
      target[prop] = value;
      if (oldValue !== value) {
        manager.$notifySubs$(prop);
      }
    }
  }
  return !!(elCtx.$flags$ & HOST_FLAG_DIRTY);
};

export const cleanupTree = (
  parent: QwikElement,
  staticCtx: RenderStaticContext,
  subsManager: SubscriptionManager,
  stopSlots: boolean
) => {
  if (stopSlots && parent.hasAttribute(QSlotS)) {
    staticCtx.$rmSlots$.push(parent);
    return;
  }
  const ctx = tryGetContext(parent);
  if (ctx) {
    cleanupContext(ctx, subsManager);
  }
  const ch = getChildren(parent, 'elements');
  for (const child of ch) {
    cleanupTree(child as QwikElement, staticCtx, subsManager, true);
  }
};

export const executeContextWithSlots = ({ $static$: ctx }: RenderContext) => {
  executeDOMRender(ctx);
};

export const directAppendChild = (parent: QwikElement, child: Node | VirtualElement) => {
  if (isVirtualElement(child)) {
    child.appendTo(parent);
  } else {
    parent.appendChild(child);
  }
};

export const directRemoveChild = (parent: QwikElement, child: Node | VirtualElement) => {
  if (isVirtualElement(child)) {
    child.remove();
  } else {
    parent.removeChild(child);
  }
};

export const directInsertBefore = (
  parent: QwikElement,
  child: Node | VirtualElement,
  ref: Node | VirtualElement | null
) => {
  if (isVirtualElement(child)) {
    child.insertBeforeTo(parent, getRootNode(ref));
  } else {
    parent.insertBefore(child, getRootNode(ref));
  }
};

const createKeyToOldIdx = (
  children: ProcessedJSXNode[],
  beginIdx: number,
  endIdx: number
): KeyToIndexMap => {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const child = children[i];
    const key = child.$key$;
    if (key != null) {
      map[key as string] = i;
    }
  }
  return map;
};

const browserSetEvent = (
  staticCtx: RenderStaticContext,
  elCtx: QContext,
  prop: string,
  input: any
) => {
  const containerState = staticCtx.$containerState$;
  const normalized = setEvent(elCtx.li, prop, input, containerState.$containerEl$);
  if (!prop.startsWith('on')) {
    setAttribute(staticCtx, elCtx.$element$, normalized, '');
  }
  addQwikEvent(normalized, containerState);
};

const sameVnode = (vnode1: ProcessedJSXNode, vnode2: ProcessedJSXNode): boolean => {
  if (vnode1.$type$ !== vnode2.$type$) {
    return false;
  }
  return vnode1.$key$ === vnode2.$key$;
};

const isTagName = (elm: ProcessedJSXNode, tagName: string): boolean => {
  return elm.$type$ === tagName;
};
