/**
 * @file Shared diff context and stack mechanics for JSX diffing.
 *
 *   Both client `vnode_diff` and SSR `ssrDiff` use the same DiffContext-based state machine for
 *   depth-first JSX traversal. This file defines the shared `BaseDiffContext` interface and the
 *   mechanical stack operations (`descend`, `ascend`, `stackPush`, `advance`) that both platforms
 *   use.
 */

import type { Cursor } from './cursor/cursor';
import type { JSXChildren } from './jsx/types/jsx-qwik-attributes';
import type { ValueOrPromise } from './utils/types';
import type { VNode } from './vnode/vnode';

/**
 * Shared traversal state for JSX diffing — used by both client and SSR.
 *
 * Platform-specific contexts extend this with their own container, journal, and platform-specific
 * state (e.g., client adds `$journal$` and `$subscriptionData$`, SSR adds `$componentStack$`).
 */
export interface BaseDiffContext {
  $cursor$: Cursor;
  $scopedStyleIdPrefix$: string | null;
  /**
   * Stack is used to keep track of the state of the traversal.
   *
   * We push current state into the stack before descending into the child, and we pop the state
   * when we are done with the child.
   */
  $stack$: any[];
  $asyncQueue$: Array<VNode | ValueOrPromise<JSXChildren> | Promise<JSXChildren>>;
  ////////////////////////////////
  //// Traverse state variables
  ////////////////////////////////
  $vParent$: VNode;
  /// Current node we compare against. (Think of it as a cursor.)
  /// (Node can be null, if we are at the end of the list.)
  $vCurrent$: VNode | null;
  /// When we insert new node we start it here so that we can descend into it.
  /// NOTE: it can't be stored in `vCurrent` because `vNewNode` is in journal
  /// and is not connected to the tree.
  $vNewNode$: VNode | null;
  $vSiblings$: Map<string, VNode> | null;
  /// The array even indices will contain keys and odd indices the non keyed siblings.
  $vSiblingsArray$: Array<string | VNode | null> | null;
  /// Side buffer to store nodes that are moved out of order during key scanning.
  /// This contains nodes that were found before the target key and need to be moved later.
  $vSideBuffer$: Map<string, VNode> | null;
  /// Current set of JSX children.
  $jsxChildren$: JSXChildren[] | null;
  // Current JSX child.
  $jsxValue$: JSXChildren | null;
  $jsxIdx$: number;
  $jsxCount$: number;
  // When we descend into children, we need to skip advance() because we just descended.
  $shouldAdvance$: boolean;
  $isCreationMode$: boolean;
}

/** Helper to get the next sibling of a VNode. */
export function peekNextSibling(vCurrent: VNode | null): VNode | null {
  return vCurrent ? (vCurrent.nextSibling as VNode | null) : null;
}

/**
 * Advance to the next JSX child. After processing a JSX value, call this to move the cursor
 * forward.
 *
 * If `$shouldAdvance$` is false (just descended), skip the advance and set it to true for next
 * time. If the current JSX array is exhausted and we're in a non-VNode-descend frame, auto-ascend.
 */
export function advance<T extends BaseDiffContext>(ctx: T, ascendFn: (ctx: T) => void): void {
  if (!ctx.$shouldAdvance$) {
    ctx.$shouldAdvance$ = true;
    return;
  }
  ctx.$jsxIdx$++;
  if (ctx.$jsxIdx$ < ctx.$jsxCount$) {
    ctx.$jsxValue$ = ctx.$jsxChildren$![ctx.$jsxIdx$];
  } else if (ctx.$stack$.length > 0 && ctx.$stack$[ctx.$stack$.length - 1] === false) {
    // this was special `descendVNode === false` so pop and try again
    return ascendFn(ctx);
  }
  if (ctx.$vNewNode$ !== null) {
    // We have a new Node.
    // This means that the `vCurrent` was deemed not useful and we inserted in front of it.
    // This means that the next node we should look at is the `vCurrent` so just clear the
    // vNewNode and try again.
    ctx.$vNewNode$ = null;
  } else {
    ctx.$vCurrent$ = peekNextSibling(ctx.$vCurrent$);
  }
}

/**
 * Push JSX children state onto the stack. If `descendVNode` is true, also pushes VNode traversal
 * state (parent, current, newNode, siblings, sideBuffer, creationMode).
 */
export function stackPush(
  ctx: BaseDiffContext,
  children: JSXChildren,
  descendVNode: boolean
): void {
  ctx.$stack$.push(ctx.$jsxChildren$, ctx.$jsxIdx$, ctx.$jsxCount$, ctx.$jsxValue$);
  if (descendVNode) {
    ctx.$stack$.push(
      ctx.$vParent$,
      ctx.$vCurrent$,
      ctx.$vNewNode$,
      ctx.$vSiblingsArray$,
      ctx.$vSiblings$,
      ctx.$vSideBuffer$,
      ctx.$isCreationMode$
    );
  }
  ctx.$stack$.push(descendVNode);
  if (Array.isArray(children)) {
    ctx.$jsxIdx$ = 0;
    ctx.$jsxCount$ = children.length;
    ctx.$jsxChildren$ = children;
    ctx.$jsxValue$ = ctx.$jsxCount$ > 0 ? children[0] : null;
  } else if (children === undefined) {
    ctx.$jsxIdx$ = 0;
    ctx.$jsxValue$ = null;
    ctx.$jsxChildren$ = null!;
    ctx.$jsxCount$ = 0;
  } else {
    ctx.$jsxIdx$ = 0;
    ctx.$jsxValue$ = children;
    ctx.$jsxChildren$ = null!;
    ctx.$jsxCount$ = 1;
  }
}

/**
 * Pop state from the stack (ascend from a child frame). Platform-specific ascend functions call
 * this to restore the JSX and VNode traversal state, then call advance to move to the next
 * sibling.
 *
 * Returns the `descendVNode` flag so the caller knows whether to restore VNode state.
 */
export function stackPopBase(ctx: BaseDiffContext): boolean {
  const descendVNode = ctx.$stack$.pop() as boolean;
  if (descendVNode) {
    ctx.$isCreationMode$ = ctx.$stack$.pop();
    ctx.$vSideBuffer$ = ctx.$stack$.pop();
    ctx.$vSiblings$ = ctx.$stack$.pop();
    ctx.$vSiblingsArray$ = ctx.$stack$.pop();
    ctx.$vNewNode$ = ctx.$stack$.pop();
    ctx.$vCurrent$ = ctx.$stack$.pop();
    ctx.$vParent$ = ctx.$stack$.pop();
  }
  ctx.$jsxValue$ = ctx.$stack$.pop();
  ctx.$jsxCount$ = ctx.$stack$.pop();
  ctx.$jsxIdx$ = ctx.$stack$.pop();
  ctx.$jsxChildren$ = ctx.$stack$.pop();
  return descendVNode;
}
