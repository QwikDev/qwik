import { ELEMENT_ID, OnRenderProp, QSlot, QSlotName, QSlotRef, QStyle } from '../../util/markers';
import {
  cleanupContext,
  ComponentCtx,
  getContext,
  getPropsMutator,
  normalizeOnProp,
  QContext,
  tryGetContext,
} from '../../props/props';
import { addQRLListener, isOnProp } from '../../props/props-on';
import { isArray, isString, ValueOrPromise } from '../../util/types';
import { promiseAll, then } from '../../util/promises';
import { assertDefined, assertEqual, assertTrue } from '../../assert/assert';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { logDebug, logError, logWarn } from '../../util/log';
import { qDev } from '../../util/qdev';
import {
  codeToText,
  qError,
  QError_hostCanOnlyBeAtRoot,
  QError_setProperty,
} from '../../error/error';
import { fromCamelToKebabCase } from '../../util/case';
import type { OnRenderFn } from '../../component/component.public';
import { CONTAINER, StyleAppend } from '../../use/use-core';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import { HOST_TYPE, SKIP_RENDER_TYPE, VIRTUAL_TYPE } from '../jsx/jsx-runtime';
import { assertQrl } from '../../import/qrl-class';
import { isQwikElement, isVirtualElement } from '../../util/element';
import { serializeQRLs } from '../../import/qrl';
import { ProcessedJSXNode, renderComponent } from './render-dom';
import type { RenderContext } from '../types';
import {
  copyRenderContext,
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
  VirtualElement,
} from './virtual-element';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const IS_SVG = 1 << 0;
export const IS_HEAD = 1 << 1;

type KeyToIndexMap = { [key: string]: number };

type PropHandler = (
  ctx: RenderContext,
  el: HTMLElement,
  key: string,
  newValue: any,
  oldValue: any
) => boolean;

export type ChildrenMode = 'root' | 'head' | 'elements';

export const visitJsxNode = (
  ctx: RenderContext,
  elm: QwikElement,
  jsxNode: ProcessedJSXNode | ProcessedJSXNode[] | undefined,
  flags: number
): ValueOrPromise<void> => {
  if (jsxNode === undefined) {
    return smartUpdateChildren(ctx, elm, [], 'root', flags);
  }
  if (isArray(jsxNode)) {
    return smartUpdateChildren(ctx, elm, jsxNode.flat(), 'root', flags);
  } else {
    return smartUpdateChildren(ctx, elm, [jsxNode], 'root', flags);
  }
};

export const smartUpdateChildren = (
  ctx: RenderContext,
  elm: QwikElement,
  ch: ProcessedJSXNode[],
  mode: ChildrenMode,
  flags: number
) => {
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
  const oldCh = getChildren(elm, mode);
  if (oldCh.length > 0 && ch.length > 0) {
    return updateChildren(ctx, elm, oldCh, ch, flags);
  } else if (ch.length > 0) {
    return addVnodes(ctx, elm, null, ch, 0, ch.length - 1, flags);
  } else if (oldCh.length > 0) {
    return removeVnodes(ctx, oldCh, 0, oldCh.length - 1);
  }
};

export const updateChildren = (
  ctx: RenderContext,
  parentElm: QwikElement,
  oldCh: (Node | VirtualElement)[],
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
  let elmToMove: Node | VirtualElement;
  const results = [];

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

      insertBefore(ctx, parentElm, oldStartVnode, oldEndVnode.nextSibling);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) {
      // Vnode moved left
      results.push(patchVnode(ctx, oldEndVnode, newStartVnode, flags));

      insertBefore(ctx, parentElm, oldEndVnode, oldStartVnode);
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
            insertBefore(ctx, parentElm, newElm, oldStartVnode);
          })
        );
      } else {
        elmToMove = oldCh[idxInOld];
        if (!isTagName(elmToMove, newStartVnode.$type$)) {
          const newElm = createElm(ctx, newStartVnode, flags);
          results.push(
            then(newElm, (newElm) => {
              insertBefore(ctx, parentElm, newElm, oldStartVnode);
            })
          );
        } else {
          results.push(patchVnode(ctx, elmToMove, newStartVnode, flags));
          oldCh[idxInOld] = undefined as any;
          insertBefore(ctx, parentElm, elmToMove, oldStartVnode);
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
      removeVnodes(ctx, oldCh, oldStartIdx, oldEndIdx);
    });
  }
  return wait;
};

const isComponentNode = (node: ProcessedJSXNode) => {
  return node.$props$ && OnRenderProp in node.$props$;
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
  switch (mode) {
    case 'root':
      return getCh(elm, isChildComponent);
    case 'head':
      return getCh(elm, isHeadChildren);
    case 'elements':
      return getCh(elm, isQwikElement);
  }
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

export const splitBy = <T>(input: T[], condition: (item: T) => string): Record<string, T[]> => {
  const output: Record<string, T[]> = {};
  for (const item of input) {
    const key = condition(item);
    const array = output[key] ?? (output[key] = []);
    array.push(item);
  }
  return output;
};

export const patchVnode = (
  rctx: RenderContext,
  elm: Node | VirtualElement,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  vnode.$elm$ = elm;
  const tag = vnode.$type$;
  if (tag === '#text') {
    if ((elm as Text).data !== vnode.$text$) {
      setProperty(rctx, elm, 'data', vnode.$text$);
    }
    return;
  }

  if (tag === HOST_TYPE) {
    throw qError(QError_hostCanOnlyBeAtRoot);
  }

  if (tag === SKIP_RENDER_TYPE) {
    return;
  }

  let isSvg = !!(flags & IS_SVG);

  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }

  const props = vnode.$props$;
  const ctx = getContext(elm as Element);
  const isComponent = isComponentNode(vnode);
  const isSlot = !isComponent && QSlotName in props;
  let dirty = isComponent
    ? updateComponentProperties(ctx, rctx, props)
    : updateProperties(ctx, rctx, props, isSvg);

  if (isSvg && vnode.$type$ === 'foreignObject') {
    flags &= ~IS_SVG;
    isSvg = false;
  }
  if (isSlot) {
    const currentComponent = rctx.$currentComponent$;
    if (currentComponent) {
      currentComponent.$slots$.push(vnode);
    }
  }
  const ch = vnode.$children$;
  if (isComponent) {
    if (!dirty && !ctx.$renderQrl$ && !ctx.$element$.hasAttribute(ELEMENT_ID)) {
      setQId(rctx, ctx);
      ctx.$renderQrl$ = props[OnRenderProp];
      assertQrl(ctx.$renderQrl$ as any);
      dirty = true;
    }
    const promise = dirty ? renderComponent(rctx, ctx, flags) : undefined;
    return then(promise, () => {
      const currentComponent = ctx.$component$;
      const slotMaps = getSlots(currentComponent, elm as Element);
      const splittedChidren = splitBy(ch, getSlotName);
      const promises: ValueOrPromise<void>[] = [];
      const slotRctx = copyRenderContext(rctx);
      slotRctx.$localStack$.push(ctx);

      // Mark empty slots and remove content
      Object.entries(slotMaps.slots).forEach(([key, slotEl]) => {
        if (slotEl && !splittedChidren[key]) {
          const oldCh = getChildren(slotEl, 'root');
          if (oldCh.length > 0) {
            removeVnodes(slotRctx, oldCh, 0, oldCh.length - 1);
          }
        }
      });

      // Mark empty slots and remove content
      Object.entries(slotMaps.templates).forEach(([key, templateEl]) => {
        if (templateEl && !splittedChidren[key]) {
          removeNode(slotRctx, templateEl);
          slotMaps.templates[key] = undefined;
        }
      });
      // Render into slots
      Object.entries(splittedChidren).forEach(([key, ch]) => {
        const slotElm = getSlotElement(slotRctx, slotMaps, elm as Element, key);
        promises.push(smartUpdateChildren(slotRctx, slotElm, ch, 'root', flags));
      });
      return then(promiseAll(promises), () => {
        removeTemplates(slotRctx, slotMaps);
      });
    });
  }
  const setsInnerHTML = checkInnerHTML(props);
  if (setsInnerHTML) {
    if (qDev && ch.length > 0) {
      logWarn('Node can not have children when innerHTML is set');
    }
    return;
  }

  if (!isSlot) {
    return smartUpdateChildren(rctx, elm as Element, ch, 'root', flags);
  }
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
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    assertDefined(ch, 'render: node must be defined at index', startIdx, vnodes);
    promises.push(createElm(ctx, ch, flags));
  }
  return then(promiseAll(promises), (children) => {
    for (const child of children) {
      insertBefore(ctx, parentElm, child, before);
    }
  });
};

const removeVnodes = (
  ctx: RenderContext,
  nodes: (Node | VirtualElement)[],
  startIdx: number,
  endIdx: number
): void => {
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = nodes[startIdx];
    if (ch) {
      removeNode(ctx, ch);
    }
  }
};

const getSlotElement = (
  ctx: RenderContext,
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

const createTemplate = (ctx: RenderContext, slotName: string) => {
  const template = createElement(ctx, 'q:template', false);
  directSetAttribute(template, QSlot, slotName);
  directSetAttribute(template, 'hidden', '');
  directSetAttribute(template, 'aria-hidden', 'true');

  return template;
};

const removeTemplates = (ctx: RenderContext, slotMaps: SlotMaps) => {
  Object.keys(slotMaps.templates).forEach((key) => {
    const template = slotMaps.templates[key]!;
    if (template && slotMaps.slots[key] !== undefined) {
      removeNode(ctx, template);
      slotMaps.templates[key] = undefined;
    }
  });
};

export const resolveSlotProjection = (
  ctx: RenderContext,
  hostElm: QwikElement,
  before: SlotMaps,
  after: SlotMaps
) => {
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

      ctx.$operations$.push({
        $el$: template,
        $operation$: 'slot-to-template',
        $args$: slotChildren,
        $fn$: () => {},
      });
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
        ctx.$operations$.push({
          $el$: slotEl,
          $operation$: 'template-to-slot',
          $args$: [template],
          $fn$: () => {},
        });
      }
    }
  });
};

const getSlotName = (node: ProcessedJSXNode): string => {
  return node.$props$?.[QSlot] ?? '';
};

const createElm = (
  rctx: RenderContext,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<Node | VirtualElement> => {
  rctx.$perf$.$visited$++;
  const tag = vnode.$type$;
  if (tag === '#text') {
    return (vnode.$elm$ = createTextNode(rctx, vnode.$text$!));
  }

  if (tag === HOST_TYPE) {
    throw qError(QError_hostCanOnlyBeAtRoot);
  }

  let isSvg = !!(flags & IS_SVG);
  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }
  const isVirtual = tag === VIRTUAL_TYPE;
  let elm: QwikElement;
  let isHead = !!(flags & IS_HEAD);

  if (isVirtual) {
    elm = newVirtualElement(rctx.$doc$);
  } else if (tag === 'head') {
    elm = rctx.$doc$.head;
    flags |= IS_HEAD;
    isHead = true;
  } else if (tag === 'title') {
    elm = rctx.$doc$.querySelector('title') ?? createElement(rctx, tag, isSvg);
  } else {
    elm = createElement(rctx, tag, isSvg);
    flags &= ~IS_HEAD;
  }

  vnode.$elm$ = elm;
  const props = vnode.$props$;
  const isComponent = isComponentNode(vnode);
  const isSlot = isVirtual && QSlotName in props;
  const hasRef = !isVirtual && 'ref' in props;
  const ctx = getContext(elm);

  setKey(elm, vnode.$key$);

  if (isHead && !isVirtual) {
    directSetAttribute(elm as Element, 'q:head', '');
  }

  if (isSvg && tag === 'foreignObject') {
    isSvg = false;
    flags &= ~IS_SVG;
  }

  const currentComponent = rctx.$currentComponent$;
  if (currentComponent) {
    if (!isVirtual) {
      const scopedIds = currentComponent.$ctx$.$scopeIds$;
      if (scopedIds) {
        scopedIds.forEach((styleId) => {
          (elm as Element).classList.add(styleId);
        });
      }
    }
    if (isSlot) {
      directSetAttribute(elm, QSlotRef, currentComponent.$ctx$.$id$);
      currentComponent.$slots$.push(vnode);
    }
  }

  if (isComponent) {
    updateComponentProperties(ctx, rctx, props);
  } else {
    updateProperties(ctx, rctx, props, isSvg);
  }

  if (isComponent || ctx.$listeners$ || hasRef) {
    setQId(rctx, ctx);
  }
  let wait: ValueOrPromise<void>;
  if (isComponent) {
    // Run mount hook
    const renderQRL = props![OnRenderProp];
    assertQrl<OnRenderFn<any>>(renderQRL);
    ctx.$renderQrl$ = renderQRL;
    wait = renderComponent(rctx, ctx, flags);
  } else {
    const setsInnerHTML = checkInnerHTML(props);
    if (setsInnerHTML) {
      if (qDev && vnode.$children$.length > 0) {
        logWarn('Node can not have children when innerHTML is set');
      }
      return elm;
    }
  }
  return then(wait, () => {
    const currentComponent = ctx.$component$;
    let children = vnode.$children$;
    if (children.length > 0) {
      if (children.length === 1 && children[0].$type$ === SKIP_RENDER_TYPE) {
        children = children[0].$children$;
      }
      const slotRctx = copyRenderContext(rctx);
      slotRctx.$localStack$.push(ctx);
      const slotMap = isComponent ? getSlots(currentComponent, elm) : undefined;
      const promises = children.map((ch) => createElm(slotRctx, ch, flags));
      return then(promiseAll(promises), () => {
        let parent = elm;
        for (const node of children) {
          if (slotMap) {
            parent = getSlotElement(slotRctx, slotMap, elm, getSlotName(node));
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
  slots: Record<string, QwikElement | undefined>;
  templates: Record<string, Element | undefined>;
}

const getSlots = (componentCtx: ComponentCtx | null, hostElm: QwikElement): SlotMaps => {
  const slots: Record<string, QwikElement> = {};
  const templates: Record<string, HTMLTemplateElement> = {};
  const parent = hostElm.parentElement;
  if (parent) {
    const slotRef = directGetAttribute(hostElm, 'q:id')!;
    const existingSlots = queryAllVirtualByAttribute(parent, 'q:sref', slotRef);

    // Map slots
    for (const elm of existingSlots) {
      slots[directGetAttribute(elm, QSlotName) ?? ''] = elm;
    }
  }
  const newSlots = componentCtx?.$slots$ ?? EMPTY_ARRAY;
  const t = Array.from(hostElm.childNodes).filter(isSlotTemplate);

  // Map virtual slots
  for (const vnode of newSlots) {
    slots[vnode.$props$[QSlotName] ?? ''] = vnode.$elm$ as Element;
  }

  // Map templates
  for (const elm of t) {
    templates[directGetAttribute(elm, QSlot) ?? ''] = elm;
  }

  return { slots, templates };
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

export const PROP_HANDLER_MAP: Record<string, PropHandler> = {
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
  expectProps: Record<string, any>,
  isSvg: boolean
) => {
  const keys = Object.keys(expectProps);
  if (keys.length === 0) {
    return false;
  }
  let cache = elCtx.$cache$;
  const elm = elCtx.$element$;
  for (const key of keys) {
    if (key === 'children') {
      continue;
    }
    const newValue = expectProps[key];
    if (key === 'ref') {
      (newValue as Ref<Element>).current = elm as Element;
      continue;
    }

    // Early exit if value didnt change
    const cacheKey = key;
    if (!cache) {
      cache = elCtx.$cache$ = new Map();
    }
    const oldValue = cache.get(cacheKey);
    if (newValue === oldValue) {
      continue;
    }
    cache.set(cacheKey, newValue);

    // Check of data- or aria-
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      setAttribute(rctx, elm, key, newValue);
      continue;
    }

    if (isOnProp(key)) {
      setEvent(elCtx, key, newValue);
      continue;
    }

    // Check if its an exception
    const exception = PROP_HANDLER_MAP[key];
    if (exception) {
      if (exception(rctx, elm as HTMLElement, key, newValue, oldValue)) {
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
  const cmp = rctx.$currentComponent$;
  if (cmp && !cmp.$attachedListeners$) {
    cmp.$attachedListeners$ = true;
    cmp.$ctx$.$listeners$?.forEach((qrl, eventName) => {
      addQRLListener(elCtx, eventName, qrl);
    });
  }
  elCtx.$listeners$?.forEach((value, key) => {
    setAttribute(rctx, elm, fromCamelToKebabCase(key), serializeQRLs(value, elCtx));
  });
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
  const qwikProps = getPropsMutator(ctx, rctx.$containerState$);
  for (const key of keys) {
    if (SKIPS_PROPS.includes(key)) {
      continue;
    }
    qwikProps.set(key, expectProps[key]);
  }
  return ctx.$dirty$;
};

const setEvent = (ctx: QContext, prop: string, value: any) => {
  assertTrue(prop.endsWith('$'), 'render: event property does not end with $', prop);
  addQRLListener(ctx, normalizeOnProp(prop.slice(0, -1)), value);
};

export const setAttribute = (ctx: RenderContext, el: QwikElement, prop: string, value: any) => {
  const fn = () => {
    if (value == null || value === false) {
      el.removeAttribute(prop);
    } else {
      const str = value === true ? '' : String(value);
      directSetAttribute(el, prop, str);
    }
  };
  ctx.$operations$.push({
    $el$: el,
    $operation$: 'set-attribute',
    $args$: [prop, value],
    $fn$: fn,
  });
};

const setProperty = (ctx: RenderContext, node: any, key: string, value: any) => {
  const fn = () => {
    try {
      node[key] = value;
    } catch (err) {
      logError(codeToText(QError_setProperty), { node, key, value }, err);
    }
  };
  ctx.$operations$.push({
    $el$: node,
    $operation$: 'set-property',
    $args$: [key, value],
    $fn$: fn,
  });
};

const createElement = (ctx: RenderContext, expectTag: string, isSvg: boolean): Element => {
  const el = isSvg
    ? ctx.$doc$.createElementNS(SVG_NS, expectTag)
    : ctx.$doc$.createElement(expectTag);
  (el as any)[CONTAINER] = ctx.$containerEl$;
  ctx.$operations$.push({
    $el$: el,
    $operation$: 'create-element',
    $args$: [expectTag],
    $fn$: () => {},
  });
  return el;
};

const insertBefore = <T extends Node | VirtualElement>(
  ctx: RenderContext,
  parent: QwikElement,
  newChild: T,
  refChild: Node | VirtualElement | null | undefined
): T => {
  const fn = () => {
    directInsertBefore(parent, newChild, refChild ? refChild : null);
  };
  ctx.$operations$.push({
    $el$: parent,
    $operation$: 'insert-before',
    $args$: [newChild, refChild],
    $fn$: fn,
  });
  return newChild;
};

export const appendHeadStyle = (
  ctx: RenderContext,
  hostElement: Element | VirtualElement,
  styleTask: StyleAppend
) => {
  const fn = () => {
    const containerEl = ctx.$containerEl$;
    const doc = ctx.$doc$;
    const isDoc = doc.documentElement === containerEl;
    const headEl = doc.head;
    const style = doc.createElement('style');
    if (isDoc && !headEl) {
      logWarn('document.head is undefined');
    }
    directSetAttribute(style, QStyle, styleTask.styleId);
    style.textContent = styleTask.content;
    if (isDoc && headEl) {
      directAppendChild(headEl, style);
    } else {
      directInsertBefore(containerEl, style, containerEl.firstChild);
    }
  };
  ctx.$containerState$.$styleIds$.add(styleTask.styleId);
  ctx.$postOperations$.push({
    $el$: hostElement,
    $operation$: 'append-style',
    $args$: [styleTask],
    $fn$: fn,
  });
};

const prepend = (ctx: RenderContext, parent: QwikElement, newChild: Node) => {
  const fn = () => {
    directInsertBefore(parent, newChild, parent.firstChild);
  };
  ctx.$operations$.push({
    $el$: parent,
    $operation$: 'prepend',
    $args$: [newChild],
    $fn$: fn,
  });
};

const removeNode = (ctx: RenderContext, el: Node | VirtualElement) => {
  const fn = () => {
    const parent = el.parentElement;
    if (parent) {
      if (el.nodeType === 1 || el.nodeType === 111) {
        cleanupTree(el as Element, ctx.$containerState$.$subsManager$);
      }
      directRemoveChild(parent, el);
    } else if (qDev) {
      logWarn('Trying to remove component already removed', el);
    }
  };
  ctx.$operations$.push({
    $el$: el,
    $operation$: 'remove',
    $args$: [],
    $fn$: fn,
  });
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

const createTextNode = (ctx: RenderContext, text: string): Text => {
  return ctx.$doc$.createTextNode(text);
};

export const executeContextWithSlots = (ctx: RenderContext) => {
  const before = ctx.$roots$.map((elm) => getSlots(null, elm));

  executeDOMRender(ctx);

  const after = ctx.$roots$.map((elm) => getSlots(null, elm));
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

export const executeDOMRender = (ctx: RenderContext) => {
  for (const op of ctx.$operations$) {
    op.$fn$();
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

export const printRenderStats = (ctx: RenderContext) => {
  if (qDev) {
    if (typeof window !== 'undefined' && window.document != null) {
      const byOp: Record<string, number> = {};
      for (const op of ctx.$operations$) {
        byOp[op.$operation$] = (byOp[op.$operation$] ?? 0) + 1;
      }
      const affectedElements = Array.from(new Set(ctx.$operations$.map((a) => a.$el$)));
      const stats = {
        byOp,
        roots: ctx.$roots$,
        hostElements: Array.from(ctx.$hostElements$),
        affectedElements,
        visitedNodes: ctx.$perf$.$visited$,
        operations: ctx.$operations$.map((v) => [v.$operation$, v.$el$, ...v.$args$]),
      };
      const noOps = ctx.$operations$.length === 0;
      logDebug('Render stats.', noOps ? 'No operations' : '', stats);
    }
  }
};

const createKeyToOldIdx = (
  children: (Node | VirtualElement)[],
  beginIdx: number,
  endIdx: number
): KeyToIndexMap => {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const child = children[i];
    if (child.nodeType === 1) {
      const key = getKey(child as Element);
      if (key != null) {
        map[key as string] = i;
      }
    }
  }
  return map;
};

const KEY_SYMBOL = Symbol('vnode key');

const getKey = (el: Element): string | null => {
  let key = (el as any)[KEY_SYMBOL];
  if (key === undefined) {
    key = (el as any)[KEY_SYMBOL] = directGetAttribute(el, 'q:key');
  }
  return key;
};

const setKey = (el: QwikElement, key: string | null) => {
  if (isString(key)) {
    directSetAttribute(el, 'q:key', key);
  }
  (el as any)[KEY_SYMBOL] = key;
};

const sameVnode = (elm: Node | VirtualElement, vnode2: ProcessedJSXNode): boolean => {
  const isElement = elm.nodeType === 1 || elm.nodeType === 111;
  const type = vnode2.$type$;
  if (isElement) {
    const isSameSel = (elm as Element).localName === type;
    if (!isSameSel) {
      return false;
    }
    return getKey(elm as Element) === vnode2.$key$;
  }
  return elm.nodeName === type;
};

const isTagName = (elm: Node | VirtualElement, tagName: string): boolean => {
  if (elm.nodeType === 1) {
    return (elm as Element).localName === tagName;
  }
  return elm.nodeName === tagName;
};

const checkInnerHTML = (props: Record<string, any>) => {
  return dangerouslySetInnerHTML in props;
};
