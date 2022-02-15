import { flattenPromiseTree } from '../util/promises';
import { NodeType } from '../util/types';
import { cursorForParent } from './cursor';
import { isJSXNode, jsx } from './jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from './jsx/types/jsx-node';
import { ComponentRenderQueue, visitJsxNode } from './render';

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
export async function render(
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>
): Promise<HTMLElement[]> {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  const renderQueue: ComponentRenderQueue = [];
  let firstChild = parent.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  const cursor = cursorForParent(parent);
  visitJsxNode(null, renderQueue, cursor, jsxNode);
  return flattenPromiseTree<HTMLElement>(renderQueue);
}
