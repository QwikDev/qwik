import { type ClientContainer, VNodeFlags } from '../../client/types';
import { cleanup } from '../../client/vnode-diff';
import {
  vnode_applyJournal,
  vnode_getProp,
  vnode_newVirtual,
  vnode_setProp,
  type VNodeJournal,
} from '../../client/vnode-utils';
import { addCursor } from '../cursor/cursor';
import type { QRL } from '../qrl/qrl.public';
import type { Container } from '../types';
import { ELEMENT_PROPS, OnRenderProp, QSlot, QTargetElement } from '../utils/markers';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import { markVNodeDirty } from '../vnode/vnode-dirty';

/**
 * Create a deferred subtree: a new Virtual vnode that renders a component on its own cursor.
 *
 * Unified helper for reactify$-style portals and Suspense boundaries.
 *
 * A deferred subtree is a VNode tree that renders on its own cursor, separate from the parent. It
 * is attached to the parent via a mechanism like `slotName` but its cursor walks independently, so
 * nothing from the subtree flushes to the DOM until its cursor completes.
 *
 * Used for cross-framework projection (e.g. reactify$) and Suspense boundaries.
 *
 * Use `_setProjectionTarget` to set the DOM target element before the cursor fires.
 *
 * @param priority - Cursor priority (lower numbers = higher priority). Defaults to `1` (below
 *   normal component priority `0`) so portal-like projections yield to the main render.
 * @internal
 */
export function _createDeferredSubtree(
  container: Container,
  parentVNode: VirtualVNode,
  componentQRL: QRL<any>,
  props: Record<string, unknown>,
  slotName: string,
  priority: number = 1
): VirtualVNode {
  const vnode = vnode_newVirtual();
  vnode_setProp(vnode, QSlot, slotName);
  vnode.parent = parentVNode;
  vnode_setProp(parentVNode, slotName, vnode);
  vnode_setProp(vnode, OnRenderProp, componentQRL);
  vnode_setProp(vnode, ELEMENT_PROPS, props);
  vnode.dirty = ChoreBits.COMPONENT;
  addCursor(container, vnode, priority);
  return vnode;
}

/**
 * Set the DOM target element for a deferred subtree's VNode.
 *
 * When the cursor walker processes this VNode, DOM operations will target this element instead of
 * walking the parent chain.
 *
 * @internal
 */
export function _setProjectionTarget(vnode: VirtualVNode, targetElement: Element): void {
  vnode_setProp(vnode, QTargetElement, targetElement);
  vnode.flags |= VNodeFlags.HasTargetElement;
}

/**
 * Update the props on a deferred subtree's VNode and trigger re-rendering.
 *
 * @internal
 */
export function _updateProjectionProps(
  container: Container,
  vnode: VirtualVNode,
  newProps: Record<string, unknown>
): void {
  vnode_setProp(vnode, ELEMENT_PROPS, newProps);
  markVNodeDirty(container, vnode, ChoreBits.COMPONENT);
}

/**
 * Remove a deferred subtree from its parent and clean up.
 *
 * @internal
 */
export function _removeProjection(
  container: Container,
  parentVNode: VirtualVNode,
  vnode: VirtualVNode,
  slotName: string
): void {
  // Detach the subtree from the parent
  vnode_setProp(parentVNode, slotName, null);

  // Clean up effects, subscriptions, and child vnodes
  const journal: VNodeJournal = [];
  cleanup(container as ClientContainer, journal, vnode);
  vnode_applyJournal(journal);

  // Clean up DOM
  if (vnode.flags & VNodeFlags.HasTargetElement) {
    const targetEl = vnode_getProp<Element>(vnode, QTargetElement, null);
    if (targetEl) {
      targetEl.replaceChildren();
    }
    vnode_setProp(vnode, QTargetElement, null);
    vnode.flags &= ~VNodeFlags.HasTargetElement;
  }
}
