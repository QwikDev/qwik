import {
  assertEqual,
} from '../assert/assert';
import { isComment } from '../util/element';
import { OnRenderProp } from '../util/markers';
import { getContext, getProps, setEvent } from '../props/props';
import { isOn$Prop, isOnProp } from '../props/props-on';
export const SVG_NS = 'http://www.w3.org/2000/svg';
import { $, Fragment, Host, JSXNode, ValueOrPromise } from '../index';
import { getQComponent, QComponentCtx } from '../component/component-ctx';
import { promiseAll, then } from '../util/promises';
type PropHandler = (el: HTMLElement, key: string, newValue: any, oldValue: any) => boolean;

const noop: PropHandler = () => {
  return true;
};

const handleStyle: PropHandler = (elm, _, newValue, oldValue) => {
  if (typeof newValue == 'string') {
    elm.style.cssText = newValue;
  } else {
    for (const prop in oldValue) {
      if (!newValue || newValue[prop] == null) {
        if (prop.includes('-')) {
          elm.style.removeProperty(prop);
        } else {
          (elm as any).style[prop] = '';
        }
      }
    }

    for (const prop in newValue) {
      if (!oldValue || newValue[prop] !== oldValue[prop]) {
        if (prop.includes('-')) {
          elm.style.setProperty(prop, newValue[prop]);
        } else {
          (elm as any).style[prop] = newValue[prop];
        }
      }
    }
  }
  return true;
};

const PROP_HANDLER_MAP: Record<string, PropHandler> = {
  class: noop,
  style: handleStyle,
};

const ALLOWS_PROPS = ['className', 'class', 'style', 'id', 'title'];

export function updateProperties(rctx: RenderContext, node: Element, expectProps: Record<string, any>, isSvg: boolean) {
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

  for (const key of Object.keys(expectProps)) {
    if (key === 'children') {
      continue;
    }
    const newValue = expectProps[key];

    if (isOnProp(key)) {
      setEvent(ctx, key, newValue);
      continue;
    }
    if (isOn$Prop(key)) {
      setEvent(ctx, key.replace('$', ''), $(newValue));
      continue;
    }

    // Early exit if value didnt change
    const oldValue = ctx.cache.get(key);
    if (newValue === oldValue) {
      continue;
    }
    ctx.cache.set(key, newValue);

    const skipQwik = ALLOWS_PROPS.includes(key) || key.startsWith('h:');
    if (qwikProps && !skipQwik) {
      // Qwik props
      qwikProps[key] = newValue;
    } else {
      // Check of data- or aria-
      if (key.startsWith('data-') || key.endsWith('aria-') || isSvg) {
        setAttribute(rctx, node, key, newValue);
        continue;
      }

      // Check if its an exception
      const exception = PROP_HANDLER_MAP[key];
      if (exception) {
        if (exception(node as HTMLElement, key, newValue, oldValue)) {
          continue;
        }
      }

      // Check if property in prototype
      if (key in node) {
        setProperty(rctx, node, key, newValue);
      }

      // Fallback to render attribute
      setAttribute(rctx, node, key, newValue);
    }
  }
  return false;
}

interface RenderOperation {
  el: Node;
  operation: 'set-attribute' | 'set-property' | 'insert-before' | 'remove' | 'append-child';
  args: any[];
  fn: () => void;
}

export interface RenderContext {
  doc: Document;
  operations: RenderOperation[];
  render: boolean;
  component?: QComponentCtx;
}

function setAttribute(ctx: RenderContext, el: Element, prop: string, value: string | null) {
  const fn = () => {
    if (value == null) {
      el.removeAttribute(prop);
    } else {
      el.setAttribute(prop, String(value));
    }
  }
  if (ctx.render) {
    return fn();
  }
  ctx.operations.push({
    el,
    operation: 'set-attribute',
    args: [prop, value],
    fn
  });
}

function setProperty(ctx: RenderContext, node: any, key: string, value: any) {
  const fn = () => {
    try {
      node[key] = value;
    } catch (err) {
      console.error(err)
    }
  }
  if (ctx.render) {
    return fn();
  }
  ctx.operations.push({
    el: node,
    operation: 'set-property',
    args: [key, value],
    fn
  });
}



function createElement(ctx: RenderContext, expectTag: string, isSvg: boolean): Element {
  return isSvg ? ctx.doc.createElementNS(SVG_NS, expectTag) : ctx.doc.createElement(expectTag)
}

function insertBefore<T extends Node>(ctx: RenderContext, parent: Node, newChild: T, refChild: Node | null): T {
  const fn = () => {
    parent.insertBefore(
      newChild,
      refChild ? refChild : null
    );
  }
  if (ctx.render) {
    fn();
  } else {
    ctx.operations.push({
      el: parent,
      operation: 'insert-before',
      args: [newChild, refChild],
      fn
    });
  }
  return newChild;
}

function appendChild<T extends Node>(ctx: RenderContext, parent: Node, newChild: T): T {
  const fn = () => {
    parent.appendChild(
      newChild,
    );
  }
  if (ctx.render) {
    fn();
  } else {
    ctx.operations.push({
      el: parent,
      operation: 'append-child',
      args: [newChild],
      fn
    });
  }
  return newChild;
}

function removeNode(ctx: RenderContext, parent: Node, el: Node) {
  const fn = () => {
    parent.removeChild(el);
  }
  if (ctx.render) {
    return fn();
  }
  ctx.operations.push({
    el: parent,
    operation: 'remove',
    args: [el],
    fn
  });
}

function createTextNode(ctx: RenderContext, text: string): Text {
  return ctx.doc.createTextNode(text);
}

export function executeContext(ctx: RenderContext) {
  console.log('executeContext', ctx.operations);
  for (const op of ctx.operations) {
    op.fn();
  }
}


type KeyToIndexMap = { [key: string]: number };

function createKeyToOldIdx(
  children: Node[],
  beginIdx: number,
  endIdx: number
): KeyToIndexMap {
  const map: KeyToIndexMap = {};
  for (let i = beginIdx; i <= endIdx; ++i) {
    const key = getKey(children[i]);
    if (key !== undefined) {
      map[key as string] = i;
    }
  }
  return map;
}


function getKey(vnode1: Node) {
  return '';
}

function sameVnode(vnode1: Node, vnode2: JSXNode): boolean {
  const isSameKey = getKey(vnode1) === vnode2.key;
  const isSameSel = vnode1.nodeName === vnode2.type;

  return isSameSel && isSameKey;
}

export function updateChildren(
  ctx: RenderContext,
  parentElm: Node,
  oldCh: Node[],
  newCh: JSXNode[],
  isSvg: boolean,
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
  let promises = [];

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
      promises.push(patchVnode(ctx, oldStartVnode, newStartVnode, isSvg));
      oldStartVnode = oldCh[++oldStartIdx];
      newStartVnode = newCh[++newStartIdx];
    } else if (sameVnode(oldEndVnode, newEndVnode)) {
      promises.push(patchVnode(ctx, oldEndVnode, newEndVnode, isSvg));
      oldEndVnode = oldCh[--oldEndIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldStartVnode, newEndVnode)) {
      // Vnode moved right
      promises.push(patchVnode(ctx, oldStartVnode, newEndVnode, isSvg));

      insertBefore(
        ctx,
        parentElm,
        oldStartVnode,
        oldEndVnode.nextSibling
      );
      oldStartVnode = oldCh[++oldStartIdx];
      newEndVnode = newCh[--newEndIdx];
    } else if (sameVnode(oldEndVnode, newStartVnode)) {
      // Vnode moved left
      promises.push(patchVnode(ctx, oldEndVnode, newStartVnode, isSvg));

      insertBefore(
        ctx,
        parentElm,
        oldEndVnode, oldStartVnode
      );
      oldEndVnode = oldCh[--oldEndIdx];
      newStartVnode = newCh[++newStartIdx];
    } else {
      if (oldKeyToIdx === undefined) {
        oldKeyToIdx = createKeyToOldIdx(oldCh, oldStartIdx, oldEndIdx);
      }
      idxInOld = oldKeyToIdx[newStartVnode.key as string];
      if (isUndef(idxInOld)) {
        // New element
        let newElm = createElm(ctx, newStartVnode, isSvg);
        promises.push(then(newElm, (newElm) => {
          insertBefore(
            ctx,
            parentElm,
            newElm,
            oldStartVnode
          );
        }));
      } else {
        elmToMove = oldCh[idxInOld];
        if (elmToMove.nodeName !== newStartVnode.type) {
          let newElm = createElm(ctx, newStartVnode, isSvg);
          promises.push(then(newElm, (newElm) => {
            insertBefore(
              ctx,
              parentElm,
              newElm,
              oldStartVnode
            );
          }));
        } else {
          promises.push(patchVnode(ctx, elmToMove, newStartVnode, isSvg));
          oldCh[idxInOld] = undefined as any;
          insertBefore(ctx, parentElm, elmToMove, oldStartVnode);
        }
      }
      newStartVnode = newCh[++newStartIdx];
    }
  }

  if (newStartIdx <= newEndIdx) {
    before = newCh[newEndIdx + 1] == null ? null : newCh[newEndIdx + 1].elm;
    promises.push(addVnodes(
      ctx,
      parentElm,
      before,
      newCh,
      newStartIdx,
      newEndIdx,
      isSvg,
    ))
  }

  let wait = promiseAll(promises) as any;
  if (oldStartIdx <= oldEndIdx) {
    wait = then(wait, () => {
      removeVnodes(ctx, parentElm, oldCh, oldStartIdx, oldEndIdx);
    });
  }

  return wait;
}

function isComponentNode(node: JSXNode) {
  return OnRenderProp in node.props;
}

export function patchVnode(
  ctx: RenderContext,
  elm: Node,
  vnode: JSXNode<any>,
  isSvg: boolean
): ValueOrPromise<void> {
  const oldCh = Array.from(elm.childNodes);
  const ch = vnode.children;
  if (vnode.type === Host) {
    console.log('Host can not be used here');
    return updateChildren(ctx, elm, oldCh, ch || [], isSvg);
  } if (isUndef(vnode.text)) {
    let element: ValueOrPromise<Node> = elm;
    const isComponent = isComponentNode(vnode);
    return then(element, () => {
      if (isComponent) {
        console.log('HANDLE projection');
        return;
      }
      if (isDef(oldCh) && isDef(ch)) {
        return updateChildren(ctx, elm, oldCh, ch, isSvg);
      } else if (ch != null) {
        if (elm.textContent) setTextContent(elm, "");
        return addVnodes(ctx, elm, null, ch, 0, ch.length - 1, isSvg);
      } else if (isDef(oldCh)) {
        return removeVnodes(ctx, elm, oldCh, 0, oldCh.length - 1);
      } else if (elm.textContent) {
        return setTextContent(elm, "");
      }
    });
  } else if (elm.textContent !== vnode.text) {
    if (isDef(oldCh)) {
      removeVnodes(ctx, elm, oldCh, 0, oldCh.length - 1);
    }
    setTextContent(elm, vnode.text!);
  }
}

function isUndef(s: any): s is undefined {
  return s === undefined;
}
type NonUndefined<T> = T extends undefined ? never : T;

function isDef<A>(s: A): s is NonUndefined<A> {
  return s !== undefined;
}

function addVnodes(
  ctx: RenderContext,
  parentElm: Node,
  before: Node | null,
  vnodes: JSXNode[],
  startIdx: number,
  endIdx: number,
  isSvg: boolean,
): ValueOrPromise<void> {
  let promises = [];
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    if (ch != null) {
      promises.push(createElm(ctx, ch, isSvg));
    }
  }
  return then(promiseAll(promises) as any, (children: Node[]) => {
    for (const child of children) {
      insertBefore(ctx, parentElm, child, before);
    }
  })
}

function setTextContent(node: Node, text: string | null): void {
  node.textContent = text;
}
function removeVnodes(
  ctx: RenderContext,
  parentElm: Node,
  vnodes: Node[],
  startIdx: number,
  endIdx: number
): void {
  for (; startIdx <= endIdx; ++startIdx) {
    const ch = vnodes[startIdx];
    if (ch != null) {
      removeNode(ctx, parentElm, ch);
    }
  }
}


function createElm(ctx: RenderContext, vnode: JSXNode, isSvg: boolean): ValueOrPromise<Node> {
  let i: any;
  let data = vnode.props;
  const children = vnode.children;
  const tag = vnode.type;
  if (tag === '#text') {
    return createTextNode(ctx, vnode.text!);
  }
  const elm = vnode.elm = createElement(ctx, tag, isSvg);
  updateProperties(ctx, elm, data, isSvg);

  let wait: ValueOrPromise<any>;
  const isComponent = isComponentNode(vnode);
  if (isComponent) {
    wait = getQComponent(elm as any)!.render(ctx);
  }
  return then(wait, () => {
    if (Array.isArray(children)) {
      const promises = []
      for (i = 0; i < children.length; ++i) {
        const ch = children[i];
        if (ch != null) {
          promises.push(createElm(ctx, ch as JSXNode, isSvg));
        }
      }
      return then(promiseAll(promises) as any, (children: Node[]) => {
        for (const child of children) {
          appendChild(ctx, elm, child);
        }
        return elm;
      });
    }
    return elm;
  })
}
