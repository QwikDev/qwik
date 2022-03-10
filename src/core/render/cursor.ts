import { OnRenderProp, QHostAttr, QSlotAttr } from '../util/markers';
import { getContext, getProps, setEvent } from '../props/props';
import { isOn$Prop, isOnProp } from '../props/props-on';
export const SVG_NS = 'http://www.w3.org/2000/svg';
import { $, Host, JSXNode, ValueOrPromise } from '../index';
import { getQComponent, QComponentCtx } from '../component/component-ctx';
import { promiseAll, then } from '../util/promises';
import type { RenderingState } from './notify-render';
import { assertDefined, assertEqual } from '../assert/assert';
import { NodeType } from '../util/types';
import { intToStr } from '../object/store';
import { EMPTY_ARRAY } from '../util/flyweight';
import { SkipRerender } from './jsx/host.public';
import { logDebug, logError } from '../util/log';

type KeyToIndexMap = { [key: string]: number };

type PropHandler = (
  ctx: RenderContext,
  el: HTMLElement,
  key: string,
  newValue: any,
  oldValue: any
) => boolean;

interface RenderOperation {
  el: Node;
  operation: string;
  args: any[];
  fn: () => void;
}

export type ChildrenMode = 'root' | 'slot' | 'fallback' | 'default';

export interface RenderPerf {
  timing: PerfEvent[];
  visited: number;
}
export interface RenderContext {
  doc: Document;
  roots: Element[];
  hostElements: Set<Element>;
  operations: RenderOperation[];
  component: QComponentCtx | undefined;
  globalState: RenderingState;
  perf: RenderPerf;
}

export interface PerfEvent {
  name: string;
  timeStart: number;
  timeEnd: number;
}

export function smartUpdateChildren(
  ctx: RenderContext,
  elm: Node,
  ch: JSXNode[],
  mode: ChildrenMode,
  isSvg: boolean
) {
  if (ch.length === 1 && ch[0].type === SkipRerender) {
    if (elm.firstChild !== null) {
      return;
    }
    ch = ch[0].children;
  }
  const oldCh = getChildren(elm, mode);

  if (oldCh.length > 0 && ch.length > 0) {
    return updateChildren(ctx, elm, oldCh, ch, isSvg);
  } else if (ch.length > 0) {
    return addVnodes(ctx, elm, null, ch, 0, ch.length - 1, isSvg);
  } else if (oldCh.length > 0) {
    return removeVnodes(ctx, elm, oldCh, 0, oldCh.length - 1);
  }
}

export function updateChildren(
  ctx: RenderContext,
  parentElm: Node,
  oldCh: Node[],
  newCh: JSXNode[],
  isSvg: boolean
): ValueOrPromise<void> {
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
  let elmToMove: Node;
  let before: any;
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
      results.push(patchVnode(ctx, oldStartVnode, newStartVnode, isSvg));
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      results.push(patchVnode(ctx, oldEndVnode, newEndVnode, isSvg));
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newEndVnode)) {
      // Vnode moved right
      results.push(patchVnode(ctx, oldStartVnode, newEndVnode, isSvg));

      insertBefore(ctx, parentElm, oldStartVnode, oldEndVnode.nextSibling);
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) {
      // Vnode moved left
      results.push(patchVnode(ctx, oldEndVnode, newStartVnode, isSvg));

      insertBefore(ctx, parentElm, oldEndVnode, oldStartVnode);
      oldEndVnode = oldCh[--oldEndIdx];
      newStartVnode = newCh[++newStartIdx];
    } else {
      if (oldKeyToIdx === undefined) {
        oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
      }
      idxInOld = oldKeyToIdx[newStartVnode.key as string];
      if (idxInOld === undefined) {
        // New element
        const newElm = createElm(ctx, newStartVnode, isSvg);
        results.push(
          then(newElm, (newElm) => {
            insertBefore(ctx, parentElm, newElm, oldStartVnode);
          })
        );
      } else {
        elmToMove = oldCh[idxInOld];
        if (elmToMove.nodeName !== newStartVnode.type) {
          const newElm = createElm(ctx, newStartVnode, isSvg);
          results.push(
            then(newElm, (newElm) => {
              insertBefore(ctx, parentElm, newElm, oldStartVnode);
            })
          );
        } else {
          results.push(patchVnode(ctx, elmToMove, newStartVnode, isSvg));
          oldCh[idxInOld] = undefined as any;
          insertBefore(ctx, parentElm, elmToMove, oldStartVnode);
        }
      }
      newStartVnode = newCh[++newStartIdx];
    }
  }

  if (newStartIdx <= newEndIdx) {
    before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
    results.push(addVnodes(ctx, parentElm, before, newCh, newStartIdx, newEndIdx, isSvg));
  }

  let wait = promiseAll(results) as any;
  if (oldStartIdx <= oldEndIdx) {
    wait = then(wait, () => {
      removeVnodes(ctx, parentElm, oldCh, oldStartIdx, oldEndIdx);
    });
  }
  return wait;
}

function isComponentNode(node: JSXNode) {
  return node.props && OnRenderProp in node.props;
}

function getCh(elm: Node) {
  return Array.from(elm.childNodes).filter(isNode);
}

export function getChildren(elm: Node, mode: ChildrenMode): Node[] {
  switch (mode) {
    case 'default':
      return getCh(elm);
    case 'slot':
      return getCh(elm).filter(isChildSlot);
    case 'root':
      return getCh(elm).filter(isChildComponent);
    case 'fallback':
      return getCh(elm).filter(isFallback);
  }
}
export function isNode(elm: Node): boolean {
  return elm.nodeType === 1 || elm.nodeType === 3;
}

function isFallback(node: Node): boolean {
  return node.nodeName === 'Q:FALLBACK';
}

function isChildSlot(node: Node) {
  return node.nodeName !== 'Q:FALLBACK' && isChildComponent(node);
}

function isSlotTemplate(node: Node): node is HTMLTemplateElement {
  return node.nodeName === 'TEMPLATE' && (node as Element).hasAttribute(QSlotAttr);
}

function isChildComponent(node: Node): boolean {
  return node.nodeName !== 'TEMPLATE' || !(node as Element).hasAttribute(QSlotAttr);
}

function splitBy<T>(input: T[], condition: (item: T) => string): Record<string, T[]> {
  const output: Record<string, T[]> = {};
  for (const item of input) {
    const key = condition(item);
    const array = output[key] ?? (output[key] = []);
    array.push(item);
  }
  return output;
}

export function patchVnode(
  ctx: RenderContext,
  elm: Node,
  vnode: JSXNode<any>,
  isSvg: boolean
): ValueOrPromise<void> {
  ctx.perf.visited++;
  const tag = vnode.type;
  if (tag === '#text') {
    if ((elm as Text).data !== vnode.text) {
      setProperty(ctx, elm, 'data', vnode.text);
    }
    return;
  }

  if (tag === Host || tag === SkipRerender) {
    return;
  }

  if (!isSvg) {
    isSvg = tag === 'svg';
  }

  let promise: ValueOrPromise<void>;
  const dirty = updateProperties(ctx, elm as Element, vnode.props, isSvg);
  const isSlot = tag === 'q:slot';
  if (isSvg && vnode.type === 'foreignObject') {
    isSvg = false;
  } else if (isSlot) {
    ctx.component!.slots.push(vnode);
  }
  const isComponent = isComponentNode(vnode);
  let componentCtx: QComponentCtx | undefined;
  if (dirty) {
    assertEqual(isComponent, true);
    componentCtx = getQComponent(elm as Element)!;
    promise = componentCtx.render(ctx);
  }
  const ch = vnode.children;
  if (isComponent) {
    return then(promise, () => {
      const slotMaps = getSlots(componentCtx, elm as Element);
      const splittedChidren = splitBy(ch, getSlotName);
      const promises: ValueOrPromise<void>[] = [];

      // Mark empty slots and remove content
      Object.entries(slotMaps.slots).forEach(([key, slotEl]) => {
        if (slotEl && !splittedChidren[key]) {
          const oldCh = getChildren(slotEl, 'slot');
          if (oldCh.length > 0) {
            removeVnodes(ctx, slotEl, oldCh, 0, oldCh.length - 1);
          }
        }
      });

      // Render into slots
      Object.entries(splittedChidren).forEach(([key, ch]) => {
        const slotElm = getSlotElement(ctx, slotMaps, elm as Element, key);
        promises.push(smartUpdateChildren(ctx, slotElm, ch, 'slot', isSvg));
      });
      return then(promiseAll(promises), () => {
        removeTemplates(ctx, slotMaps);
      });
    });
  }
  return then(promise, () => {
    const mode = isSlot ? 'fallback' : 'default';
    return smartUpdateChildren(ctx, elm, ch, mode, isSvg);
  });
}

function addVnodes(
  ctx: RenderContext,
  parentElm: Node,
  before: Node | null,
  vnodes: JSXNode[],
  startIdx: number,
  endIdx: number,
  isSvg: boolean
): ValueOrPromise<void> {
  const promises = [];
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    assertDefined(ch);
    promises.push(createElm(ctx, ch, isSvg));
  }
  return then(promiseAll(promises) as any, (children: Node[]) => {
    for (const child of children) {
      insertBefore(ctx, parentElm, child, before);
    }
  });
}

function removeVnodes(
  ctx: RenderContext,
  parentElm: Node,
  nodes: Node[],
  startIdx: number,
  endIdx: number
): void {
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = nodes[startIdx];
    assertDefined(ch);
    removeNode(ctx, parentElm, ch);
  }
}

let refCount = 0;
const RefSymbol = Symbol();

function setSlotRef(ctx: RenderContext, hostElm: Element, slotEl: Element) {
  let ref = (hostElm as any)[RefSymbol] ?? hostElm.getAttribute('q:sref');
  if (ref === null) {
    ref = intToStr(refCount++);
    (hostElm as any)[RefSymbol] = ref;
    setAttribute(ctx, hostElm, 'q:sref', ref);
  }
  slotEl.setAttribute('q:sref', ref);
}

function getSlotElement(
  ctx: RenderContext,
  slotMaps: SlotMaps,
  parentEl: Element,
  slotName: string
): Element {
  const slotEl = slotMaps.slots[slotName];
  if (slotEl) {
    return slotEl;
  }
  const templateEl = slotMaps.templates[slotName];
  if (templateEl) {
    return templateEl.content as any;
  }
  const template = createTemplate(ctx, slotName);
  prepend(ctx, parentEl, template);
  slotMaps.templates[slotName] = template;
  return template.content as any;
}

function createTemplate(ctx: RenderContext, slotName: string) {
  const template = createElement(ctx, 'template', false) as HTMLTemplateElement;
  template.setAttribute(QSlotAttr, slotName);
  return template;
}

function removeTemplates(ctx: RenderContext, slotMaps: SlotMaps) {
  Object.keys(slotMaps.templates).forEach((key) => {
    const template = slotMaps.templates[key]!;
    if (template && slotMaps.slots[key] !== undefined) {
      removeNode(ctx, template.parentNode!, template);
      slotMaps.templates[key] = undefined;
    }
  });
}

export function resolveSlotProjection(
  ctx: RenderContext,
  hostElm: Element,
  before: SlotMaps,
  after: SlotMaps
) {
  Object.entries(before.slots).forEach(([key, slotEl]) => {
    if (slotEl && !after.slots[key]) {
      // Slot removed
      // Move slot to template
      const template = createTemplate(ctx, key);
      const slotChildren = getChildren(slotEl, 'slot');
      template.content.append(...slotChildren);
      hostElm.insertBefore(template, hostElm.firstChild);

      ctx.operations.push({
        el: template,
        operation: 'slot-to-template',
        args: slotChildren,
        fn: () => {},
      });
    }
  });

  Object.entries(after.slots).forEach(([key, slotEl]) => {
    if (slotEl && !before.slots[key]) {
      // Slot created
      // Move template to slot
      const template = before.templates[key];
      if (template) {
        slotEl.appendChild(template.content);
        template.remove();
        ctx.operations.push({
          el: slotEl,
          operation: 'template-to-slot',
          args: [template],
          fn: () => {},
        });
      }
    }
  });
}

function getSlotName(node: JSXNode): string {
  return node.props?.['q:slot'] ?? '';
}

function createElm(ctx: RenderContext, vnode: JSXNode, isSvg: boolean): ValueOrPromise<Node> {
  ctx.perf.visited++;
  const tag = vnode.type;
  if (tag === '#text') {
    return (vnode.elm = createTextNode(ctx, vnode.text!));
  }
  if (!isSvg) {
    isSvg = tag === 'svg';
  }

  const data = vnode.props;
  const elm = (vnode.elm = createElement(ctx, tag, isSvg));
  const isComponent = isComponentNode(vnode);
  setKey(elm, vnode.key);
  updateProperties(ctx, elm, data, isSvg);

  if (isSvg && tag === 'foreignObject') {
    isSvg = false;
  }
  const currentComponent = ctx.component;
  if (currentComponent) {
    const styleTag = currentComponent.styleClass;
    if (styleTag) {
      classlistAdd(ctx, elm, styleTag);
    }
    if (tag === 'q:slot') {
      setSlotRef(ctx, currentComponent.hostElement, elm);
      ctx.component!.slots.push(vnode);
    }
  }

  let wait: ValueOrPromise<void>;
  let componentCtx: QComponentCtx | undefined;
  if (isComponent) {
    componentCtx = getQComponent(elm as any)!;
    const hostStyleTag = componentCtx.styleHostClass;
    elm.setAttribute(QHostAttr, '');
    if (hostStyleTag) {
      classlistAdd(ctx, elm, hostStyleTag);
    }
    wait = componentCtx.render(ctx);
  }
  return then(wait, () => {
    let children = vnode.children;
    if (children.length > 0) {
      if (children.length === 1 && children[0].type === SkipRerender) {
        children = children[0].children;
      }
      const slotMap = isComponent ? getSlots(componentCtx, elm) : undefined;
      const promises = children.map((ch) => createElm(ctx, ch, isSvg));
      return then(promiseAll(promises) as any, () => {
        let parent = elm;
        for (const node of children) {
          if (slotMap) {
            parent = getSlotElement(ctx, slotMap, elm, getSlotName(node));
          }
          parent.appendChild(node.elm!);
        }
        return elm;
      });
    }
    return elm;
  });
}
interface SlotMaps {
  slots: Record<string, Element | undefined>;
  templates: Record<string, HTMLTemplateElement | undefined>;
}

const getSlots = (componentCtx: QComponentCtx | undefined, hostElm: Element): SlotMaps => {
  const slots: Record<string, Element> = {};
  const templates: Record<string, HTMLTemplateElement> = {};
  const slotRef = hostElm.getAttribute('q:sref');
  const existingSlots = Array.from(hostElm.querySelectorAll(`q\\:slot[q\\:sref="${slotRef}"]`));
  const newSlots = componentCtx?.slots ?? EMPTY_ARRAY;
  const t = Array.from(hostElm.childNodes).filter(isSlotTemplate);

  // Map slots
  for (const elm of existingSlots) {
    slots[elm.getAttribute('name') ?? ''] = elm;
  }

  // Map virtual slots
  for (const vnode of newSlots) {
    slots[vnode.props?.name ?? ''] = vnode.elm as Element;
  }

  // Map templates
  for (const elm of t) {
    templates[elm.getAttribute('name') ?? ''] = elm;
  }

  return { slots, templates };
};

const handleStyle: PropHandler = (ctx, elm, _, newValue, oldValue) => {
  // TODO, needs reimplementation
  if (typeof newValue == 'string') {
    elm.style.cssText = newValue;
  } else {
    for (const prop in oldValue) {
      if (!newValue || newValue[prop] == null) {
        if (prop.includes('-')) {
          styleSetProperty(ctx, elm, prop, null);
        } else {
          setProperty(ctx, elm.style, prop, '');
        }
      }
    }

    for (const prop in newValue) {
      const value = newValue[prop];
      if (!oldValue || value !== oldValue[prop]) {
        if (prop.includes('-')) {
          styleSetProperty(ctx, elm, prop, value);
        } else {
          setProperty(ctx, elm.style, prop, value);
        }
      }
    }
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

const setInnerHTML: PropHandler = (ctx, elm, prop, newValue) => {
  setProperty(ctx, elm, prop, newValue);
  setAttribute(ctx, elm, 'q:static', '');
  return true;
};

const PROP_HANDLER_MAP: Record<string, PropHandler> = {
  style: handleStyle,
  value: checkBeforeAssign,
  checked: checkBeforeAssign,
  innerHTML: setInnerHTML,
};

const ALLOWS_PROPS = ['className', 'style', 'id', 'q:slot'];

export function updateProperties(
  rctx: RenderContext,
  node: Element,
  expectProps: Record<string, any> | null,
  isSvg: boolean
) {
  if (!expectProps) {
    return false;
  }
  const ctx = getContext(node);
  const qwikProps = OnRenderProp in expectProps ? getProps(ctx) : undefined;

  if ('class' in expectProps) {
    const className = expectProps.class;
    expectProps.className =
      className && typeof className == 'object'
        ? Object.keys(className)
            .filter((k) => className[k])
            .join(' ')
        : className;
  }
  // TODO
  // when a proper disappears, we cant reset the value

  for (let key of Object.keys(expectProps)) {
    if (key === 'children' || key === 'class') {
      continue;
    }
    const newValue = expectProps[key];

    if (isOnProp(key)) {
      setEvent(rctx, ctx, key, newValue);
      continue;
    }
    if (isOn$Prop(key)) {
      setEvent(rctx, ctx, key.replace('$', ''), $(newValue));
      continue;
    }

    // Early exit if value didnt change
    const oldValue = ctx.cache.get(key);
    if (newValue === oldValue) {
      continue;
    }
    ctx.cache.set(key, newValue);

    // Check of data- or aria-
    if (key.startsWith('data-') || key.startsWith('aria-') || isSvg) {
      setAttribute(rctx, node, key, newValue);
      continue;
    }

    if (qwikProps) {
      const skipProperty = ALLOWS_PROPS.includes(key);
      const hPrefixed = key.startsWith('h:');
      if (!skipProperty && !hPrefixed) {
        // Qwik props
        qwikProps[key] = newValue;
        continue;
      }
      if (hPrefixed) {
        key = key.slice(2);
      }
    }

    // Check if its an exception
    const exception = PROP_HANDLER_MAP[key];
    if (exception) {
      if (exception(rctx, node as HTMLElement, key, newValue, oldValue)) {
        continue;
      }
    }

    // Check if property in prototype
    if (key in node) {
      setProperty(rctx, node, key, newValue);
      continue;
    }

    // Fallback to render attribute
    setAttribute(rctx, node, key, newValue);
  }
  return ctx.dirty;
}

export const startEvent = (ctx: RenderContext, name: string) => {
  const event: PerfEvent = {
    name,
    timeStart: performance.now(),
    timeEnd: 0,
  };
  ctx.perf.timing.push(event);
  return () => {
    event.timeEnd = performance.now();
  };
};

export function setAttribute(ctx: RenderContext, el: Element, prop: string, value: string | null) {
  const fn = () => {
    if (value == null) {
      el.removeAttribute(prop);
    } else {
      el.setAttribute(prop, String(value));
    }
  };
  ctx.operations.push({
    el,
    operation: 'set-attribute',
    args: [prop, value],
    fn,
  });
}

function styleSetProperty(ctx: RenderContext, el: HTMLElement, prop: string, value: string | null) {
  const fn = () => {
    if (value == null) {
      el.style.removeProperty(prop);
    } else {
      el.style.setProperty(prop, String(value));
    }
  };
  ctx.operations.push({
    el,
    operation: 'style-set-property',
    args: [prop, value],
    fn,
  });
}

function classlistAdd(ctx: RenderContext, el: Element, hostStyleTag: string) {
  const fn = () => {
    el.classList.add(hostStyleTag);
  };
  ctx.operations.push({
    el,
    operation: 'classlist-add',
    args: [hostStyleTag],
    fn,
  });
}

function setProperty(ctx: RenderContext, node: any, key: string, value: any) {
  const fn = () => {
    try {
      node[key] = value;
    } catch (err) {
      logError('Set property', { node, key, value }, err);
    }
  };
  ctx.operations.push({
    el: node,
    operation: 'set-property',
    args: [key, value],
    fn,
  });
}

function createElement(ctx: RenderContext, expectTag: string, isSvg: boolean): Element {
  const el = isSvg ? ctx.doc.createElementNS(SVG_NS, expectTag) : ctx.doc.createElement(expectTag);
  ctx.operations.push({
    el,
    operation: 'create-element',
    args: [expectTag],
    fn: () => {},
  });
  return el;
}

function insertBefore<T extends Node>(
  ctx: RenderContext,
  parent: Node,
  newChild: T,
  refChild: Node | null
): T {
  const fn = () => {
    parent.insertBefore(newChild, refChild ? refChild : null);
  };
  ctx.operations.push({
    el: parent,
    operation: 'insert-before',
    args: [newChild, refChild],
    fn,
  });
  return newChild;
}

function prepend(ctx: RenderContext, parent: Element, newChild: Node) {
  const fn = () => {
    parent.insertBefore(newChild, parent.firstChild);
  };
  ctx.operations.push({
    el: parent,
    operation: 'prepend',
    args: [newChild],
    fn,
  });
}

function removeNode(ctx: RenderContext, parent: Node, el: Node) {
  const fn = () => {
    parent.removeChild(el);
  };
  ctx.operations.push({
    el: el,
    operation: 'remove',
    args: [],
    fn,
  });
}

function createTextNode(ctx: RenderContext, text: string): Text {
  return ctx.doc.createTextNode(text);
}

export function executeContextWithSlots(ctx: RenderContext) {
  const before = ctx.roots.map((elm) => getSlots(undefined, elm));

  executeContext(ctx);

  const after = ctx.roots.map((elm) => getSlots(undefined, elm));
  assertEqual(before.length, after.length);

  for (let i = 0; i < before.length; i++) {
    resolveSlotProjection(ctx, ctx.roots[i], before[i], after[i]);
  }
}

export function executeContext(ctx: RenderContext) {
  for (const op of ctx.operations) {
    op.fn();
  }
}

export function printRenderStats(ctx: RenderContext) {
  const byOp: Record<string, number> = {};
  for (const op of ctx.operations) {
    byOp[op.operation] = (byOp[op.operation] ?? 0) + 1;
  }
  const affectedElements = Array.from(new Set(ctx.operations.map((a) => a.el)));
  const stats = {
    byOp,
    roots: ctx.roots,
    hostElements: Array.from(ctx.hostElements),
    affectedElements,
    visitedNodes: ctx.perf.visited,
    operations: ctx.operations.map((v) => [v.operation, v.el, ...v.args]),
  };
  logDebug('Render stats', stats);
  return stats;
}

function createKeyToOldIdx(children: Node[], beginIdx: number, endIdx: number): KeyToIndexMap {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const child = children[i];
    if (child.nodeType == NodeType.ELEMENT_NODE) {
      const key = getKey(child as Element);
      if (key !== undefined) {
        map[key as string] = i;
      }
    }
  }
  return map;
}

const KEY_SYMBOL = Symbol('vnode key');

function getKey(el: Element): string | null {
  let key = (el as any)[KEY_SYMBOL];
  if (key === undefined) {
    key = (el as any)[KEY_SYMBOL] = el.getAttribute('q:key');
  }
  return key;
}

function setKey(el: Element, key: string | null) {
  if (typeof key === 'string') {
    el.setAttribute('q:key', key);
  }
  (el as any)[KEY_SYMBOL] = key;
}

function sameVnode(vnode1: Node, vnode2: JSXNode): boolean {
  const isSameSel = vnode1.nodeName.toLowerCase() === vnode2.type;
  const isSameKey =
    vnode1.nodeType === NodeType.ELEMENT_NODE ? getKey(vnode1 as Element) === vnode2.key : true;
  return isSameSel && isSameKey;
}
