import { isDev } from '@qwik.dev/core/build';
import type { Container } from '../../server/qwik-types';
import type { Cursor } from '../shared/cursor/cursor';
import { isJSXNode } from '../shared/jsx/jsx-node';
import type { JSXNode, JSXOutput } from '../shared/jsx/types/jsx-node';
import { isPromise, maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { ClientContainer } from './types';
import { createDiffContext, vnode_diff_range, type DiffContext } from './vnode-diff';
import {
  type VNodeJournal,
  vnode_getFirstChild,
  vnode_insertBefore,
  vnode_isElementOrVirtualVNode,
  vnode_remove,
  vnode_truncate,
} from './vnode-utils';

type Key = string;
type KeyedRowVNode = ElementVNode | VirtualVNode;

function isKeyedRowVNode(child: VNode | null): child is KeyedRowVNode {
  return !!child && vnode_isElementOrVirtualVNode(child) && child.key != null;
}

function getNextKeyedSibling(child: VNode | null): KeyedRowVNode | null {
  while (child) {
    if (isKeyedRowVNode(child)) {
      return child;
    }
    child = child.nextSibling as VNode | null;
  }
  return null;
}

function getPreviousKeyedSibling(child: VNode | null): KeyedRowVNode | null {
  while (child) {
    if (isKeyedRowVNode(child)) {
      return child;
    }
    child = child.previousSibling as VNode | null;
  }
  return null;
}

function collectCurrentKeyedChildren(from: KeyedRowVNode, to: KeyedRowVNode): KeyedRowVNode[] {
  const rows: KeyedRowVNode[] = [];
  let child: VNode | null = from;

  while (child) {
    if (isKeyedRowVNode(child)) {
      rows.push(child);
    }
    if (child === to) {
      break;
    }
    child = child.nextSibling as VNode | null;
  }

  return rows;
}

function createStableRowMask(oldIndexes: ArrayLike<number>): Uint8Array {
  const stableRows = new Uint8Array(oldIndexes.length);
  for (let i = 0; i < oldIndexes.length; i++) {
    if (oldIndexes[i] >= 0) {
      stableRows[i] = 1;
    }
  }
  return stableRows;
}

function getStableRowMask(oldIndexes: ArrayLike<number>): Uint8Array {
  const predecessors = new Int32Array(oldIndexes.length);
  predecessors.fill(-1);
  const lis = new Int32Array(oldIndexes.length);
  let lisLength = 0;

  for (let i = 0; i < oldIndexes.length; i++) {
    const oldIndex = oldIndexes[i];
    if (oldIndex < 0) {
      continue;
    }

    let low = 0;
    let high = lisLength;

    while (low < high) {
      const mid = (low + high) >> 1;
      const lisIndex = lis[mid];
      if (oldIndexes[lisIndex] < oldIndex) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    if (low > 0) {
      predecessors[i] = lis[low - 1];
    }

    lis[low] = i;
    if (low === lisLength) {
      lisLength++;
    }
  }

  const stableRows = new Uint8Array(oldIndexes.length);
  let current = lisLength > 0 ? lis[lisLength - 1] : -1;
  while (current !== -1) {
    stableRows[current] = 1;
    current = predecessors[current];
  }

  return stableRows;
}

function renderKeyedRow<T>(
  item: T,
  index: number,
  key: Key,
  renderItem: (item: T, index: number) => JSXOutput
): JSXNode {
  const jsx = renderItem(item, index) as JSXNode;
  if (isDev && !isJSXNode(jsx)) {
    throw new Error('Each item$ must return a single JSX node');
  }
  jsx.key = key;
  return jsx;
}

function diffRowRange(
  container: ClientContainer,
  journal: VNodeJournal,
  parent: ElementVNode | VirtualVNode,
  cursor: Cursor,
  diffContext: DiffContext,
  items: readonly any[],
  getKey: (item: any, index: number) => Key,
  renderItem: (item: any, index: number) => JSXOutput,
  fromIndex: number,
  toIndex: number,
  end: VNode | null = null
): ValueOrPromise<void> {
  const count = toIndex - fromIndex;
  if (count <= 0) {
    return;
  }

  let i = 0;
  const diffNext = (): ValueOrPromise<void> => {
    while (i < count) {
      const index = fromIndex + i;
      const result = vnode_diff_range(
        container,
        journal,
        renderKeyedRow(items[index], index, getKey(items[index], index), renderItem),
        parent,
        null,
        end,
        cursor,
        null,
        true,
        diffContext
      );
      i++;
      if (isPromise(result)) {
        return result.then(diffNext);
      }
    }
  };

  return diffNext();
}

export function reconcileKeyedLoopToParent<T>(
  container: Container,
  journal: VNodeJournal,
  parent: ElementVNode | VirtualVNode,
  cursor: Cursor,
  items: readonly T[],
  keyOf: (item: T, index: number) => Key,
  renderItem: (item: T, index: number) => JSXOutput
): ValueOrPromise<void> {
  const clientContainer = container as ClientContainer;
  const diffContext = createDiffContext(clientContainer, journal, cursor, null);
  const itemsLength = items.length;
  const firstLoopChild = vnode_getFirstChild(parent);

  if (firstLoopChild === null) {
    if (itemsLength > 0) {
      return diffRowRange(
        clientContainer,
        journal,
        parent,
        cursor,
        diffContext,
        items,
        keyOf,
        renderItem,
        0,
        itemsLength
      );
    }
    return;
  }

  if (itemsLength === 0) {
    vnode_truncate(journal, parent, firstLoopChild, true);
    return;
  }

  const keys = new Array<Key>(itemsLength);
  for (let i = 0; i < itemsLength; i++) {
    keys[i] = keyOf(items[i], i);
  }

  const keyAt = (_item: T, index: number): Key => keys[index];
  let oldStart = getNextKeyedSibling(firstLoopChild);
  if (oldStart === null) {
    return diffRowRange(
      clientContainer,
      journal,
      parent,
      cursor,
      diffContext,
      items,
      keyAt,
      renderItem,
      0,
      itemsLength
    );
  }

  let oldEnd = getPreviousKeyedSibling(parent.lastChild as VNode | null);
  let tailAnchor: KeyedRowVNode | null = null;

  // Trim the unchanged prefix/suffix first and only materialize the middle window if needed.
  let start = 0;
  while (oldStart && start < itemsLength && oldStart.key === keys[start]) {
    const current = oldStart;
    start++;
    if (current === oldEnd) {
      oldStart = null;
      oldEnd = null;
      break;
    }
    oldStart = getNextKeyedSibling(current.nextSibling as VNode | null);
  }

  let newEnd = itemsLength - 1;
  while (oldEnd && newEnd >= start && oldEnd.key === keys[newEnd]) {
    const current = oldEnd;
    tailAnchor = current;
    newEnd--;
    if (current === oldStart) {
      oldStart = null;
      oldEnd = null;
      break;
    }
    oldEnd = getPreviousKeyedSibling(current.previousSibling as VNode | null);
  }

  // Fast path: head/tail scans consumed everything, so the lists already match.
  if (oldStart === null && start > newEnd) {
    return;
  }

  // Fast path: only insertions remain between the matched head and tail.
  if (oldStart === null) {
    // Insert before an unchanged tail left-to-right so the anchor stays stable.
    return diffRowRange(
      clientContainer,
      journal,
      parent,
      cursor,
      diffContext,
      items,
      keyAt,
      renderItem,
      start,
      newEnd + 1,
      tailAnchor
    );
  }

  // Fast path: only removals remain between the matched head and tail.
  if (start > newEnd) {
    if (start === 0 && tailAnchor === null) {
      vnode_truncate(journal, parent, oldStart, true);
    } else {
      let row: KeyedRowVNode | null = oldStart;
      while (row) {
        const current: KeyedRowVNode = row;
        row = current === oldEnd ? null : getNextKeyedSibling(current.nextSibling as VNode | null);
        vnode_remove(journal, parent, current, true);
      }
    }
    return;
  }

  const oldRows = collectCurrentKeyedChildren(oldStart, oldEnd!);
  const oldRowsLength = oldRows.length;
  const oldIndexByKey = new Map<Key, number>();
  for (let i = 0; i < oldRowsLength; i++) {
    oldIndexByKey.set(oldRows[i].key!, i);
  }

  let overlap = 0;
  let lastOldIndex = -1;
  let isIncreasing = true;
  const oldIndexes = new Int32Array(newEnd - start + 1);
  oldIndexes.fill(-1);
  for (let i = start; i <= newEnd; i++) {
    const oldIndex = oldIndexByKey.get(keys[i]);
    if (oldIndex !== undefined) {
      overlap++;
      oldIndexes[i - start] = oldIndex;
      if (oldIndex <= lastOldIndex) {
        isIncreasing = false;
      } else {
        lastOldIndex = oldIndex;
      }
    }
  }

  // Fast path: the middle window has no shared keys, so replace that slice instead of moving rows.
  if (overlap === 0) {
    if (start === 0 && tailAnchor === null) {
      vnode_truncate(journal, parent, oldStart, true);
      return diffRowRange(
        clientContainer,
        journal,
        parent,
        cursor,
        diffContext,
        items,
        keyAt,
        renderItem,
        0,
        itemsLength
      );
    }

    for (let i = 0; i < oldRowsLength; i++) {
      vnode_remove(journal, parent, oldRows[i], true);
    }

    return diffRowRange(
      clientContainer,
      journal,
      parent,
      cursor,
      diffContext,
      items,
      keyAt,
      renderItem,
      start,
      newEnd + 1,
      tailAnchor
    );
  }

  // General keyed path: preserve the longest stable subsequence and only move the rest.
  const stableRows = isIncreasing ? createStableRowMask(oldIndexes) : getStableRowMask(oldIndexes);
  let anchor: VNode | null = tailAnchor;
  let i = newEnd;

  const updateInsertedAnchor = () => {
    const inserted: KeyedRowVNode | null =
      (anchor
        ? (anchor.previousSibling as KeyedRowVNode | null)
        : (parent.lastChild as KeyedRowVNode | null)) || null;
    if (isDev && !inserted) {
      throw new Error('Failed to insert keyed loop row');
    }
    if (inserted) {
      anchor = inserted;
    }
  };

  const resumeKeyedRange = (): ValueOrPromise<void> => {
    while (i >= start) {
      const item = items[i];
      const key = keys[i];
      const oldIndex = oldIndexByKey.get(key);

      if (oldIndex !== undefined) {
        const reused = oldRows[oldIndex];
        oldIndexByKey.delete(key);
        if (stableRows[i - start] === 0) {
          vnode_insertBefore(journal, parent, reused, anchor);
        }
        anchor = reused;
        i--;
        continue;
      }

      const result = vnode_diff_range(
        clientContainer,
        journal,
        renderKeyedRow(item, i, key, renderItem),
        parent,
        null,
        anchor,
        cursor,
        null,
        false,
        diffContext
      );
      return maybeThen(result, () => {
        updateInsertedAnchor();
        i--;
        return resumeKeyedRange();
      });
    }

    for (const leftoverIndex of oldIndexByKey.values()) {
      vnode_remove(journal, parent, oldRows[leftoverIndex], true);
    }
  };

  return resumeKeyedRange();
}
