import { _jsxSorted, Fragment } from '@qwik.dev/core';
import { vnode_fromJSX } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { _flushJournal } from '../shared/cursor/cursor-flush';
import type { Cursor } from '../shared/cursor/cursor';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import {
  InsertOrMoveOperation,
  RemoveAllChildrenOperation,
} from '../shared/vnode/types/dom-vnode-operation';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import { reconcileKeyedLoopToParent } from './reconcile-keyed-loop';
import type { VNodeJournal } from './vnode-utils';

const createRow = (item: string) => _jsxSorted('b', { id: `row-${item}` }, null, item, 0, item);

describe('reconcile-keyed-loop', () => {
  it('should only move the swapped rows when an interior item moves near the end', async () => {
    const initialItems = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const nextItems = ['0', '8', '2', '3', '4', '5', '6', '7', '1', '9'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(journal).toHaveLength(2);
    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(10);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should append keyed rows without moving the existing prefix', async () => {
    const initialItems = ['0', '1', '2'];
    const nextItems = ['0', '1', '2', '3', '4'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(5);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should append a keyed suffix without keyed-map allocations or rerendering the prefix', async () => {
    const initialItems = Array.from({ length: 1_000 }, (_, i) => String(i));
    const nextItems = Array.from({ length: 2_000 }, (_, i) => String(i));
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );
    const initialNodes = Array.from(container.document.querySelectorAll('b'));
    const journal: VNodeJournal = [];
    const keyOf = vi.fn((item: string) => item);
    const renderItem = vi.fn((item: string) => createRow(item));
    let mapAllocations = 0;

    class CountingMap<K, V> extends Map<K, V> {
      constructor(entries?: Iterable<readonly [K, V]> | null) {
        super(entries);
        mapAllocations++;
      }
    }

    vi.stubGlobal('Map', CountingMap);
    try {
      await reconcileKeyedLoopToParent(
        container,
        journal,
        vNode as ElementVNode,
        null as unknown as Cursor,
        nextItems,
        keyOf,
        renderItem
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mapAllocations).toBe(0);
    expect(keyOf).toHaveBeenCalledTimes(2_000);
    expect(renderItem).toHaveBeenCalledTimes(1_000);
    expect(renderItem.mock.calls[0]).toEqual(['1000', 1000]);
    expect(renderItem.mock.calls[999]).toEqual(['1999', 1999]);
    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    const finalNodes = Array.from(container.document.querySelectorAll('b'));
    expect(finalNodes).toHaveLength(2_000);
    expect(finalNodes.slice(0, 1_000)).toEqual(initialNodes);
    expect(finalNodes.slice(995, 1005).map((node) => node.textContent)).toEqual([
      '995',
      '996',
      '997',
      '998',
      '999',
      '1000',
      '1001',
      '1002',
      '1003',
      '1004',
    ]);
  });

  it('should swap two adjacent keyed rows with a single move', async () => {
    const initialItems = ['0', '1', '2', '3'];
    const nextItems = ['0', '2', '1', '3'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(journal).toHaveLength(1);
    expect(journal[0]).toBeInstanceOf(InsertOrMoveOperation);
    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should move the last keyed row to the front with a single move', async () => {
    const initialItems = ['0', '1', '2', '3'];
    const nextItems = ['3', '0', '1', '2'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(journal).toHaveLength(1);
    expect(journal[0]).toBeInstanceOf(InsertOrMoveOperation);
    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should avoid keyed sibling map allocations on initial keyed mount', async () => {
    const items = ['0', '1', '2'];
    const { vNode, container } = vnode_fromJSX(_jsxSorted('test', {}, null, [], 0, 'KA_root'));
    const journal: VNodeJournal = [];
    let mapAllocations = 0;

    class CountingMap<K, V> extends Map<K, V> {
      constructor(entries?: Iterable<readonly [K, V]> | null) {
        super(entries);
        mapAllocations++;
      }
    }

    vi.stubGlobal('Map', CountingMap);
    try {
      await reconcileKeyedLoopToParent(
        container,
        journal,
        vNode as ElementVNode,
        null as unknown as Cursor,
        items,
        (item) => item,
        (item) => createRow(item)
      );
    } finally {
      vi.unstubAllGlobals();
    }

    expect(mapAllocations).toBe(0);
    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, items.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(3);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(items);
  });

  it('should call keyOf and renderItem once per item on initial keyed mount', async () => {
    const items = ['0', '1', '2'];
    const { vNode, container } = vnode_fromJSX(_jsxSorted('test', {}, null, [], 0, 'KA_root'));
    const journal: VNodeJournal = [];
    const keyOf = vi.fn((item: string) => item);
    const renderItem = vi.fn((item: string) => createRow(item));

    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      items,
      keyOf,
      renderItem
    );

    expect(keyOf.mock.calls).toEqual([
      ['0', 0],
      ['1', 1],
      ['2', 2],
    ]);
    expect(renderItem.mock.calls).toEqual([
      ['0', 0],
      ['1', 1],
      ['2', 2],
    ]);
  });

  it('should prepend keyed rows before an unchanged tail', async () => {
    const initialItems = ['2', '3'];
    const nextItems = ['0', '1', '2', '3'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(4);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should render only appended keyed rows', async () => {
    const initialItems = ['0', '1', '2'];
    const nextItems = ['0', '1', '2', '3', '4'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );
    const journal: VNodeJournal = [];
    const renderItem = vi.fn((item: string) => createRow(item));

    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      renderItem
    );

    expect(renderItem.mock.calls).toEqual([
      ['3', 3],
      ['4', 4],
    ]);
  });

  it('should render only prepended keyed rows', async () => {
    const initialItems = ['2', '3'];
    const nextItems = ['0', '1', '2', '3'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );
    const journal: VNodeJournal = [];
    const renderItem = vi.fn((item: string) => createRow(item));

    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      renderItem
    );

    expect(renderItem.mock.calls).toEqual([
      ['0', 0],
      ['1', 1],
    ]);
  });

  it('should remove a keyed prefix without deleting the unchanged tail', async () => {
    const initialItems = ['0', '1', '2', '3'];
    const nextItems = ['2', '3'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );

    const journal: VNodeJournal = [];
    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(vNode).toMatchVDOM(_jsxSorted('test', {}, null, nextItems.map(createRow), 0, 'KA_root'));

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(2);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should not throw when moving keyed children inside a virtual parent', async () => {
    const initialItems = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    const nextItems = ['0', '8', '2', '3', '4', '5', '6', '7', '1', '9'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted(
        'table',
        {},
        null,
        [_jsxSorted(Fragment, {}, null, initialItems.map(createRow), 0, null)],
        0,
        'KA_root'
      )
    );
    const parent = (vNode as ElementVNode).firstChild as VirtualVNode;
    const journal: VNodeJournal = [];

    await reconcileKeyedLoopToParent(
      container,
      journal,
      parent,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      (item) => createRow(item)
    );

    expect(() => _flushJournal(journal)).not.toThrow();
    expect(container.document.querySelectorAll('b')).toHaveLength(10);
    expect(
      Array.from(container.document.querySelectorAll('b')).map((node) => node.textContent)
    ).toEqual(nextItems);
  });

  it('should not rerender reused keyed rows during reorder-only updates', async () => {
    const initialItems = ['0', '1', '2', '3'];
    const nextItems = ['0', '2', '1', '3'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted('test', {}, null, initialItems.map(createRow), 0, 'KA_root')
    );
    const journal: VNodeJournal = [];
    const renderItem = vi.fn((item: string) => createRow(item));

    await reconcileKeyedLoopToParent(
      container,
      journal,
      vNode as ElementVNode,
      null as unknown as Cursor,
      nextItems,
      (item) => item,
      renderItem
    );

    expect(renderItem).not.toHaveBeenCalled();
  });

  it('should remove keyed children inside a virtual parent with a single remove-all operation', async () => {
    const initialItems = ['0', '1', '2'];
    const { vNode, container } = vnode_fromJSX(
      _jsxSorted(
        'table',
        {},
        null,
        [_jsxSorted(Fragment, {}, null, initialItems.map(createRow), 0, null)],
        0,
        'KA_root'
      )
    );
    const parent = (vNode as ElementVNode).firstChild as VirtualVNode;
    const journal: VNodeJournal = [];

    await reconcileKeyedLoopToParent(
      container,
      journal,
      parent,
      null as unknown as Cursor,
      [],
      (item) => item,
      (item) => createRow(item)
    );

    expect(journal).toHaveLength(1);
    expect(journal[0]).toBeInstanceOf(RemoveAllChildrenOperation);
    expect((journal[0] as RemoveAllChildrenOperation).target).toBe((vNode as ElementVNode).node);

    _flushJournal(journal);

    expect(container.document.querySelectorAll('b')).toHaveLength(0);
    expect(container.document.querySelector('table')?.innerHTML).toBe('');
  });
});
