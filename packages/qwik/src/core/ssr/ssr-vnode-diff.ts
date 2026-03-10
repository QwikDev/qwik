/**
 * @file SSR VNode diff — processes JSX and creates child SsrNodes.
 *
 *   This is the SSR equivalent of client-side `vnode_diff`. It processes JSX into SsrNode children,
 *   handling elements, text, fragments, components, signals, promises, and special SSR types.
 *
 *   For the initial render, components are executed inline (preserving DOM element ordering for
 *   correct VNodeData indices). Signal-driven re-renders trigger component execution through the
 *   cursor walker's COMPONENT chore.
 *
 *   The function configures the container for VNode parent tracking before delegating to `_walkJSX`.
 *   This ensures component SsrNodes get their VNode `parent` set, enabling `markVNodeDirty` to
 *   propagate dirty bits up to the cursor root.
 */

import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import type { ValueOrPromise } from '../shared/utils/types';
import type { VNode } from '../shared/vnode/vnode';
import { _walkJSX } from './ssr-render-jsx';
import type { ISsrComponentFrame, SSRContainer } from './ssr-types';

/**
 * Process JSX and create child SsrNodes under a parent.
 *
 * @param ssr - The SSR container
 * @param jsx - JSX to process
 * @param parentVNode - Parent VNode in the cursor tree (for dirty propagation). Component SsrNodes
 *   created during processing get their VNode parent set to this, enabling markVNodeDirty to
 *   propagate up to the cursor root.
 * @param cursorRoot - Cursor root VNode (for markVNodeDirty cursorRoot parameter). Currently unused
 *   but reserved for future deferred component execution.
 * @param options - Style and component frame context
 */
export function ssrVNodeDiff(
  ssr: SSRContainer,
  jsx: JSXOutput,
  parentVNode: VNode,
  cursorRoot: VNode,
  options: {
    currentStyleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
): ValueOrPromise<void> {
  // Configure the container for VNode parent tracking.
  // openComponent will read _currentParentVNode and set VNode parent
  // on each component SsrNode, building the cursor tree for dirty propagation.
  const container = ssr as any;
  const prevParentVNode = container._currentParentVNode;
  const prevCursorRoot = container._currentCursorRoot;
  container._currentParentVNode = parentVNode;
  container._currentCursorRoot = cursorRoot;

  const result = _walkJSX(ssr, jsx, options);

  // _walkJSX is async — restore state in finally
  return result.then(
    () => {
      container._currentParentVNode = prevParentVNode;
      container._currentCursorRoot = prevCursorRoot;
    },
    (err: any) => {
      container._currentParentVNode = prevParentVNode;
      container._currentCursorRoot = prevCursorRoot;
      throw err;
    }
  );
}
