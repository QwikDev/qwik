import { ELEMENT_ID, OnRenderProp, QSlot, QSlotName, QSlotRef } from '../../util/markers';
import {
  cleanupContext,
  getContext,
  getPropsMutator,
  QContext,
  tryGetContext,
} from '../../props/props';
import { addQRLListener, isOnProp, setEvent } from '../../props/props-on';
import { isString, ValueOrPromise } from '../../util/types';
import { isPromise, promiseAll, then } from '../../util/promises';
import { assertDefined, assertEqual } from '../../assert/assert';
import { logWarn } from '../../util/log';
import { qDev } from '../../util/qdev';
import { fromCamelToKebabCase } from '../../util/case';
import type { OnRenderFn } from '../../component/component.public';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import { SKIP_RENDER_TYPE } from '../jsx/jsx-runtime';
import { assertQrl, isQrl } from '../../import/qrl-class';
import { isQwikElement, isText, isVirtualElement } from '../../util/element';
import { serializeQRLs } from '../../import/qrl';
import { getVdom, ProcessedJSXNode, ProcessedJSXNodeImpl, renderComponent } from './render-dom';
import type { RenderContext, RenderStaticContext } from '../types';
import {
  pushRenderContext,
  setQId,
  SKIPS_PROPS,
  stringifyClass,
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
  createElement,
  createTextNode,
  executeDOMRender,
  insertBefore,
  prepend,
  removeNode,
  setAttribute,
  setProperty,
} from './operations';

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
  let ch = newVnode.$children$;
  const elm = oldVnode.$elm$ as Element;
  const needsDOMRead = oldVnode.$children$ === CHILDREN_PLACEHOLDER;
  if (needsDOMRead) {
    if (ch.length === 1 && ch[0].$type$ === SKIP_RENDER_TYPE) {
      if (elm.firstChild !== null) {
        return;
      }
      ch = ch[0].$children$;
    }
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
      // Vnode moved right
      results.push(patchVnode(ctx, oldStartVnode, newEndVnode, flags));

      insertBefore(staticCtx, parentElm, oldStartVnode.$elm$!, oldEndVnode.$elm$!.nextSibling);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) {
      // Vnode moved left
      results.push(patchVnode(ctx, oldEndVnode, newStartVnode, flags));

      insertBefore(staticCtx, parentElm, oldEndVnode.$elm$!, oldStartVnode.$elm$!);
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
          insertBefore(staticCtx, parentElm, elmToMove.$elm$!, oldStartVnode.$elm$);
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
  console.warn('DOM READ: getChildren()', elm);
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
  return getChildren(elm, mode).map(domToVnode);
};

export const domToVnode = (node: Node | VirtualElement): ProcessedJSXNode => {
  if (isQwikElement(node)) {
    const t = new ProcessedJSXNodeImpl(node.localName, {}, CHILDREN_PLACEHOLDER, getKey(node));
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

const isSlotTemplate = (node: Node | VirtualElement): node is HTMLTemplateElement => {
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
    const node = output[key] ?? (output[key] = new ProcessedJSXNodeImpl(VIRTUAL, {}, [], null));
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
  newVnode.$elm$ = elm;

  // Render text nodes
  if (tag === '#text') {
    if (oldVnode.$text$ !== newVnode.$text$) {
      setProperty(staticCtx, elm, 'data', newVnode.$text$);
    }
    return;
  }

  // Early exit for a skip render node
  if (tag === SKIP_RENDER_TYPE) {
    return;
  }

  // Track SVG state
  let isSvg = !!(flags & IS_SVG);
  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }

  const props = newVnode.$props$;
  const ctx = getContext(elm as Element);
  const isComponent = OnRenderProp in props;
  if (!isComponent) {
    updateProperties(ctx, rctx, oldVnode.$props$, props, isSvg);

    const isSlot = !isComponent && QSlotName in props;
    if (isSvg && newVnode.$type$ === 'foreignObject') {
      flags &= ~IS_SVG;
      isSvg = false;
    }
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
    return smartUpdateChildren(rctx, oldVnode, newVnode, 'root', flags);
  }

  let needsRender = updateComponentProperties(ctx, rctx, props);

  // TODO: review this corner case
  if (!needsRender && !ctx.$renderQrl$ && !ctx.$element$.hasAttribute(ELEMENT_ID)) {
    setQId(rctx, ctx);
    ctx.$renderQrl$ = props[OnRenderProp];
    assertQrl(ctx.$renderQrl$ as any);
    needsRender = true;
  }

  // Rendering of children of component is more complicated,
  // since the children must be projected into the rendered slots
  // In addition, nested childen might need rerendering, if that's the case
  // we need to render the nested component, and wait before projecting the content
  // since otherwise we don't know where the slots
  if (needsRender) {
    return then(renderComponent(rctx, ctx, flags), () =>
      renderContentProjection(rctx, ctx, newVnode, flags)
    );
  }
  return renderContentProjection(rctx, ctx, newVnode, flags);
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
  Object.entries(slotMaps.slots).forEach(([key, slotEl]) => {
    if (!splittedNewChidren[key]) {
      const oldCh = getChildrenVnodes(slotEl, 'root');
      if (oldCh.length > 0) {
        removeVnodes(staticCtx, oldCh, 0, oldCh.length - 1);
      }
    }
  });

  // Remove empty templates
  Object.entries(slotMaps.templates).forEach(([key, templateEl]) => {
    if (templateEl) {
      if (!splittedNewChidren[key] || slotMaps.slots[key]) {
        removeNode(staticCtx, templateEl);
        slotMaps.templates[key] = undefined;
      }
    }
  });

  // Render into slots
  return promiseAll(
    Object.entries(splittedNewChidren).map(([key, newVdom]) => {
      const slotElm = getSlotElement(staticCtx, slotMaps, hostCtx.$element$, key);
      const slotCtx = getContext(slotElm);
      const oldVdom = getVdom(slotCtx);
      slotCtx.$vdom$ = newVdom;
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
      removeNode(ctx, ch.$elm$!);
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
  const template = createTemplate(ctx, slotName);
  prepend(ctx, parentEl, template);
  slotMaps.templates[slotName] = template;
  return template;
};

const createTemplate = (ctx: RenderStaticContext, slotName: string) => {
  const template = createElement(ctx.$doc$, 'q:template', false);
  directSetAttribute(template, QSlot, slotName);
  directSetAttribute(template, 'hidden', '');
  directSetAttribute(template, 'aria-hidden', 'true');

  return template;
};

export const resolveSlotProjection = (
  ctx: RenderStaticContext,
  elCtx: QContext,
  before: SlotMaps,
  after: SlotMaps
) => {
  const hostElm = elCtx.$element$;
  Object.entries(before.slots).forEach(([key, slotEl]) => {
    if (slotEl && !after.slots[key]) {
      // Slot removed
      // Move slot to template
      const template = createTemplate(ctx, key);
      const slotChildren = getChildren(slotEl, 'root');
      for (const child of slotChildren) {
        directAppendChild(template, child);
      }
      directInsertBefore(hostElm, template, hostElm.firstChild);
    }
  });

  Object.entries(after.slots).forEach(([key, slotEl]) => {
    if (slotEl && !before.slots[key]) {
      // Slot created
      // Move template to slot
      const template = before.templates[key];
      if (template) {
        const children = getChildren(template, 'root');
        children.forEach((child) => {
          directAppendChild(slotEl, child);
        });
        template.remove();
      }
    }
  });
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
  if (isVirtual) {
    elm = newVirtualElement(doc);
  } else if (tag === 'head') {
    elm = doc.head;
    flags |= IS_HEAD;
    isHead = true;
  } else if (tag === 'title') {
    elm = doc.querySelector('title') ?? createElement(doc, tag, isSvg);
  } else {
    elm = createElement(doc, tag, isSvg);
    flags &= ~IS_HEAD;
  }

  vnode.$elm$ = elm;
  const props = vnode.$props$;
  const isComponent = OnRenderProp in props;
  const isSlot = isVirtual && QSlotName in props;
  const hasRef = !isVirtual && 'ref' in props;
  const elCtx = getContext(elm);
  const currentComponent = rctx.$cmpCtx$;

  setKey(elm, vnode.$key$);

  if (isHead && !isVirtual) {
    directSetAttribute(elm as Element, 'q:head', '');
  }

  if (isSvg && tag === 'foreignObject') {
    isSvg = false;
    flags &= ~IS_SVG;
  }

  if (currentComponent) {
    if (!isVirtual) {
      const scopedIds = currentComponent.$scopeIds$;
      if (scopedIds) {
        scopedIds.forEach((styleId) => {
          (elm as Element).classList.add(styleId);
        });
      }
    }
    if (isSlot) {
      assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');
      directSetAttribute(elm, QSlotRef, currentComponent.$id$);
      currentComponent.$slots$.push(vnode);
    }
  }

  if (isComponent) {
    updateComponentProperties(elCtx, rctx, props);
  } else {
    setProperties(elCtx, props, isSvg);
  }

  if (isComponent || elCtx.$listeners$ || hasRef) {
    setQId(rctx, elCtx);
  }

  let wait: ValueOrPromise<void>;
  if (isComponent) {
    // Run mount hook
    const renderQRL = props![OnRenderProp];
    assertQrl<OnRenderFn<any>>(renderQRL);
    elCtx.$renderQrl$ = renderQRL;
    wait = renderComponent(rctx, elCtx, flags);
  } else {
    const setsInnerHTML = props[dangerouslySetInnerHTML] !== undefined;
    if (setsInnerHTML) {
      if (qDev && vnode.$children$.length > 0) {
        logWarn('Node can not have children when innerHTML is set');
      }
      return elm;
    }
  }
  return then(wait, () => {
    let children = vnode.$children$;
    if (children.length > 0) {
      if (children.length === 1 && children[0].$type$ === SKIP_RENDER_TYPE) {
        children = children[0].$children$;
      }
      const slotRctx = pushRenderContext(rctx, elCtx);
      const slotMap = isComponent ? getSlotMap(elCtx) : undefined;
      const promises = children.map((ch) => createElm(slotRctx, ch, flags));
      return then(promiseAll(promises), () => {
        let parent = elm;
        for (const node of children) {
          if (slotMap) {
            parent = getSlotElement(rctx.$static$, slotMap, elm, getSlotName(node));
          }
          directAppendChild(parent, node.$elm$!);
        }
        return elm;
      });
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
  const templates: Record<string, HTMLTemplateElement | undefined> = {};
  const t = Array.from(ctx.$element$.childNodes).filter(isSlotTemplate);

  // Map virtual slots
  for (const vnode of slotsArray) {
    slots[vnode.$props$[QSlotName] ?? ''] = vnode.$elm$ as Element;
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
  return queryAllVirtualByAttribute(parent, 'q:sref', ctx.$id$).map(domToVnode);
};

const handleStyle: PropHandler = (ctx, elm, _, newValue) => {
  setAttribute(ctx, elm, 'style', stringifyStyle(newValue));
  return true;
};

const handleClass: PropHandler = (ctx, elm, _, newValue, oldValue) => {
  if (!oldValue) {
    oldValue = elm.className;
  }
  setAttribute(ctx, elm, 'class', stringifyClass(newValue, oldValue));
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
  className: handleClass,
  value: checkBeforeAssign,
  checked: checkBeforeAssign,
  [dangerouslySetInnerHTML]: setInnerHTML,
  innerHTML: noop,
};

export const updateProperties = (
  elCtx: QContext,
  rctx: RenderContext,
  oldProps: Record<string, any>,
  newProps: Record<string, any>,
  isSvg: boolean
) => {
  const keys = Object.keys(newProps);
  if (keys.length === 0) {
    return false;
  }
  let renderListeners = false;
  const staticCtx = rctx.$static$;
  const elm = elCtx.$element$;
  for (const key of keys) {
    if (key === 'children') {
      continue;
    }
    const newValue = newProps[key];
    const oldValue = oldProps[key];
    if (oldValue === newValue) {
      continue;
    }

    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    if (isOnProp(key)) {
      if (areExactQRLs(newValue, oldValue)) {
        continue;
      }
      setEvent(elCtx, key, newValue);
      renderListeners = true;
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
  const cmp = rctx.$cmpCtx$;
  if (cmp && !cmp.$attachedListeners$) {
    cmp.$attachedListeners$ = true;
    cmp.$listeners$?.forEach((qrls, eventName) => {
      addQRLListener(elCtx, eventName, qrls);
      renderListeners = true;
    });
  }
  if (renderListeners) {
    elCtx.$listeners$?.forEach((value, key) => {
      const attributeName = fromCamelToKebabCase(key);
      setAttribute(staticCtx, elm, attributeName, serializeQRLs(value, elCtx));
    });
  }
  return false;
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

export const setProperties = (ctx: QContext, newProps: Record<string, any>, isSvg: boolean) => {
  const keys = Object.keys(newProps);
  if (keys.length === 0) {
    return false;
  }
  const elm = ctx.$element$;
  for (const key of keys) {
    if (key === 'children') {
      continue;
    }
    const newValue = newProps[key];
    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    if (isOnProp(key)) {
      setEvent(ctx, key, newValue);
      continue;
    }

    // Check if its an exception
    const exception = PROP_HANDLER_MAP[key];
    if (exception) {
      if (exception(undefined, elm as HTMLElement, key, newValue, undefined)) {
        continue;
      }
    }

    // Check if property in prototype
    if (!isSvg && key in elm) {
      (elm as any)[key] = newValue;
      continue;
    }

    // Fallback to render attribute
    directSetAttribute(elm, key, newValue);
  }
  if (ctx.$listeners$) {
    ctx.$listeners$.forEach((value, key) => {
      directSetAttribute(elm, fromCamelToKebabCase(key), serializeQRLs(value, ctx));
    });
  }
  return false;
};

export const updateComponentProperties = (
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

export const cleanupTree = (parent: QwikElement, subsManager: SubscriptionManager) => {
  if (parent.hasAttribute(QSlotName)) {
    return;
  }
  cleanupElement(parent, subsManager);
  const ch = getChildren(parent, 'elements');
  for (const child of ch) {
    cleanupTree(child as QwikElement, subsManager);
  }
};

const cleanupElement = (el: QwikElement, subsManager: SubscriptionManager) => {
  const ctx = tryGetContext(el);
  if (ctx) {
    cleanupContext(ctx, subsManager);
  }
};

export const executeContextWithSlots = ({ $static$: ctx }: RenderContext) => {
  const before = ctx.$roots$.map(getSlotMap);

  executeDOMRender(ctx);

  const after = ctx.$roots$.map(getSlotMap);
  assertEqual(
    before.length,
    after.length,
    'render: number of q:slots changed during render context execution',
    before,
    after
  );

  for (let i = 0; i < before.length; i++) {
    resolveSlotProjection(ctx, ctx.$roots$[i], before[i], after[i]);
  }
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

const KEY_SYMBOL = Symbol('vnode key');

const getKey = (el: QwikElement): string | null => {
  let key = (el as any)[KEY_SYMBOL];
  if (key === undefined) {
    key = (el as any)[KEY_SYMBOL] = directGetAttribute(el, 'q:key');
  }
  return key;
};

const setKey = (el: QwikElement, key: string | null) => {
  if (key !== null) {
    directSetAttribute(el, 'q:key', key);
  }
  (el as any)[KEY_SYMBOL] = key;
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
