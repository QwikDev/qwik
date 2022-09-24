import {
  ComponentStylesPrefixContent,
  ELEMENT_ID,
  OnRenderProp,
  QSlot,
  QSlotRef,
  QSlotS,
} from '../../util/markers';
import {
  cleanupContext,
  getContext,
  getPropsMutator,
  QContext,
  tryGetContext,
} from '../../props/props';
import { addQRLListener, isOnProp, setEvent } from '../../props/props-on';
import type { ValueOrPromise } from '../../util/types';
import { isPromise, promiseAll, then } from '../../util/promises';
import { assertDefined, assertEqual, assertTrue } from '../../assert/assert';
import { logWarn } from '../../util/log';
import { qDev, qSerialize } from '../../util/qdev';
import type { OnRenderFn } from '../../component/component.public';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import { SKIP_RENDER_TYPE } from '../jsx/jsx-runtime';
import { assertQrl, isQrl, QRLInternal } from '../../import/qrl-class';
import {
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
  SKIPS_PROPS,
  stringifyStyle,
} from '../execute-component';
import type { SubscriptionManager } from '../container';
import type { Ref } from '../../use/use-ref';
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
import { serializeQRLs } from '../../import/qrl';
import { QOnce } from '../jsx/utils.public';
import { EMPTY_OBJ } from '../../util/flyweight';
import { getEventName } from '../../object/store';

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
  let oldStartVnode = oldCh[0];
  let oldEndVnode = oldCh[oldEndIdx];
  let newEndIdx = newCh.length - 1;
  let newStartVnode = newCh[0];
  let newEndVnode = newCh[newEndIdx];
  let oldKeyToIdx: KeyToIndexMap | undefined;
  let idxInOld: number;
  let elmToMove: ProcessedJSXNode;
  const results = [];
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
        const newElm = createElm(ctx, newStartVnode, flags);
        results.push(
          then(newElm, (newElm) => {
            insertBefore(staticCtx, parentElm, newElm, oldStartVnode.$elm$);
          })
        );
      } else {
        elmToMove = oldCh[idxInOld];
        if (!isTagName(elmToMove, newStartVnode.$type$)) {
          const newElm = createElm(ctx, newStartVnode, flags);
          results.push(
            then(newElm, (newElm) => {
              insertBefore(staticCtx, parentElm, newElm, oldStartVnode.$elm$);
            })
          );
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
      props[name] = name === 'class' ? parseDomClass(attr.value) : attr.value;
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
  rctx: RenderContext,
  oldVnode: ProcessedJSXNode,
  newVnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  assertEqual(oldVnode.$type$, newVnode.$type$, 'old and new vnodes type must be the same');

  const elm = oldVnode.$elm$;
  const tag = newVnode.$type$;
  const staticCtx = rctx.$static$;
  const isVirtual = tag === VIRTUAL;
  newVnode.$elm$ = elm;

  // Render text nodes
  if (tag === '#text') {
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
  if (!isComponent) {
    const listenerMap = updateProperties(elCtx, staticCtx, oldVnode.$props$, props, isSvg);
    const currentComponent = rctx.$cmpCtx$;
    if (currentComponent && !currentComponent.$attachedListeners$) {
      currentComponent.$attachedListeners$ = true;
      for (const key of Object.keys(currentComponent.li)) {
        addQRLListener(listenerMap, key, currentComponent.li[key]);
        addGlobalListener(staticCtx, elm, key);
      }
    }
    if (qSerialize) {
      for (const key of Object.keys(listenerMap)) {
        setAttribute(staticCtx, elm, key, serializeQRLs(listenerMap[key], elCtx));
      }
    }

    if (isSvg && newVnode.$type$ === 'foreignObject') {
      flags &= ~IS_SVG;
      isSvg = false;
    }
    const isSlot = isVirtual && QSlotS in props;
    if (isSlot) {
      const currentComponent = rctx.$cmpCtx$;
      assertDefined(currentComponent, 'slots can not be rendered outside a component');
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
    return smartUpdateChildren(rctx, oldVnode, newVnode, 'root', flags);
  }

  let needsRender = setComponentProps(elCtx, rctx, props);

  // TODO: review this corner case
  if (!needsRender && !elCtx.$componentQrl$ && !elCtx.$element$.hasAttribute(ELEMENT_ID)) {
    setQId(rctx, elCtx);
    elCtx.$componentQrl$ = props[OnRenderProp];
    assertQrl(elCtx.$componentQrl$ as any);
    needsRender = true;
  }

  // Rendering of children of component is more complicated,
  // since the children must be projected into the rendered slots
  // In addition, nested childen might need rerendering, if that's the case
  // we need to render the nested component, and wait before projecting the content
  // since otherwise we don't know where the slots
  if (needsRender) {
    return then(renderComponent(rctx, elCtx, flags), () =>
      renderContentProjection(rctx, elCtx, newVnode, flags)
    );
  }
  return renderContentProjection(rctx, elCtx, newVnode, flags);
};

const renderContentProjection = (
  rctx: RenderContext,
  hostCtx: QContext,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  const newChildren = vnode.$children$;
  const staticCtx = rctx.$static$;
  const splittedNewChidren = splitChildren(newChildren);
  const slotRctx = pushRenderContext(rctx, hostCtx);
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
  const promises = [];
  let hasPromise = false;
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    assertDefined(ch, 'render: node must be defined at index', startIdx, vnodes);
    const elm = createElm(ctx, ch, flags);
    promises.push(elm);
    if (isPromise(elm)) {
      hasPromise = true;
    }
  }
  if (hasPromise) {
    return Promise.all(promises).then((children) =>
      insertChildren(ctx.$static$, parentElm, children, before)
    );
  } else {
    insertChildren(ctx.$static$, parentElm, promises as Node[], before);
  }
};

const insertChildren = (
  ctx: RenderStaticContext,
  parentElm: QwikElement,
  children: (Node | VirtualElement)[],
  before: Node | VirtualElement | null
) => {
  for (const child of children) {
    insertBefore(ctx, parentElm, child, before);
  }
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
  rctx: RenderContext,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<Node | VirtualElement> => {
  const tag = vnode.$type$;
  const doc = rctx.$static$.$doc$;
  if (tag === '#text') {
    return (vnode.$elm$ = createTextNode(doc, vnode.$text$!));
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
  const staticCtx = rctx.$static$;
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
    setComponentProps(elCtx, rctx, props);
    setQId(rctx, elCtx);

    // Run mount hook
    elCtx.$componentQrl$ = renderQRL;

    return then(renderComponent(rctx, elCtx, flags), () => {
      let children = vnode.$children$;
      if (children.length === 0) {
        return elm;
      }
      if (children.length === 1 && children[0].$type$ === SKIP_RENDER_TYPE) {
        children = children[0].$children$;
      }
      const slotRctx = pushRenderContext(rctx, elCtx);
      const slotMap = getSlotMap(elCtx);
      const elements = children.map((ch) => createElm(slotRctx, ch, flags));
      return then(promiseAll(elements), () => {
        for (const node of children) {
          assertDefined(node.$elm$, 'vnode elm must be defined');
          appendChild(
            staticCtx,
            getSlotElement(staticCtx, slotMap, elm, getSlotName(node)),
            node.$elm$
          );
        }
        return elm;
      });
    });
  }

  const currentComponent = rctx.$cmpCtx$;
  const isSlot = isVirtual && QSlotS in props;
  const hasRef = !isVirtual && 'ref' in props;
  const listenerMap = setProperties(staticCtx, elCtx, props, isSvg);

  if (currentComponent && !isVirtual) {
    const scopedIds = currentComponent.$scopeIds$;
    if (scopedIds) {
      scopedIds.forEach((styleId) => {
        (elm as Element).classList.add(styleId);
      });
    }
    if (!currentComponent.$attachedListeners$) {
      currentComponent.$attachedListeners$ = true;
      for (const eventName of Object.keys(currentComponent.li)) {
        addQRLListener(listenerMap, eventName, currentComponent.li[eventName]);
      }
    }
  }

  if (isSlot) {
    assertDefined(currentComponent, 'slot can only be used inside component');
    assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');
    setKey(elm, vnode.$key$);

    directSetAttribute(elm, QSlotRef, currentComponent.$id$);
    currentComponent.$slots$.push(vnode);
    staticCtx.$addSlots$.push([elm, currentComponent.$element$]);
  } else if (qSerialize) {
    setKey(elm, vnode.$key$);
  }

  if (qSerialize) {
    const listeners = Object.keys(listenerMap);
    if (isHead && !isVirtual) {
      directSetAttribute(elm as Element, 'q:head', '');
    }
    if (listeners.length > 0 || hasRef) {
      setQId(rctx, elCtx);
    }
    for (const key of listeners) {
      setAttribute(staticCtx, elm, key, serializeQRLs(listenerMap[key], elCtx));
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
  const promises = children.map((ch) => createElm(rctx, ch, flags));
  return then(promiseAll(promises), () => {
    for (const node of children) {
      assertDefined(node.$elm$, 'vnode elm must be defined');
      appendChild(rctx.$static$, elm, node.$elm$);
    }
    return elm;
  });
};

interface SlotMaps {
  slots: Record<string, QwikElement>;
  templates: Record<string, Element | undefined>;
}

const getSlots = (ctx: QContext): ProcessedJSXNode[] => {
  const slots = ctx.$slots$;
  if (!slots) {
    const parent = ctx.$element$.parentElement;
    assertDefined(parent, 'component should be already attached to the dom');
    return (ctx.$slots$ = readDOMSlots(ctx));
  }
  return slots;
};

const getSlotMap = (ctx: QContext) => {
  const slotsArray = getSlots(ctx);
  const slots: Record<string, QwikElement> = {};
  const templates: Record<string, Element | undefined> = {};
  const t = Array.from(ctx.$element$.childNodes).filter(isSlotTemplate);

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

const readDOMSlots = (ctx: QContext): ProcessedJSXNode[] => {
  const parent = ctx.$element$.parentElement;
  assertDefined(parent, 'component should be already attached to the dom');
  return queryAllVirtualByAttribute(parent, QSlotRef, ctx.$id$).map(domToVnode);
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
  [dangerouslySetInnerHTML]: setInnerHTML,
  innerHTML: noop,
};

export const updateProperties = (
  elCtx: QContext,
  staticCtx: RenderStaticContext,
  oldProps: Record<string, any>,
  newProps: Record<string, any>,
  isSvg: boolean
): Record<string, QRLInternal<any>[]> => {
  const keys = getKeys(oldProps, newProps);
  const listenersMap = (elCtx.li = {});
  if (keys.length === 0) {
    return listenersMap;
  }
  const elm = elCtx.$element$;
  for (let key of keys) {
    if (key === 'children') {
      continue;
    }
    let newValue = newProps[key];
    if (key === 'className') {
      newProps['class'] = newValue;
      key = 'class';
    }
    if (key === 'class') {
      newProps['class'] = newValue = serializeClass(newValue);
    }
    const oldValue = oldProps[key];
    if (oldValue === newValue) {
      continue;
    }

    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    if (isOnProp(key)) {
      setEvent(listenersMap, key, newValue, staticCtx.$containerState$.$containerEl$);
      continue;
    }

    // Check if its an exception
    const exception = PROP_HANDLER_MAP[key];
    if (exception) {
      if (exception(staticCtx, elm as HTMLElement, key, newValue, oldValue)) {
        continue;
      }
    }

    // Check if property in prototype
    if (!isSvg && key in elm) {
      setProperty(staticCtx, elm, key, newValue);
      continue;
    }

    // Fallback to render attribute
    setAttribute(staticCtx, elm, key, newValue);
  }
  return listenersMap;
};

const getKeys = (oldProps: Record<string, any>, newProps: Record<string, any>) => {
  const keys = Object.keys(newProps);
  keys.push(...Object.keys(oldProps).filter((p) => !keys.includes(p)));
  return keys;
};

const addGlobalListener = (staticCtx: RenderStaticContext, elm: QwikElement, prop: string) => {
  if (!qSerialize && prop.includes(':')) {
    setAttribute(staticCtx, elm, prop, '');
  }
  try {
    if ((window as any).qwikevents) {
      (window as any).qwikevents.push(getEventName(prop));
    }
  } catch (err) {
    logWarn(err);
  }
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
  rctx: RenderStaticContext,
  elCtx: QContext,
  newProps: Record<string, any>,
  isSvg: boolean
) => {
  const elm = elCtx.$element$;
  const keys = Object.keys(newProps);
  const listenerMap = elCtx.li;
  if (keys.length === 0) {
    return listenerMap;
  }
  for (let key of keys) {
    if (key === 'children') {
      continue;
    }
    let newValue = newProps[key];
    if (key === 'className') {
      newProps['class'] = newValue;
      key = 'class';
    }
    if (key === 'class') {
      newProps['class'] = newValue = serializeClass(newValue);
    }
    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    if (isOnProp(key)) {
      addGlobalListener(
        rctx,
        elm,
        setEvent(listenerMap, key, newValue, rctx.$containerState$.$containerEl$)
      );
      continue;
    }

    // Check if its an exception
    const exception = PROP_HANDLER_MAP[key];
    if (exception) {
      if (exception(rctx, elm as HTMLElement, key, newValue, undefined)) {
        continue;
      }
    }

    // Check if property in prototype
    if (!isSvg && key in elm) {
      setProperty(rctx, elm, key, newValue);
      continue;
    }

    // Fallback to render attribute
    setAttribute(rctx, elm, key, newValue);
  }
  return listenerMap;
};

export const setComponentProps = (
  ctx: QContext,
  rctx: RenderContext,
  expectProps: Record<string, any>
) => {
  const keys = Object.keys(expectProps);
  if (keys.length === 0) {
    return false;
  }
  const qwikProps = getPropsMutator(ctx, rctx.$static$.$containerState$);
  for (const key of keys) {
    if (SKIPS_PROPS.includes(key)) {
      continue;
    }
    qwikProps.set(key, expectProps[key]);
  }
  return ctx.$dirty$;
};

export const cleanupTree = (
  parent: QwikElement,
  rctx: RenderStaticContext,
  subsManager: SubscriptionManager,
  stopSlots: boolean
) => {
  if (stopSlots && parent.hasAttribute(QSlotS)) {
    rctx.$rmSlots$.push(parent);
    return;
  }
  cleanupElement(parent, subsManager);
  const ch = getChildren(parent, 'elements');
  for (const child of ch) {
    cleanupTree(child as QwikElement, rctx, subsManager, stopSlots);
  }
};

const cleanupElement = (el: QwikElement, subsManager: SubscriptionManager) => {
  const ctx = tryGetContext(el);
  if (ctx) {
    cleanupContext(ctx, subsManager);
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

const sameVnode = (vnode1: ProcessedJSXNode, vnode2: ProcessedJSXNode): boolean => {
  if (vnode1.$type$ !== vnode2.$type$) {
    return false;
  }
  return vnode1.$key$ === vnode2.$key$;
};

const isTagName = (elm: ProcessedJSXNode, tagName: string): boolean => {
  return elm.$type$ === tagName;
};
