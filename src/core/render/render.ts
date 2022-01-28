import { getQComponent, QComponentCtx } from '../component/component-ctx';
import { QError, qError } from '../error/error';
import { didQPropsChange } from '../props/props';
import { getProps } from '../props/props.public';
import { keyValueArrayGet } from '../util/array_map';
import { EMPTY_ARRAY } from '../util/flyweight';
import { AttributeMarker } from '../util/markers';
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
} from './cursor';
import type { JSXPromise } from './jsx/async.public';
import { Host } from './jsx/host.public';
import { Fragment, isJSXNode } from './jsx/jsx-runtime';
import { Slot } from './jsx/slot.public';
import type { JSXNode } from './jsx/types/jsx-node';
import { getSlotMap, NamedSlotEnum } from './slots';

export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export function visitJsxNode(
  component: QComponentCtx | null,
  renderQueue: ComponentRenderQueue,
  cursor: Cursor,
  jsxNode: any
): void {
  if (isJSXNode(jsxNode)) {
    const nodeType = jsxNode.type;
    if (nodeType == null) return;
    if (typeof nodeType === 'string') {
      visitJsxLiteralNode(component, renderQueue, cursor, jsxNode as JSXNode<string>);
    } else if (nodeType === Fragment || nodeType == null) {
      const jsxChildren = jsxNode.children || EMPTY_ARRAY;
      for (const jsxChild of jsxChildren) {
        visitJsxNode(component, renderQueue, cursor, jsxChild);
      }
    } else if (jsxNode.type === Host) {
      const props = getProps(cursor.parent as Element);
      Object.assign(props, jsxNode.props);
      const jsxChildren = jsxNode.children || EMPTY_ARRAY;
      for (const jsxChild of jsxChildren) {
        visitJsxNode(component, renderQueue, cursor, jsxChild);
      }
      didQPropsChange(props);
    } else if (jsxNode.type === Slot) {
      component && visitQSlotJsxNode(component, renderQueue, cursor, jsxNode);
    } else if (typeof jsxNode.type === 'function') {
      visitJsxNode(component, renderQueue, cursor, jsxNode.type(jsxNode.props));
    } else {
      throw qError(QError.Render_unexpectedJSXNodeType_type, nodeType);
    }
  } else if (isPromise(jsxNode)) {
    const vNodeCursor = cursorReconcileVirtualNode(cursor);
    const render = (jsxNode: any) => {
      cursorReconcileStartVirtualNode(vNodeCursor);
      visitJsxNode(component, renderQueue, vNodeCursor, jsxNode);
      cursorReconcileEnd(vNodeCursor);
    };
    jsxNode.then(render, render);
    if ((jsxNode as JSXPromise).whilePending) {
      const vNodePending = cursorClone(vNodeCursor);
      cursorReconcileStartVirtualNode(vNodePending);
      visitJsxNode(component, renderQueue, vNodePending, (jsxNode as JSXPromise).whilePending);
      cursorReconcileEnd(vNodePending);
    }
  } else if (Array.isArray(jsxNode)) {
    const jsxChildren = jsxNode;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, cursor, jsxChild);
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
  jsxNode: JSXNode<string>
): void {
  const jsxTag = jsxNode.type as string;
  const isQComponent = AttributeMarker.OnRenderProp in jsxNode.props;
  const elementCursor = cursorReconcileElement(
    cursor,
    component,
    jsxTag,
    jsxNode.props,
    isQComponent ? renderQueue : null
  );
  if (!hasInnerHtmlOrTextBinding(jsxNode)) {
    // we don't process children if we have inner-html bound to something.
    const jsxChildren = jsxNode.children || EMPTY_ARRAY;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, elementCursor, jsxChild);
    }
    cursorReconcileEnd(elementCursor);
  } else if (isQComponent) {
    //TODO(misko): needs tests and QError.
    throw new Error('innerHTML/innerText bindings not supported on component content');
  }
}

function hasInnerHtmlOrTextBinding(jsxNode: JSXNode<string>) {
  return 'innerHTML' in jsxNode.props || 'innerText' in jsxNode.props;
}

export function visitQSlotJsxNode(
  component: QComponentCtx,
  renderQueue: ComponentRenderQueue,
  cursor: Cursor,
  jsxNode: JSXNode
): void {
  const slotName: string = jsxNode.props.name || '';
  const slotCursor = cursorReconcileElement(
    cursor,
    component,
    AttributeMarker.QSlot,
    { [AttributeMarker.QSlotName]: slotName, ...jsxNode.props },
    null
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
    cursorParent.querySelectorAll(AttributeMarker.RenderNotifySelector).forEach((compElem) => {
      renderQueue.push(getQComponent(compElem)!.render());
    });
  } else {
    // fallback to default value projection.
    const jsxChildren = jsxNode.children;
    for (const jsxChild of jsxChildren) {
      visitJsxNode(component, renderQueue, slotCursor, jsxChild);
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
