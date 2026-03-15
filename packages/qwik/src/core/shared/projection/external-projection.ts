import { VNodeFlags } from '../../client/types';
import { vnode_getProp, vnode_newVirtual, vnode_setProp } from '../../client/vnode-utils';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import { addCursor } from '../cursor/cursor';
import { OnRenderProp, ELEMENT_PROPS, QSlot, QTargetElement } from '../utils/markers';
import type { Container } from '../types';
import type { QRL } from '../qrl/qrl.public';

/**
 * Register an external projection on a parent component VNode.
 *
 * Creates a new VirtualVNode that will render the given component QRL with the given props. The
 * VNode is stored as a projection on the parent, and a low-priority cursor is added so the cursor
 * walker will process it.
 *
 * Use `_slotReady` to set the DOM target element before the cursor fires.
 *
 * @internal
 */
export function _addProjection(
  container: Container,
  parentVNode: VirtualVNode,
  componentQRL: QRL<any>,
  props: Record<string, unknown>,
  slotName: string
): VirtualVNode {
  const vnode = vnode_newVirtual();
  vnode_setProp(vnode, QSlot, slotName);
  vnode.slotParent = parentVNode;
  vnode_setProp(parentVNode, slotName, vnode);
  vnode_setProp(vnode, OnRenderProp, componentQRL);
  vnode_setProp(vnode, ELEMENT_PROPS, props);
  vnode.dirty = ChoreBits.COMPONENT;
  addCursor(container, vnode, 1); // low priority
  return vnode;
}

/**
 * Set the DOM target element for an external projection VNode.
 *
 * When the cursor walker processes this VNode, DOM operations will target this element instead of
 * walking the parent chain.
 *
 * @internal
 */
export function _slotReady(vnode: VirtualVNode, targetElement: Element): void {
  vnode_setProp(vnode, QTargetElement, targetElement);
  vnode.flags |= VNodeFlags.HasTargetElement;
}

/**
 * Update the props on an external projection VNode and trigger re-rendering.
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
 * Remove an external projection from its parent and clean up.
 *
 * @internal
 */
export function _removeProjection(
  container: Container,
  parentVNode: VirtualVNode,
  vnode: VirtualVNode,
  slotName: string
): void {
  // Remove from parent's projections
  vnode_setProp(parentVNode, slotName, null);

  // Clean up DOM
  if (vnode.flags & VNodeFlags.HasTargetElement) {
    const targetEl = vnode_getProp<Element>(vnode, QTargetElement, null);
    if (targetEl) {
      targetEl.replaceChildren();
    }
    vnode_setProp(vnode, QTargetElement, null);
    vnode.flags &= ~VNodeFlags.HasTargetElement;
  }

  // Mark as deleted
  vnode.flags |= VNodeFlags.Deleted;
  vnode.dirty = ChoreBits.NONE;
}
