import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { ComputedSignalFlags, type Consumer } from '../reactive-primitives/types';
import type { OnRenderFn } from '../shared/component.public';
import { isCursor } from '../shared/cursor/cursor';
import { abandonCursor } from '../shared/cursor/cursor-queue';
import { getCursorData } from '../shared/cursor/cursor-props';
import { ELEMENT_SEQ, OnRenderProp, QSlot, QTemplate } from '../shared/utils/markers';
import { isSlotProp } from '../shared/utils/prop';
import { isObject } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import { markVNodeDirty, propagateToCursorRoot } from '../shared/vnode/vnode-dirty';
import { TaskFlags, isTask } from '../use/use-task';
import { cleanupDestroyable } from '../use/utils/destroyable';
import { VNodeFlags, type ClientContainer } from './types';
import {
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getProp,
  vnode_isProjection,
  vnode_isTextVNode,
  vnode_locate,
  vnode_remove,
  vnode_setProp,
  vnode_walkVNode,
  type VNodeJournal,
} from './vnode-utils';

/**
 * If vnode is removed, it is necessary to release all subscriptions associated with it.
 *
 * This function will traverse the vnode tree in depth-first order and release all subscriptions.
 *
 * The function takes into account:
 *
 * - Projection nodes by not recursing into them.
 * - Component nodes by recursing into the component content nodes (which may be projected).
 *
 * @param cursorRoot - Optional cursor root (vStartNode) to propagate dirty bits to during diff.
 */
export function cleanup(
  container: ClientContainer,
  journal: VNodeJournal,
  vNode: VNode,
  cursorRoot: VNode | null = null
) {
  let vCursor: VNode | null = vNode;
  const cursorRootData = cursorRoot && isCursor(cursorRoot) ? getCursorData(cursorRoot) : null;
  // Depth first traversal
  if (vnode_isTextVNode(vNode)) {
    markVNodeAsDeleted(vCursor);
    // Text nodes don't have subscriptions or children;
    return;
  }
  let vParent: VNode | null = null;
  do {
    if (cursorRootData && vCursor !== cursorRoot && isCursor(vCursor)) {
      abandonCursor(container, cursorRootData, vCursor);
      // The abandoned cursor keeps its dirty bits, but nothing walks it any more. Link it to the
      // cursor root, otherwise markVNodeDirty() below skips it as "already dirty" and the cleanups
      // of the visible tasks in this subtree are never executed.
      if (vCursor.dirty & ChoreBits.DIRTY_MASK) {
        propagateToCursorRoot(vCursor, cursorRoot!);
      }
    }
    const type = vCursor.flags;
    if (type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) {
      clearAllEffects(container, vCursor);
      markVNodeAsDeleted(vCursor);

      const isComponent =
        type & VNodeFlags.Virtual &&
        vnode_getProp<OnRenderFn<any> | null>(vCursor as VirtualVNode, OnRenderProp, null) !== null;
      if (isComponent) {
        // cleanup q:seq content
        const seq = container.getHostProp<Array<any>>(vCursor as VirtualVNode, ELEMENT_SEQ);
        if (seq) {
          for (let i = 0; i < seq.length; i++) {
            const obj = seq[i];
            if (isObject(obj)) {
              const objIsTask = isTask(obj);
              if (objIsTask) {
                clearAllEffects(container, obj);
                if (obj.$flags$ & TaskFlags.VISIBLE_TASK) {
                  obj.$flags$ |= TaskFlags.NEEDS_CLEANUP;
                  markVNodeDirty(container, vCursor, ChoreBits.CLEANUP, cursorRoot);

                  // don't call cleanupDestroyable yet, do it by the scheduler
                  continue;
                }
                cleanupDestroyable(obj);
              }
              // Stores and plain signals are only producers; their subscriptions are removed
              // when cleaning the consumers that read them. They don't own reactive backrefs.
              else if (obj instanceof ComputedSignalImpl || obj instanceof WrappedSignalImpl) {
                if (obj.$flags$ & ComputedSignalFlags.PRESERVE_ON_SEQ_CLEANUP) {
                  continue;
                }
                if (obj instanceof ComputedSignalImpl) {
                  obj.$dispose();
                } else {
                  clearAllEffects(container, obj as Consumer);
                }
              }
            }
          }
        }

        // SPECIAL CASE: If we are a component, we need to descend into the projected content and release the content.
        const attrs = (vCursor as VirtualVNode).props;
        if (attrs) {
          const keys = Object.keys(attrs);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (isSlotProp(key)) {
              const value = attrs[key];
              if (value) {
                attrs[key] = null; // prevent infinite loop
                const projection =
                  typeof value === 'string'
                    ? vnode_locate(container.rootVNode, value)
                    : (value as unknown as VNode);
                if (!projection.slotParent) {
                  continue;
                }
                let projectionChild = vnode_getFirstChild(projection);
                while (projectionChild) {
                  cleanup(container, journal, projectionChild, cursorRoot);
                  projectionChild = projectionChild.nextSibling as VNode | null;
                }

                cleanupStaleUnclaimedProjection(container, journal, projection);
              }
            }
          }
        }
      }

      const isProjection = vnode_isProjection(vCursor);
      // Projected children are cleaned up by their author.
      if (!isProjection || !vCursor.slotParent) {
        const vFirstChild = vnode_getFirstChild(vCursor);
        if (vFirstChild) {
          vCursor = vFirstChild;
          continue;
        }
      }
      // TODO: probably can be removed
      else if (vCursor === vNode) {
        /**
         * If it is a projection and we are at the root, then we should only walk the children to
         * materialize the projection content. This is because we could have references in the vnode
         * refs map which need to be materialized before cleanup.
         */
        const vFirstChild = vnode_getFirstChild(vCursor);
        if (vFirstChild) {
          vnode_walkVNode(vFirstChild);
          return;
        }
        clearProjectionFromSlotParent(container, vCursor);
      }
    } else if (type & VNodeFlags.Text) {
      markVNodeAsDeleted(vCursor);
    }
    // Out of children
    if (vCursor === vNode) {
      // we are where we started, this means that vNode has no children, so we are done.
      return;
    }
    // Out of children, go to next sibling
    const vNextSibling = vCursor.nextSibling as VNode | null;
    if (vNextSibling) {
      vCursor = vNextSibling;
      continue;
    }

    // Out of siblings, go to parent
    vParent = vCursor.parent;
    while (vParent) {
      if (vParent === vNode) {
        // We are back where we started, we are done.
        return;
      }
      const vNextParentSibling = vParent.nextSibling as VNode | null;
      if (vNextParentSibling) {
        vCursor = vNextParentSibling;
        break;
      }
      vParent = vParent.parent;
    }
    if (vParent == null) {
      // We are done.
      return;
    }
  } while (true as boolean);
}

function clearProjectionFromSlotParent(container: ClientContainer, vNode: VNode) {
  if (!vNode.slotParent) {
    return;
  }
  const slotName = container.getHostProp<string>(vNode, QSlot);
  if (slotName != null && container.getHostProp(vNode.slotParent, slotName) === vNode) {
    vnode_setProp(vNode.slotParent, slotName, null);
  }
}

function cleanupStaleUnclaimedProjection(
  container: ClientContainer,
  journal: VNodeJournal,
  projection: VNode
) {
  // we are removing a node where the projection would go after slot render.
  // This is not needed, so we need to cleanup still unclaimed projection
  const projectionParent = projection.parent;
  if (projectionParent) {
    const projectionParentType = projectionParent.flags;
    if (
      projectionParentType & VNodeFlags.Element &&
      vnode_getElementName(projectionParent as ElementVNode) === QTemplate
    ) {
      // if parent is the q:template element then projection is still unclaimed - remove it
      clearProjectionFromSlotParent(container, projection);
      vnode_remove(journal, projectionParent as ElementVNode | VirtualVNode, projection, true);
    }
  }
}

function markVNodeAsDeleted(vCursor: VNode) {
  /**
   * Marks vCursor as deleted. We need to do this to prevent chores from running after the vnode is
   * removed. (for example signal subscriptions)
   */

  vCursor.flags |= VNodeFlags.Deleted;
}
