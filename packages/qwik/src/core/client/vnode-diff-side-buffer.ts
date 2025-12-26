import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { TextVNode } from '../shared/vnode/text-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import {
  getComponentHash,
  getKey,
  vnode_getElementName,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_remove,
  type VNodeJournal,
} from './vnode-utils';
import { cleanup, type DiffState } from './vnode-diff';
import { VNodeFlags, type ClientContainer } from './types';

export function getSideBufferKey(nodeName: string | null, key: string): string;
export function getSideBufferKey(nodeName: string | null, key: string | null): string | null;
export function getSideBufferKey(nodeName: string | null, key: string | null): string | null {
  if (key == null) {
    return null;
  }
  return nodeName ? nodeName + ':' + key : key;
}

export function cleanupSideBuffer(
  state: DiffState,
  container: ClientContainer,
  journal: VNodeJournal,
  cursor: VNode | null
) {
  if (state.vSideBuffer) {
    // Remove all nodes in the side buffer as they are no longer needed
    for (const vNode of state.vSideBuffer.values()) {
      if (vNode.flags & VNodeFlags.Deleted) {
        continue;
      }
      cleanup(container, journal, vNode, cursor);
      vnode_remove(journal, state.vParent, vNode, true);
    }
    state.vSideBuffer.clear();
    state.vSideBuffer = null;
  }
  state.vCurrent = null;
}

export function deleteFromSideBuffer(
  state: DiffState,
  nodeName: string | null,
  key: string | null
): boolean {
  if (key != null) {
    const sideBufferKey = getSideBufferKey(nodeName, key);
    if (state.vSideBuffer?.has(sideBufferKey)) {
      state.vSideBuffer.delete(sideBufferKey);
      return true;
    }
  }
  return false;
}

export function retrieveChildWithKey(
  state: DiffState,
  container: ClientContainer,
  nodeName: string | null,
  key: string | null
): VNode | null {
  let vNodeWithKey: VNode | null = null;
  if (state.vSiblings === null) {
    state.vSiblings = new Map();
    state.vSiblingsArray = [];
    let vNode = state.vCurrent;
    while (vNode) {
      const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
      const vKey =
        getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(vNode, container.$getObjectById$);
      if (vKey === key && name === nodeName) {
        vNodeWithKey = vNode;
      } else {
        if (vKey === null) {
          state.vSiblingsArray.push(name, vNode);
        } else {
          // we only add the elements which we did not find yet.
          state.vSiblings.set(getSideBufferKey(name, vKey), vNode);
        }
      }
      vNode = vNode.nextSibling as VNode | null;
    }
  } else {
    if (key === null) {
      for (let i = 0; i < state.vSiblingsArray!.length; i += 2) {
        if (state.vSiblingsArray![i] === nodeName) {
          vNodeWithKey = state.vSiblingsArray![i + 1] as ElementVNode | VirtualVNode;
          state.vSiblingsArray!.splice(i, 2);
          break;
        }
      }
    } else {
      const siblingsKey = getSideBufferKey(nodeName, key);
      if (state.vSiblings.has(siblingsKey)) {
        vNodeWithKey = state.vSiblings.get(siblingsKey) as ElementVNode | VirtualVNode;
        state.vSiblings.delete(siblingsKey);
      }
    }
  }

  collectSideBufferSiblings(state, container, vNodeWithKey);

  return vNodeWithKey;
}

export function collectSideBufferSiblings(
  state: DiffState,
  container: ClientContainer,
  targetNode: VNode | null
): void {
  if (!targetNode) {
    if (state.vCurrent) {
      const name = vnode_isElementVNode(state.vCurrent)
        ? vnode_getElementName(state.vCurrent)
        : null;
      const vKey =
        getKey(state.vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(state.vCurrent, container.$getObjectById$);
      if (vKey != null) {
        const sideBufferKey = getSideBufferKey(name, vKey);
        state.vSideBuffer ||= new Map();
        state.vSideBuffer.set(sideBufferKey, state.vCurrent);
        state.vSiblings?.delete(sideBufferKey);
      }
    }

    return;
  }

  // Walk from vCurrent up to the target node and collect all keyed siblings
  let vNode = state.vCurrent;
  while (vNode && vNode !== targetNode) {
    const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
    const vKey =
      getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
      getComponentHash(vNode, container.$getObjectById$);

    if (vKey != null) {
      const sideBufferKey = getSideBufferKey(name, vKey);
      state.vSideBuffer ||= new Map();
      state.vSideBuffer.set(sideBufferKey, vNode);
      state.vSiblings?.delete(sideBufferKey);
    }

    vNode = vNode.nextSibling as VNode | null;
  }
}

/**
 * Shared utility to resolve a keyed node by:
 *
 * 1. Scanning forward siblings via `retrieveChildWithKey`
 * 2. Falling back to the side buffer using the provided `sideBufferKey`
 * 3. Creating a new node via `createNew` when not found
 *
 * If a node is moved from the side buffer, it is inserted before `vCurrent` under
 * `parentForInsert`. The function updates `vCurrent`/`vNewNode` accordingly and returns the value
 * from `createNew` when a new node is created.
 */
export function moveOrCreateKeyedNode(
  state: DiffState,
  container: ClientContainer,
  journal: VNodeJournal,
  nodeName: string | null,
  lookupKey: string | null,
  sideBufferKey: string | null,
  parentForInsert: VNode,
  addCurrentToSideBufferOnSideInsert?: boolean
): boolean {
  // 1) Try to find the node among upcoming siblings
  state.vNewNode = retrieveChildWithKey(state, container, nodeName, lookupKey);

  if (state.vNewNode) {
    state.vCurrent = state.vNewNode;
    state.vNewNode = null;
    return false;
  }

  // 2) Try side buffer
  if (sideBufferKey != null) {
    const buffered = state.vSideBuffer?.get(sideBufferKey) || null;
    if (buffered) {
      state.vSideBuffer!.delete(sideBufferKey);
      if (addCurrentToSideBufferOnSideInsert && state.vCurrent) {
        const currentKey =
          getKey(state.vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
          getComponentHash(state.vCurrent, container.$getObjectById$);
        if (currentKey != null) {
          const currentName = vnode_isElementVNode(state.vCurrent)
            ? vnode_getElementName(state.vCurrent)
            : null;
          const currentSideKey = getSideBufferKey(currentName, currentKey);
          if (currentSideKey != null) {
            state.vSideBuffer ||= new Map();
            state.vSideBuffer.set(currentSideKey, state.vCurrent);
          }
        }
      }
      vnode_insertBefore(
        journal,
        parentForInsert as ElementVNode | VirtualVNode,
        buffered,
        state.vCurrent
      );
      state.vCurrent = buffered;
      state.vNewNode = null;
      return false;
    }
  }

  // 3) Create new
  return true;
}
