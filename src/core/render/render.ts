import type { QComponentCtx } from '../component/component-ctx';
import { QError, qError } from '../error/error';
import { keyValueArrayGet } from '../util/array_map';
import { EMPTY_ARRAY } from '../util/flyweight';
import { OnRenderProp, QSlot, QSlotName } from '../util/markers';
import { isPromise } from '../util/promises';
import type { ValueOrPromise } from '../util/types';
import {
  Cursor,
  cursorClone,
  cursorReconcileElement,
  cursorReconcileEnd,
  cursorReconcileStartVirtualNode,
  cursorReconcileText,
  cursorReconcileVirtualNode,
  updateProperties,
} from './cursor';
import type { JSXPromise } from './jsx/async.public';
import { Host } from './jsx/host.public';
import { Fragment, isJSXNode } from './jsx/jsx-runtime';
import { Slot } from './jsx/slot.public';
import type { JSXNode } from './jsx/types/jsx-node';
import { renderMarked } from './notify-render';
import { getSlotMap, NamedSlotEnum } from './slots';

export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export function visitJsxNode(
  component: QComponentCtx | null,
  renderQueue: ComponentRenderQueue,
  cursor: Cursor,
  jsxNode: any,
  isSvg: boolean
): void {
  if (isJSXNode(jsxNode)) {
    const nodeType = jsxNode.type;
    if (nodeType == null) return;
    if (typeof nodeType === 'string') {
      visitJsxLiteralNode(component, renderQueue, cursor, jsxNode as JSXNode<string>, isSvg);
    } else if (nodeType === Fragment || nodeType == null) {
      const jsxChildren = jsxNode.children || EMPTY_ARRAY;
      for (const jsxChild of jsxChildren) {
        visitJsxNode(component, renderQueue, cursor, jsxChild, isSvg);
      }
    } else if (jsxNode.type === Host) {
      updateProperties(cursor.parent as HTMLElement, jsxNode.props, isSvg);
      const jsxChildren = jsxNode.children || EMPTY_ARRAY;
      for (const jsxChild of jsxChildren) {
        visitJsxNode(component, renderQueue, cursor, jsxChild, isSvg);
      }
    } else if (jsxNode.type === Slot) {
      component && visitQSlotJsxNode(component, renderQueue, cursor, jsxNode, isSvg);
    } else if (typeof jsxNode.type === 'function') {
      visitJsxNode(component, renderQueue, cursor, jsxNode.type(jsxNode.props), isSvg);
    } else {
      throw qError(QError.Render_unexpectedJSXNodeType_type, nodeType);
    }
  } else if (isPromise(jsxNode)) {
    const vNodeCursor = cursorReconcileVirtualNode(cursor);
    const render = (jsxNode: any) => {
      cursorReconcileStartVirtualNode(vNodeCursor);
      visitJsxNode(component, renderQueue, vNodeCursor, jsxNode, isSvg);
      cursorReconcileEnd(vNodeCursor);
    };
    jsxNode.then(render, render);
    if ((jsxNode as JSXPromise).whilePending) {
      const vNodePending = cursorClone(vNodeCursor);
      cursorReconcileStartVirtualNode(vNodePending);
      visitJsxNode(
        component,
        renderQueue,
        vNodePending,
        (jsxNode as JSXPromise).whilePending,
        isSvg
      );
      cursorReconcileEnd(vNodePending);
    }
  } else if (Array.isArray(jsxNode)) {
    const jsxChildren = jsxNode;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, cursor, jsxChild, isSvg);
    }
  } else if (typeof jsxNode === 'string' || typeof jsxNode === 'number') {
    // stringify
    cursorReconcileText(cursor, String(jsxNode));
  }
}

function visitJsxLiteralNode(
  component: QComponentCtx | null,
  renderQueue: ComponentRenderQueue,
  cursor: Cursor,
  jsxNode: JSXNode,
  isSvg: boolean
): void {
  const jsxTag = jsxNode.type as string;
  const isQComponent = OnRenderProp in jsxNode.props;
  if (!isSvg) {
    isSvg = jsxTag === 'svg';
  }
  const elementCursor = cursorReconcileElement(
    cursor,
    component,
    jsxTag,
    jsxNode.props,
    isQComponent ? renderQueue : null,
    isSvg
  );

  if (isSvg && jsxTag === 'foreignObject') {
    isSvg = false;
  }
  if (!hasInnerHtmlOrTextBinding(jsxNode)) {
    // we don't process children if we have inner-html bound to something.
    const jsxChildren = jsxNode.children || EMPTY_ARRAY;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, elementCursor, jsxChild, isSvg);
    }
    cursorReconcileEnd(elementCursor);
  } else if (isQComponent) {
    //TODO(misko): needs tests and QError.
    throw new Error('innerHTML/innerText bindings not supported on component content');
  }
}

function hasInnerHtmlOrTextBinding(jsxNode: JSXNode) {
  return 'innerHTML' in jsxNode.props || 'innerText' in jsxNode.props;
}

export function visitQSlotJsxNode(
  component: QComponentCtx,
  renderQueue: ComponentRenderQueue,
  cursor: Cursor,
  jsxNode: JSXNode,
  isSvg: boolean
): void {
  const slotName: string = jsxNode.props.name || '';
  const slotCursor = cursorReconcileElement(
    cursor,
    component,
    QSlot,
    { [QSlotName]: slotName, ...jsxNode.props },
    null,
    isSvg
  );
  const slotMap = getSlotMap(component);
  const namedSlot = keyValueArrayGet(slotMap, slotName);
  if (namedSlot && namedSlot.length > NamedSlotEnum.firstNode) {
    // project existing nodes.
    const cursorParent = slotCursor.parent! as Element;
    if (namedSlot[NamedSlotEnum.parent] !== cursorParent) {
      // The only time we need to do anything if the existing elements are not already
      // in the right spot. Move them.
      cursorReconcileEnd(slotCursor); // clear anything which is already in.
      for (let i = NamedSlotEnum.firstNode; i < namedSlot.length; i++) {
        const node = namedSlot[i] as Node;
        cursorParent.appendChild(node);
      }
      cursorReconcileEnd(slotCursor);
    }
    renderMarked(cursorParent.ownerDocument);
    // TODO
    // cursorParent.querySelectorAll(RenderNotifySelector).forEach((compElem) => {
    //   renderQueue.push(getQComponent(compElem)!.render());
    // });
  } else {
    // fallback to default value projection.
    const jsxChildren = jsxNode.children;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, slotCursor, jsxChild, isSvg);
    }
    cursorReconcileEnd(slotCursor);
  }
}

export function whileResolvingRender<ARGS extends any[], RET>(
  ...args: [...ARGS, (...args: ResolvedValues<ARGS>) => RET]
): RET {
  throw new Error('Function not implemented.' + args);
}

export type ResolvedValues<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends ValueOrPromise<infer U> ? U : ARGS[K];
};
