import type { VNode } from '../client/vnode-impl';
import type { ISsrNode } from '../ssr/ssr-types';

/// These global variables are used to avoid creating new arrays for each call to `vnode_documentPosition`.
const aVNodePath: VNode[] = [];
const bVNodePath: VNode[] = [];
/**
 * Compare two VNodes and determine their document position relative to each other.
 *
 * @param a VNode to compare
 * @param b VNode to compare
 * @returns -1 if `a` is before `b`, 0 if `a` is the same as `b`, 1 if `a` is after `b`.
 */
export const vnode_documentPosition = (a: VNode, b: VNode): -1 | 0 | 1 => {
  if (a === b) {
    return 0;
  }

  let aDepth = -1;
  let bDepth = -1;
  while (a) {
    const vNode = (aVNodePath[++aDepth] = a);
    a = (vNode.parent || a.slotParent)!;
  }
  while (b) {
    const vNode = (bVNodePath[++bDepth] = b);
    b = (vNode.parent || b.slotParent)!;
  }

  while (aDepth >= 0 && bDepth >= 0) {
    a = aVNodePath[aDepth] as VNode;
    b = bVNodePath[bDepth] as VNode;
    if (a === b) {
      // if the nodes are the same, we need to check the next level.
      aDepth--;
      bDepth--;
    } else {
      // We found a difference so we need to scan nodes at this level.
      let cursor: VNode | null | undefined = b;
      do {
        cursor = cursor.nextSibling;
        if (cursor === a) {
          return 1;
        }
      } while (cursor);
      cursor = b;
      do {
        cursor = cursor.previousSibling;
        if (cursor === a) {
          return -1;
        }
      } while (cursor);
      if (b.slotParent) {
        // The "b" node is a projection, so we need to set it after "a" node,
        // because the "a" node could be a context provider.
        return -1;
      }
      // The node is not in the list of siblings, that means it must be disconnected.
      return 1;
    }
  }
  return aDepth < bDepth ? -1 : 1;
};

/// These global variables are used to avoid creating new arrays for each call to `ssrNodeDocumentPosition`.
const aSsrNodePath: ISsrNode[] = [];
const bSsrNodePath: ISsrNode[] = [];
/**
 * Compare two SSR nodes and determine their document position relative to each other. Compares only
 * position between parent and child.
 *
 * @param a SSR node to compare
 * @param b SSR node to compare
 * @returns -1 if `a` is before `b`, 0 if `a` is the same as `b`, 1 if `a` is after `b`.
 */
export const ssrNodeDocumentPosition = (a: ISsrNode, b: ISsrNode): -1 | 0 | 1 => {
  if (a === b) {
    return 0;
  }

  let aDepth = -1;
  let bDepth = -1;
  while (a) {
    const ssrNode = (aSsrNodePath[++aDepth] = a);
    a = ssrNode.parentComponent!;
  }
  while (b) {
    const ssrNode = (bSsrNodePath[++bDepth] = b);
    b = ssrNode.parentComponent!;
  }

  while (aDepth >= 0 && bDepth >= 0) {
    a = aSsrNodePath[aDepth] as ISsrNode;
    b = bSsrNodePath[bDepth] as ISsrNode;
    if (a === b) {
      // if the nodes are the same, we need to check the next level.
      aDepth--;
      bDepth--;
    } else {
      return 1;
    }
  }
  return aDepth < bDepth ? -1 : 1;
};
