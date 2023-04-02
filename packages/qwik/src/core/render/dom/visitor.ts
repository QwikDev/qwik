import { ELEMENT_ID, OnRenderProp, QSlot, QSlotRef, QSlotS } from '../../util/markers';
import { isOnProp, PREVENT_DEFAULT, setEvent } from '../../state/listeners';
import type { ValueOrPromise } from '../../util/types';
import { isPromise, promiseAll, promiseAllLazy, then } from '../../util/promises';
import { assertDefined, assertEqual, assertTrue } from '../../error/assert';
import { logWarn } from '../../util/log';
import { qDev, qInspector, qTest } from '../../util/qdev';
import type { OnRenderFn } from '../../component/component.public';
import { directGetAttribute, directSetAttribute } from '../fast-calls';
import { SKIP_RENDER_TYPE } from '../jsx/jsx-runtime';
import { assertQrl, isQrl } from '../../qrl/qrl-class';
import {
  assertElement,
  assertQwikElement,
  isElement,
  isNodeElement,
  isQwikElement,
  isText,
  isVirtualElement,
} from '../../util/element';
import {
  getVdom,
  type ProcessedJSXNode,
  ProcessedJSXNodeImpl,
  renderComponent,
} from './render-dom';
import type { RenderContext, RenderStaticContext } from '../types';
import {
  isAriaAttribute,
  jsxToString,
  pushRenderContext,
  serializeClassWithHost,
  setQId,
  static_listeners,
  static_subtree,
  stringifyStyle,
} from '../execute-component';
import { addQwikEvent, type ContainerState, setRef } from '../../container/container';
import {
  getRootNode,
  newVirtualElement,
  processVirtualNodes,
  queryAllVirtualByAttribute,
  type QwikElement,
  VIRTUAL,
  type VirtualElement,
} from './virtual-element';

import {
  appendChild,
  createElement,
  createTemplate,
  executeDOMRender,
  getKey,
  insertAfter,
  insertBefore,
  prepend,
  removeNode,
  setAttribute,
  setKey,
  setProperty,
} from './operations';
import { EMPTY_OBJ } from '../../util/flyweight';
import { isSignal } from '../../state/signal';
import {
  cleanupContext,
  createContext,
  getContext,
  HOST_FLAG_DIRTY,
  HOST_FLAG_NEED_ATTACH_LISTENER,
  type QContext,
  tryGetContext,
} from '../../state/context';
import { getProxyManager, getProxyTarget, type SubscriptionManager } from '../../state/common';
import { createPropsState, createProxy, ReadWriteProxyHandler } from '../../state/store';
import { _IMMUTABLE, _IMMUTABLE_PREFIX } from '../../state/constants';
import { trackSignal } from '../../use/use-core';

export const SVG_NS = 'http://www.w3.org/2000/svg';

export const IS_SVG = 1 << 0;
export const IS_HEAD = 1 << 1;
export const IS_IMMUTABLE = 1 << 2;

type KeyToIndexMap = { [key: string]: number };

const CHILDREN_PLACEHOLDER: ProcessedJSXNode[] = [];
type PropHandler = (
  staticCtx: RenderStaticContext | undefined,
  el: HTMLElement,
  key: string,
  newValue: any
) => boolean;

export type ChildrenMode = 'root' | 'head' | 'elements';

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
    return diffChildren(ctx, elm, oldCh, ch, flags);
  } else if (oldCh.length > 0 && ch.length === 0) {
    return removeChildren(ctx.$static$, oldCh, 0, oldCh.length - 1);
  } else if (ch.length > 0) {
    return addChildren(ctx, elm, null, ch, 0, ch.length - 1, flags);
  }
};

export const getVnodeChildren = (oldVnode: ProcessedJSXNode, mode: ChildrenMode) => {
  const oldCh = oldVnode.$children$;
  const elm = oldVnode.$elm$ as Element;
  if (oldCh === CHILDREN_PLACEHOLDER) {
    return (oldVnode.$children$ = getChildrenVnodes(elm, mode));
  }
  return oldCh;
};

export const diffChildren = (
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
    } else if (oldStartVnode.$id$ === newStartVnode.$id$) {
      results.push(diffVnode(ctx, oldStartVnode, newStartVnode, flags));
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (oldEndVnode.$id$ === newEndVnode.$id$) {
      results.push(diffVnode(ctx, oldEndVnode, newEndVnode, flags));
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (oldStartVnode.$key$ && oldStartVnode.$id$ === newEndVnode.$id$) {
      assertDefined(oldStartVnode.$elm$, 'oldStartVnode $elm$ must be defined');
      assertDefined(oldEndVnode.$elm$, 'oldEndVnode $elm$ must be defined');

      // Vnode moved right
      results.push(diffVnode(ctx, oldStartVnode, newEndVnode, flags));
      insertAfter(staticCtx, parentElm, oldStartVnode.$elm$, oldEndVnode.$elm$);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (oldEndVnode.$key$ && oldEndVnode.$id$ === newStartVnode.$id$) {
      assertDefined(oldStartVnode.$elm$, 'oldStartVnode $elm$ must be defined');
      assertDefined(oldEndVnode.$elm$, 'oldEndVnode $elm$ must be defined');

      // Vnode moved left
      results.push(diffVnode(ctx, oldEndVnode, newStartVnode, flags));
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
        if (elmToMove.$type$ !== newStartVnode.$type$) {
          const newElm = createElm(ctx, newStartVnode, flags, results);
          then(newElm, (newElm) => {
            insertBefore(staticCtx, parentElm, newElm, oldStartVnode?.$elm$);
          });
        } else {
          results.push(diffVnode(ctx, elmToMove, newStartVnode, flags));
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
    results.push(addChildren(ctx, parentElm, before, newCh, newStartIdx, newEndIdx, flags));
  }

  let wait = promiseAll(results) as any;
  if (oldStartIdx <= oldEndIdx) {
    wait = then(wait, () => {
      removeChildren(staticCtx, oldCh, oldStartIdx, oldEndIdx);
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
      return getCh(elm, isNodeElement);
  }
};

// const getChildrenVnodes = (elm: QwikElement, mode: ChildrenMode) => {
//   return getChildren(elm, mode).map(getVdom);
// };
const getChildrenVnodes = (elm: QwikElement, mode: ChildrenMode) => {
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
    const t = new ProcessedJSXNodeImpl(
      node.localName,
      {},
      null,
      CHILDREN_PLACEHOLDER,
      0,
      getKey(node)
    );
    t.$elm$ = node;
    return t;
  } else if (isText(node)) {
    const t = new ProcessedJSXNodeImpl(
      node.nodeName,
      EMPTY_OBJ,
      null,
      CHILDREN_PLACEHOLDER,
      0,
      null
    );
    t.$text$ = node.data;
    t.$elm$ = node;
    return t;
  }
  throw new Error('invalid node');
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
        null,
        [],
        0,
        key
      ));
    node.$children$.push(item);
  }
  return output;
};

export const diffVnode = (
  rCtx: RenderContext,
  oldVnode: ProcessedJSXNode,
  newVnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  assertEqual(oldVnode.$type$, newVnode.$type$, 'old and new vnodes type must be the same');
  assertEqual(oldVnode.$key$, newVnode.$key$, 'old and new vnodes key must be the same');
  assertEqual(oldVnode.$id$, newVnode.$id$, 'old and new vnodes key must be the same');
  const elm = oldVnode.$elm$;
  const tag = newVnode.$type$;
  const staticCtx = rCtx.$static$;
  const currentComponent = rCtx.$cmpCtx$;
  assertDefined(elm, 'while patching element must be defined');
  assertDefined(currentComponent, 'while patching current component must be defined');

  newVnode.$elm$ = elm;

  // Render text nodes
  if (tag === '#text') {
    rCtx.$static$.$visited$.push(elm);
    const signal = newVnode.$signal$;
    if (signal) {
      newVnode.$text$ = jsxToString(
        trackSignal(signal, [4, currentComponent.$element$, signal, elm as Text])
      );
    }
    setProperty(staticCtx, elm, 'data', newVnode.$text$);
    return;
  }
  assertQwikElement(elm);

  const props = newVnode.$props$;
  const vnodeFlags = newVnode.$flags$;
  const elCtx = getContext(elm, rCtx.$static$.$containerState$);

  if (tag !== VIRTUAL) {
    // Track SVG state
    let isSvg = (flags & IS_SVG) !== 0;
    if (!isSvg && tag === 'svg') {
      flags |= IS_SVG;
      isSvg = true;
    }

    if (props !== EMPTY_OBJ) {
      // elCtx.$vdom$ = newVnode;
      if ((vnodeFlags & static_listeners) === 0) {
        elCtx.li.length = 0;
      }
      const values = oldVnode.$props$;
      newVnode.$props$ = values;
      const keys = Object.keys(props);
      for (const prop of keys) {
        let newValue = props[prop];
        if (prop === 'ref') {
          assertElement(elm);
          setRef(newValue, elm);
          continue;
        }

        if (isOnProp(prop)) {
          browserSetEvent(staticCtx, elCtx, prop, newValue);
          continue;
        }

        if (isSignal(newValue)) {
          newValue = trackSignal(newValue, [1, currentComponent.$element$, newValue, elm, prop]);
        }
        if (prop === 'class') {
          newValue = serializeClassWithHost(newValue, currentComponent);
        } else if (prop === 'style') {
          newValue = stringifyStyle(newValue);
        }
        if (values[prop] !== newValue) {
          values[prop] = newValue;
          smartSetProperty(staticCtx, elm as HTMLElement, prop, newValue, isSvg);
        }
      }
    }
    if (vnodeFlags & static_subtree) {
      return;
    }

    if (isSvg && tag === 'foreignObject') {
      flags &= ~IS_SVG;
    }

    const setsInnerHTML = props[dangerouslySetInnerHTML] !== undefined;
    if (setsInnerHTML) {
      if (qDev && newVnode.$children$.length > 0) {
        logWarn('Node can not have children when innerHTML is set');
      }
      return;
    }
    if (tag === 'textarea') {
      return;
    }
    return smartUpdateChildren(rCtx, oldVnode, newVnode, 'root', flags);
  } else if (OnRenderProp in props) {
    const cmpProps = props.props;
    setComponentProps(elCtx, rCtx, cmpProps);
    let needsRender = !!(elCtx.$flags$ & HOST_FLAG_DIRTY);
    // TODO: review this corner case
    if (!needsRender && !elCtx.$componentQrl$ && !elCtx.$element$.hasAttribute(ELEMENT_ID)) {
      setQId(rCtx, elCtx);
      elCtx.$componentQrl$ = cmpProps[OnRenderProp];
      assertQrl(elCtx.$componentQrl$ as any);
      needsRender = true;
    }

    // Rendering of children of component is more complicated,
    // since the children must be projected into the rendered slots
    // In addition, nested children might need rerendering, if that's the case
    // we need to render the nested component, and wait before projecting the content
    // since otherwise we don't know where the slots
    if (needsRender) {
      return then(renderComponent(rCtx, elCtx, flags), () =>
        renderContentProjection(rCtx, elCtx, newVnode, flags)
      );
    }
    return renderContentProjection(rCtx, elCtx, newVnode, flags);
  } else if (QSlotS in props) {
    assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');
    currentComponent.$slots$.push(newVnode);
    return;
  }
  if (vnodeFlags & static_subtree) {
    return;
  }
  return smartUpdateChildren(rCtx, oldVnode, newVnode, 'root', flags);
};

const renderContentProjection = (
  rCtx: RenderContext,
  hostCtx: QContext,
  vnode: ProcessedJSXNode,
  flags: number
): ValueOrPromise<void> => {
  if (vnode.$flags$ & static_subtree) {
    return;
  }
  const newChildren = vnode.$children$;
  const staticCtx = rCtx.$static$;
  const splittedNewChildren = splitChildren(newChildren);
  const slotMaps = getSlotMap(hostCtx);

  // Remove content from empty slots
  for (const key of Object.keys(slotMaps.slots)) {
    if (!splittedNewChildren[key]) {
      const slotEl = slotMaps.slots[key];
      const oldCh = getChildrenVnodes(slotEl, 'root');
      if (oldCh.length > 0) {
        // getVdom(slotEl).$children$ = [];
        const slotCtx = tryGetContext(slotEl);
        if (slotCtx && slotCtx.$vdom$) {
          slotCtx.$vdom$.$children$ = [];
        }
        removeChildren(staticCtx, oldCh, 0, oldCh.length - 1);
      }
    }
  }

  // Remove empty templates
  for (const key of Object.keys(slotMaps.templates)) {
    const templateEl = slotMaps.templates[key];
    if (templateEl && !splittedNewChildren[key]) {
      slotMaps.templates[key] = undefined;
      removeNode(staticCtx, templateEl);
    }
  }

  // Render into slots
  return promiseAll(
    Object.keys(splittedNewChildren).map((slotName) => {
      const newVdom = splittedNewChildren[slotName];
      const slotCtx = getSlotCtx(
        staticCtx,
        slotMaps,
        hostCtx,
        slotName,
        rCtx.$static$.$containerState$
      );
      const oldVdom = getVdom(slotCtx);
      const slotRctx = pushRenderContext(rCtx);
      slotRctx.$slotCtx$ = slotCtx;
      slotCtx.$vdom$ = newVdom;
      newVdom.$elm$ = slotCtx.$element$;

      // const oldVdom = getVdom(slotCtx.$element$);
      // const slotRctx = pushRenderContext(rCtx);
      // slotRctx.$slotCtx$ = slotCtx;
      // setVdom(slotCtx.$element$, newVdom);
      const index = staticCtx.$addSlots$.findIndex((slot) => slot[0] === slotCtx.$element$);
      if (index >= 0) {
        staticCtx.$addSlots$.splice(index, 1);
      }
      return smartUpdateChildren(slotRctx, oldVdom, newVdom, 'root', flags);
    })
  ) as any;
};

const addChildren = (
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

const removeChildren = (
  staticCtx: RenderStaticContext,
  nodes: ProcessedJSXNode[],
  startIdx: number,
  endIdx: number
): void => {
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = nodes[startIdx];
    if (ch) {
      assertDefined(ch.$elm$, 'vnode elm must be defined');
      removeNode(staticCtx, ch.$elm$);
    }
  }
};

const getSlotCtx = (
  staticCtx: RenderStaticContext,
  slotMaps: SlotMaps,
  hostCtx: QContext,
  slotName: string,
  containerState: ContainerState
): QContext => {
  const slotEl = slotMaps.slots[slotName];
  if (slotEl) {
    return getContext(slotEl, containerState);
  }
  const templateEl = slotMaps.templates[slotName];
  if (templateEl) {
    return getContext(templateEl, containerState);
  }
  const template = createTemplate(staticCtx.$doc$, slotName);
  const elCtx = createContext(template);
  elCtx.$parent$ = hostCtx;
  prepend(staticCtx, hostCtx.$element$, template);
  slotMaps.templates[slotName] = template;
  return elCtx;
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
    const elm = doc.createTextNode(vnode.$text$);
    if (signal) {
      assertDefined(currentComponent, 'signals can not be used outside components');
      const subs =
        flags & IS_IMMUTABLE
          ? ([3, elm, signal, elm] as const)
          : ([4, currentComponent.$element$, signal, elm] as const);

      elm.data = vnode.$text$ = jsxToString(trackSignal(signal, subs));
    }
    return (vnode.$elm$ = elm);
  }

  let elm: QwikElement;
  let isSvg = !!(flags & IS_SVG);
  if (!isSvg && tag === 'svg') {
    flags |= IS_SVG;
    isSvg = true;
  }
  const isVirtual = tag === VIRTUAL;
  const props = vnode.$props$;
  const staticCtx = rCtx.$static$;
  if (isVirtual) {
    elm = newVirtualElement(doc);
  } else if (tag === 'head') {
    elm = doc.head;
    flags |= IS_HEAD;
  } else {
    elm = createElement(doc, tag, isSvg);
    flags &= ~IS_HEAD;
  }
  if (vnode.$flags$ & static_subtree) {
    flags |= IS_IMMUTABLE;
  }

  vnode.$elm$ = elm;
  const elCtx = createContext(elm);
  elCtx.$parent$ = rCtx.$cmpCtx$;
  elCtx.$slotParent$ = rCtx.$slotCtx$;
  if (!isVirtual) {
    if (qDev && qInspector) {
      const dev = vnode.$dev$;
      if (dev) {
        directSetAttribute(
          elm,
          'data-qwik-inspector',
          `${encodeURIComponent(dev.fileName)}:${dev.lineNumber}:${dev.columnNumber}`
        );
      }
    }
    if (vnode.$immutableProps$) {
      setProperties(staticCtx, elCtx, currentComponent, vnode.$immutableProps$, isSvg, true);
    }
    if (props !== EMPTY_OBJ) {
      elCtx.$vdom$ = vnode;
      vnode.$props$ = setProperties(staticCtx, elCtx, currentComponent, props, isSvg, false);
    }
    if (isSvg && tag === 'foreignObject') {
      isSvg = false;
      flags &= ~IS_SVG;
    }
    if (currentComponent) {
      const scopedIds = currentComponent.$scopeIds$;
      if (scopedIds) {
        scopedIds.forEach((styleId) => {
          (elm as Element).classList.add(styleId);
        });
      }
      if (currentComponent.$flags$ & HOST_FLAG_NEED_ATTACH_LISTENER) {
        elCtx.li.push(...currentComponent.li);
        currentComponent.$flags$ &= ~HOST_FLAG_NEED_ATTACH_LISTENER;
      }
    }
    const setsInnerHTML = props[dangerouslySetInnerHTML] !== undefined;
    if (setsInnerHTML) {
      if (qDev && vnode.$children$.length > 0) {
        logWarn('Node can not have children when innerHTML is set');
      }
      return elm;
    }
    if (isSvg && tag === 'foreignObject') {
      isSvg = false;
      flags &= ~IS_SVG;
    }
  } else if (OnRenderProp in props) {
    const renderQRL = props[OnRenderProp];
    assertQrl<OnRenderFn<any>>(renderQRL);
    const containerState = rCtx.$static$.$containerState$;
    const target = createPropsState();
    const manager = containerState.$subsManager$.$createManager$();
    const proxy = new Proxy(target, new ReadWriteProxyHandler(containerState, manager));
    const expectProps = props.props;
    containerState.$proxyMap$.set(target, proxy);
    elCtx.$props$ = proxy;
    if (expectProps !== EMPTY_OBJ) {
      const keys = Object.keys(expectProps);
      const immutableMeta = ((target as any)[_IMMUTABLE] =
        (expectProps as any)[_IMMUTABLE] ?? EMPTY_OBJ);

      for (const prop of keys) {
        if (prop !== 'children' && prop !== QSlot) {
          const immutableValue = immutableMeta[prop];
          if (isSignal(immutableValue)) {
            target[_IMMUTABLE_PREFIX + prop] = immutableValue;
          } else {
            target[prop] = expectProps[prop];
          }
        }
      }
    }
    setQId(rCtx, elCtx);

    if (qDev && !qTest) {
      const symbol = renderQRL.$symbol$;
      if (symbol) {
        directSetAttribute(elm, 'data-qrl', symbol);
      }
    }

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
      const slotMap = getSlotMap(elCtx);
      const p: Promise<void>[] = [];
      for (const node of children) {
        const slotCtx = getSlotCtx(
          staticCtx,
          slotMap,
          elCtx,
          getSlotName(node),
          staticCtx.$containerState$
        );
        const slotRctx = pushRenderContext(rCtx);
        slotRctx.$slotCtx$ = slotCtx;
        const nodeElm = createElm(slotRctx, node, flags, p);
        assertDefined(node.$elm$, 'vnode elm must be defined');
        assertEqual(nodeElm, node.$elm$, 'vnode elm must be defined');
        appendChild(staticCtx, slotCtx.$element$, nodeElm);
      }

      return promiseAllLazy(p);
    });
    if (isPromise(wait)) {
      promises.push(wait);
    }
    return elm;
  } else if (QSlotS in props) {
    assertDefined(currentComponent, 'slot can only be used inside component');
    assertDefined(currentComponent.$slots$, 'current component slots must be a defined array');

    setKey(elm, vnode.$key$);
    directSetAttribute(elm, QSlotRef, currentComponent.$id$);
    directSetAttribute(elm, QSlotS, '');
    currentComponent.$slots$.push(vnode);
    staticCtx.$addSlots$.push([elm, currentComponent.$element$]);
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

const getSlotMap = (elCtx: QContext): SlotMaps => {
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
  setProperty(ctx, elm.style, 'cssText', newValue);
  return true;
};

const handleClass: PropHandler = (ctx, elm, _, newValue) => {
  assertTrue(
    newValue == null || typeof newValue === 'string',
    'class newValue must be either nullish or string',
    newValue
  );
  if (elm.namespaceURI === SVG_NS) {
    setAttribute(ctx, elm, 'class', newValue);
  } else {
    setProperty(ctx, elm, 'className', newValue);
  }
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

export const smartSetProperty = (
  staticCtx: RenderStaticContext,
  elm: QwikElement,
  prop: string,
  newValue: any,
  isSvg: boolean
) => {
  // aria attribute value should be rendered as string
  if (isAriaAttribute(prop)) {
    setAttribute(staticCtx, elm, prop, newValue != null ? String(newValue) : newValue);
    return;
  }

  // Check if its an exception
  const exception = PROP_HANDLER_MAP[prop];
  if (exception) {
    if (exception(staticCtx, elm as HTMLElement, prop, newValue)) {
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
  hostCtx: QContext | null,
  newProps: Record<string, any>,
  isSvg: boolean,
  immutable: boolean
): Record<string, any> => {
  const values: Record<string, any> = {};
  const elm = elCtx.$element$;
  const keys = Object.keys(newProps);
  for (const prop of keys) {
    let newValue = newProps[prop];
    if (prop === 'ref') {
      assertElement(elm);
      setRef(newValue, elm);
      continue;
    }

    if (isOnProp(prop)) {
      browserSetEvent(staticCtx, elCtx, prop, newValue);
      continue;
    }

    if (isSignal(newValue)) {
      assertDefined(hostCtx, 'Signals can only be used in components');
      newValue = trackSignal(
        newValue,
        immutable
          ? [1, elm, newValue, hostCtx.$element$, prop]
          : [2, hostCtx.$element$, newValue, elm, prop]
      );
    }

    if (prop === 'class') {
      if (qDev && values.class) {
        throw new TypeError('Can only provide one of class or className');
      }
      newValue = serializeClassWithHost(newValue, hostCtx);
      if (!newValue) {
        continue;
      }
    } else if (prop === 'style') {
      newValue = stringifyStyle(newValue);
    }
    values[prop] = newValue;
    smartSetProperty(staticCtx, elm, prop, newValue, isSvg);
  }
  return values;
};

export const setComponentProps = (
  elCtx: QContext,
  rCtx: RenderContext,
  expectProps: Record<string, any>
) => {
  let props = elCtx.$props$;
  if (!props) {
    elCtx.$props$ = props = createProxy(createPropsState(), rCtx.$static$.$containerState$);
  }
  if (expectProps === EMPTY_OBJ) {
    return;
  }
  const keys = Object.keys(expectProps);

  const manager = getProxyManager(props);
  assertDefined(manager, `props have to be a proxy, but it is not`, props);
  const target = getProxyTarget(props);
  assertDefined(target, `props have to be a proxy, but it is not`, props);

  const immutableMeta = ((target as any)[_IMMUTABLE] =
    (expectProps as any)[_IMMUTABLE] ?? EMPTY_OBJ);

  for (const prop of keys) {
    if (prop !== 'children' && prop !== QSlot && !immutableMeta[prop]) {
      const value = expectProps[prop];
      if (target[prop] !== value) {
        target[prop] = value;
        manager.$notifySubs$(prop);
      }
    }
  }
};

export const cleanupTree = (
  elm: Node | VirtualElement,
  staticCtx: RenderStaticContext,
  subsManager: SubscriptionManager,
  stopSlots: boolean
) => {
  subsManager.$clearSub$(elm);
  if (isQwikElement(elm)) {
    if (stopSlots && elm.hasAttribute(QSlotS)) {
      staticCtx.$rmSlots$.push(elm);
      return;
    }
    const ctx = tryGetContext(elm);
    if (ctx) {
      cleanupContext(ctx, subsManager);
    }
    const end = isVirtualElement(elm) ? elm.close : null;
    let node: Node | null | VirtualElement = elm.firstChild;
    while ((node = processVirtualNodes(node))) {
      cleanupTree(node!, staticCtx, subsManager, true);
      node = node.nextSibling;
      if (node === end) {
        break;
      }
    }
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

export const directInsertAfter = (
  parent: QwikElement,
  child: Node | VirtualElement,
  ref: Node | VirtualElement | null
) => {
  if (isVirtualElement(child)) {
    child.insertBeforeTo(parent, getRootNode(ref)?.nextSibling);
  } else {
    parent.insertBefore(child, getRootNode(ref)?.nextSibling);
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
