import { VNodeProps, type ElementVNode, type VNode } from '../client/types';
import {
  vnode_getNextSibling,
  vnode_getPreviousSibling,
  vnode_getProp,
  vnode_locate,
} from '../client/vnode';
import type { ISsrNode } from '../ssr/ssr-types';
import { QSlotParent } from './utils/markers';

/// These global variables are used to avoid creating new arrays for each call to `vnode_documentPosition`.
const aVNodePath: VNode[] = [];
const bVNodePath: VNode[] = [];
/**
 * Compare two VNodes and determine their document position relative to each other.
 *
 * @param a VNode to compare
 * @param b VNode to compare
 * @param rootVNode - Root VNode of a container
 * @returns -1 if `a` is before `b`, 0 if `a` is the same as `b`, 1 if `a` is after `b`.
 */
export const vnode_documentPosition = (
  a: VNode,
  b: VNode,
  rootVNode: ElementVNode | null
): -1 | 0 | 1 => {
  if (a === b) {
    return 0;
  }

  let aDepth = -1;
  let bDepth = -1;
  while (a) {
    const vNode = (aVNodePath[++aDepth] = a);
    a = (vNode[VNodeProps.parent] ||
      (rootVNode && vnode_getProp(a, QSlotParent, (id) => vnode_locate(rootVNode, id))))!;
  }
  while (b) {
    const vNode = (bVNodePath[++bDepth] = b);
    b = (vNode[VNodeProps.parent] ||
      (rootVNode && vnode_getProp(b, QSlotParent, (id) => vnode_locate(rootVNode, id))))!;
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
      let cursor: VNode | null = b;
      do {
        cursor = vnode_getNextSibling(cursor);
        if (cursor === a) {
          return 1;
        }
      } while (cursor);
      cursor = b;
      do {
        cursor = vnode_getPreviousSibling(cursor);
        if (cursor === a) {
          return -1;
        }
      } while (cursor);
      if (rootVNode && vnode_getProp(b, QSlotParent, (id) => vnode_locate(rootVNode, id))) {
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
    a = ssrNode.parentSsrNode!;
  }
  while (b) {
    const ssrNode = (bSsrNodePath[++bDepth] = b);
    b = ssrNode.parentSsrNode!;
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
