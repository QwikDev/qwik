import { flattenPromiseTree } from '../util/promises';
import { NodeType } from '../util/types';
import { cursorForParent } from './cursor';
import type { JSXNode } from './jsx/types/jsx-node';
import { ComponentRenderQueue, visitJsxNode } from './q-render';
import { Ref as RefClass } from './ref';

/**
 * Render JSX.
 *
 * Use this method to render JSX. This function does reconciling which means
 * it always tries to reuse what is already in the DOM (rather then destroy and
 * recrate content.)
 *
 * @param parent - Element which will act as a parent to `jsxNode`. When
 *     possible the rendering will try to reuse existing nodes.
 * @param jsxNode - JSX to render
 * @public
 */
export async function qRender(
  parent: Element | Document,
  jsxNode: JSXNode<unknown>
): Promise<HTMLElement[]> {
  const renderQueue: ComponentRenderQueue = [];
  let firstChild = parent.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  const cursor = cursorForParent(parent);
  visitJsxNode(null, renderQueue, cursor, jsxNode);
  return flattenPromiseTree<HTMLElement>(renderQueue);
}

/**
 * @public
 */
export interface Ref {
  current: Element | undefined;
  onRender: ((element: Element) => void | Promise<any>) | undefined;
}

/**
 * @public
 */
export function createRef(onRender?: (element: Element) => void | Promise<any>): Ref {
  return new RefClass(onRender);
}
