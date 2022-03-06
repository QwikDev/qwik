import { isDocument } from '../util/element';
import { NodeType } from '../util/types';
import { executeContext, RenderContext } from './cursor';
import { isJSXNode, jsx } from './jsx/jsx-runtime';
import type { JSXNode, FunctionComponent } from './jsx/types/jsx-node';
import { visitJsxNode } from './render';
import type { ValueOrPromise } from '../index';
import { then } from '../util/promises';
import { getRenderingState } from './notify-render';

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
export function render(
  parent: Element | Document,
  jsxNode: JSXNode<unknown> | FunctionComponent<any>
): ValueOrPromise<RenderContext> {
  // If input is not JSX, convert it
  if (!isJSXNode(jsxNode)) {
    jsxNode = jsx(jsxNode, null);
  }
  let firstChild = parent.firstChild;
  while (firstChild && firstChild.nodeType > NodeType.COMMENT_NODE) {
    firstChild = firstChild.nextSibling;
  }
  const doc = isDocument(parent) ? parent : parent.ownerDocument;
  const elm = isDocument(parent) ? parent.documentElement : parent;
  const ctx: RenderContext = {
    operations: [],
    doc,
    component: undefined,
    hostElements: new Set(),
    globalState: getRenderingState(doc),
    perf: [],
    queue: [elm],
  };
  return then(visitJsxNode(ctx, elm, jsxNode, false), () => {
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        executeContext(ctx);
        resolve(ctx);
      });
    });
  });
}
