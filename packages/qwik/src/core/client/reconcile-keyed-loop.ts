import { isDev } from '@qwik.dev/core/build';
import type { Container } from '../../server/qwik-types';
import type { Cursor } from '../shared/cursor/cursor';
import { isJSXNode } from '../shared/jsx/jsx-node';
import type { JSXNode, JSXOutput } from '../shared/jsx/types/jsx-node';
import { maybeThen } from '../shared/utils/promises';
import type { ValueOrPromise } from '../shared/utils/types';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { VNode } from '../shared/vnode/vnode';
import type { ClientContainer } from './types';
import { createDiffContext, vnode_diff_range } from './vnode-diff';
import {
  type VNodeJournal,
  vnode_getFirstChild,
  vnode_insertBefore,
  vnode_remove,
  vnode_truncate,
} from './vnode-utils';

type Key = string;
type KeyedRowVNode = ElementVNode | VirtualVNode;

function collectChildren(first: KeyedRowVNode, last: KeyedRowVNode | null = null): KeyedRowVNode[] {
  const children: KeyedRowVNode[] = [];
  let child: VNode | null = first;

  while (child) {
    children.push(child as KeyedRowVNode);
    if (child === last) {
      break;
    }
    child = child.nextSibling as VNode | null;
  }

  return children;
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

function buildJsxRange<T>(
  items: readonly T[],
  nextKeys: Key[],
  keyOf: ((item: T, index: number) => Key) | null,
  renderItem: (item: T, index: number) => JSXOutput,
  start: number,
  end: number
): JSXNode[] {
  const jsxItems: JSXNode[] = new Array(end - start + 1);

  for (let i = start; i <= end; i++) {
    const key = nextKeys[i] ?? (nextKeys[i] = keyOf!(items[i], i));
    jsxItems[i - start] = renderKeyedRow(items[i], i, key, renderItem);
  }

  return jsxItems;
}

function firstInsertedBeforeAnchor(
  parent: ElementVNode | VirtualVNode,
  anchor: VNode | null,
  count: number
): KeyedRowVNode | null {
  let inserted = (anchor ? anchor.previousSibling : parent.lastChild) as KeyedRowVNode | null;

  for (let i = 1; i < count && inserted; i++) {
    inserted = inserted.previousSibling as KeyedRowVNode | null;
  }

  return inserted;
}

function longestIncreasingSubsequencePositions(arr: number[]): number[] {
  const n = arr.length;
  if (n === 0) {
    return [];
  }

  const tails: number[] = [];
  const prev: number[] = new Array(n).fill(-1);

  for (let i = 0; i < n; i++) {
    const x = arr[i];

    let low = 0;
    let high = tails.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (arr[tails[mid]] < x) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    if (low > 0) {
      prev[i] = tails[low - 1];
    }

    if (low === tails.length) {
      tails.push(i);
    } else {
      tails[low] = i;
    }
  }

  const lis: number[] = [];
  let current = tails[tails.length - 1];
  while (current !== -1) {
    lis.push(current);
    current = prev[current];
  }

  lis.reverse();
  return lis;
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
  const nextLength = items.length;
  const firstLoopChild = vnode_getFirstChild(parent) as KeyedRowVNode | null;
  const diffContext = createDiffContext(clientContainer, journal, cursor, null);
  const nextKeys = new Array<Key>(nextLength);

  if (firstLoopChild === null) {
    if (nextLength > 0) {
      return vnode_diff_range(
        clientContainer,
        journal,
        buildJsxRange(items, nextKeys, keyOf, renderItem, 0, nextLength - 1),
        parent,
        null,
        null,
        cursor,
        null,
        true,
        diffContext
      );
    }

    return;
  }

  if (nextLength === 0) {
    vnode_truncate(journal, parent, firstLoopChild, true);
    return;
  }

  let start = 0;
  let nextEnd = nextLength - 1;
  let oldStart: KeyedRowVNode | null = firstLoopChild;

  while (
    oldStart &&
    start <= nextEnd &&
    oldStart.key === (nextKeys[start] ??= keyOf(items[start], start))
  ) {
    oldStart = oldStart.nextSibling as KeyedRowVNode | null;
    start++;
  }

  if (oldStart === null) {
    if (start > nextEnd) {
      return;
    }

    return vnode_diff_range(
      clientContainer,
      journal,
      buildJsxRange(items, nextKeys, keyOf, renderItem, start, nextEnd),
      parent,
      null,
      null,
      cursor,
      null,
      true,
      diffContext
    );
  }

  if (start > nextEnd) {
    vnode_truncate(journal, parent, oldStart, true);
    return;
  }

  const oldStartBoundary = oldStart.previousSibling as KeyedRowVNode | null;
  let oldEnd = parent.lastChild as KeyedRowVNode | null;

  while (
    oldEnd !== oldStartBoundary &&
    nextEnd >= start &&
    oldEnd!.key === (nextKeys[nextEnd] ??= keyOf(items[nextEnd], nextEnd))
  ) {
    oldEnd = oldEnd!.previousSibling as KeyedRowVNode | null;
    nextEnd--;
  }

  const suffixAnchor = oldEnd ? (oldEnd.nextSibling as KeyedRowVNode | null) : oldStart;

  if (start > nextEnd) {
    let child: KeyedRowVNode | null = oldStart;
    while (child && child !== suffixAnchor) {
      const nextChild = child.nextSibling as KeyedRowVNode | null;
      vnode_remove(journal, parent, child, true);
      child = nextChild;
    }
    return;
  }

  if (oldEnd === oldStartBoundary) {
    const anchor = suffixAnchor;

    return vnode_diff_range(
      clientContainer,
      journal,
      buildJsxRange(items, nextKeys, keyOf, renderItem, start, nextEnd),
      parent,
      anchor,
      anchor,
      cursor,
      null,
      true,
      diffContext
    );
  }

  for (let i = start; i <= nextEnd; i++) {
    nextKeys[i] ??= keyOf(items[i], i);
  }

  const middleLength = nextEnd - start + 1;
  const nextIndexByKey = new Map<Key, number>();
  for (let i = start; i <= nextEnd; i++) {
    nextIndexByKey.set(nextKeys[i], i - start);
  }

  const prev = collectChildren(oldStart, oldEnd!);
  const survivors: KeyedRowVNode[] = [];
  const prevRelIndexByKey = new Map<Key, number>();
  for (let i = 0; i < prev.length; i++) {
    const prevNode = prev[i];
    const prevKey = prevNode.key as Key;

    if (nextIndexByKey.has(prevKey)) {
      prevRelIndexByKey.set(prevKey, survivors.length);
      survivors.push(prevNode);
    } else {
      vnode_remove(journal, parent, prevNode, true);
    }
  }

  const nextRefs = new Int32Array(middleLength);
  nextRefs.fill(-1);

  const seq: number[] = [];
  const seqOffsets: number[] = [];

  for (let offset = 0; offset < middleLength; offset++) {
    const relIndex = prevRelIndexByKey.get(nextKeys[start + offset]);
    if (relIndex !== undefined) {
      nextRefs[offset] = relIndex;
      seqOffsets.push(offset);
      seq.push(relIndex);
    }
  }

  const keepMask = new Uint8Array(middleLength);
  const lisPositions = longestIncreasingSubsequencePositions(seq);
  for (let i = 0; i < lisPositions.length; i++) {
    keepMask[seqOffsets[lisPositions[i]]] = 1;
  }

  let index = nextEnd;
  let anchor = suffixAnchor as VNode | null;

  const resume = (): ValueOrPromise<void> => {
    while (index >= start) {
      const offset = index - start;

      if (keepMask[offset] === 1) {
        anchor = survivors[nextRefs[offset]];
        index--;
        continue;
      }

      const existingRelIndex = nextRefs[offset];
      if (existingRelIndex !== -1) {
        const node = survivors[existingRelIndex];
        const alreadyPlaced =
          anchor === null ? parent.lastChild === node : node.nextSibling === anchor;

        if (!alreadyPlaced) {
          vnode_insertBefore(journal, parent, node, anchor);
        }

        anchor = node;
        index--;
        continue;
      }

      let blockStart = index;
      while (blockStart > start) {
        const prevOffset = blockStart - 1 - start;
        if (keepMask[prevOffset] === 1 || nextRefs[prevOffset] !== -1) {
          break;
        }
        blockStart--;
      }

      const blockLength = index - blockStart + 1;
      const result = vnode_diff_range(
        clientContainer,
        journal,
        buildJsxRange(items, nextKeys, null, renderItem, blockStart, index),
        parent,
        anchor,
        anchor,
        cursor,
        null,
        true,
        diffContext
      );

      return maybeThen(result, () => {
        const firstInserted = firstInsertedBeforeAnchor(parent, anchor, blockLength);
        if (isDev && !firstInserted) {
          throw new Error('Failed to insert keyed loop block');
        }
        anchor = firstInserted;
        index = blockStart - 1;
        return resume();
      });
    }
  };

  return resume();
}
