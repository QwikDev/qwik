import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../testing/document';
import { ForBlockSubscription } from '../effect/effect';
import { createTextNodeEffect } from '../effect/text-effect';
import { useSignal } from '../../reactive/public-api';
import { OwnerFlags } from '../../reactive/flags';
import type { ContainerContext } from '../../runtime/container-context';
import { createOwner, ownerItemsLength, type Owner } from '../../runtime/owner';
import {
  createTestDomNode,
  createTestParentNode,
  createText,
  getNodeLabel,
  toArray,
} from '../../test-utils';
import { IndexMode, ForBlock, ForRange } from './for';

describe('ForBlock reorder', () => {
  const createElementNode = (label: string): Node =>
    Object.assign(createTestDomNode(label), {
      nodeType: 1,
      setAttribute() {},
    });

  const createMeasuredBlock = (nextIds: number[]) => {
    const startNode = createTestDomNode('start');
    const a = createTestDomNode('a');
    const b = createTestDomNode('b');
    const c = createTestDomNode('c');
    const d = createTestDomNode('d');
    const e = createTestDomNode('e');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, a, b, c, d, e, endNode]);
    const insertBefore = parent.insertBefore.bind(parent);
    let insertCount = 0;

    parent.insertBefore = ((node: Node, before: Node | null) => {
      insertCount++;
      return insertBefore(node, before);
    }) as typeof parent.insertBefore;

    const items = useSignal(nextIds.map((id) => ({ id })));
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item.id,
      () => [],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.keys = ['1', '2', '3', '4', '5'];
    block.rows = [a, b, c, d, e] as unknown as Element[];
    block.owners = block.rows.map(() => createOwner(listOwner));

    return { block, insertCount: () => insertCount, parent };
  };

  const createKeyedBlock = (oldIds: number[], nextIds: number[]) => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const oldRows = oldIds.map((id) => createTestDomNode(String(id)));
    const parent = createTestParentNode([startNode, ...oldRows, endNode]);
    const items = useSignal(nextIds.map((id) => ({ id })));
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.keys = oldIds.map(String);
    block.rows = oldRows as unknown as Element[];
    block.owners = block.rows.map(() => createOwner(listOwner));

    return { block, parent };
  };

  it('moves only swapped keyed row endpoints', () => {
    const { block, insertCount, parent } = createMeasuredBlock([1, 4, 3, 2, 5]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'a', 'd', 'c', 'b', 'e', 'end']);
    expect(insertCount()).toBe(2);
  });

  it('swaps keyed endpoints without allocating lookup or LIS buffers', () => {
    const oldIds = Array.from({ length: 1_000 }, (_, index) => index + 1);
    const nextIds = oldIds.slice();
    [nextIds[1], nextIds[998]] = [nextIds[998], nextIds[1]];
    const { block } = createKeyedBlock(oldIds, nextIds);
    const subscription = new ForBlockSubscription(block);
    const map = vi.spyOn(globalThis, 'Map');
    const buffers = vi.spyOn(globalThis, 'Int32Array');
    try {
      block.reconcile(
        subscription,
        (item) => item.id,
        () => []
      );

      expect(map).not.toHaveBeenCalled();
      expect(buffers).not.toHaveBeenCalled();
    } finally {
      map.mockRestore();
      buffers.mockRestore();
    }
  });

  it.each([
    { nextIds: [2, 1, 3, 4, 5] },
    { nextIds: [5, 2, 3, 4, 1] },
    { nextIds: [1, 4, 3, 2, 5] },
    { nextIds: [1, 5, 3, 4, 2] },
    { nextIds: [1, 4, 2, 3, 5] },
    { nextIds: [1, 4, 6, 2, 5] },
  ])('preserves keyed row owners when reordering to $nextIds', ({ nextIds }) => {
    const { block, parent } = createKeyedBlock([1, 2, 3, 4, 5], nextIds);
    const oldRows = block.rows.slice();
    const oldOwners = block.owners.slice();

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String(item.id))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', ...nextIds.map(String), 'end']);
    for (let i = 0; i < nextIds.length; i++) {
      if (nextIds[i] <= 5) {
        expect(block.rows[i]).toBe(oldRows[nextIds[i] - 1]);
        expect(block.owners[i]).toBe(oldOwners[nextIds[i] - 1]);
        expect(block.owners[i]!.flags & OwnerFlags.Disposed).toBe(0);
      }
    }
  });

  it('moves the last keyed row to the front once', () => {
    const { block, insertCount, parent } = createMeasuredBlock([5, 1, 2, 3, 4]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'e', 'a', 'b', 'c', 'd', 'end']);
    expect(insertCount()).toBe(1);
  });

  it.each([IndexMode.Effects, IndexMode.Escapes])(
    'retains multi-node rows and index signals across swaps in mode %s',
    (indexMode) => {
      const start = createTestDomNode('start');
      const end = createTestDomNode('end');
      const parent = createTestParentNode([start, end]);
      const items = useSignal([1, 2, 3, 4, 5]);
      const renderRow = vi.fn((_ctx: ContainerContext, id: number) => {
        createTextNodeEffect(createText(), useSignal(String(id)));
        return [createTestDomNode(`a${id}`), createTestDomNode(`b${id}`)];
      });
      const block = new ForBlock(
        new ForRange(start.ownerDocument!, start as unknown as Comment, end as unknown as Comment),
        items,
        (id) => id,
        renderRow,
        indexMode,
        createOwner(null),
        null,
        { document: start.ownerDocument! } as ContainerContext
      );
      const subscription = new ForBlockSubscription(block);
      block.reconcile(subscription, (id) => id, renderRow);
      const rows = block.rows.slice();
      const owners = block.owners.slice();
      const indices = block.indexSignals!.slice();

      for (const nextIds of [
        [5, 2, 3, 4, 1],
        [5, 3, 2, 4, 1],
        [1, 3, 2, 4, 5],
      ]) {
        items.value = nextIds;
        block.reconcile(subscription, (id) => id, renderRow);

        expect(renderRow).toHaveBeenCalledTimes(5);
        expect(block.rows).toEqual(nextIds.map((id) => rows[id - 1]));
        expect(block.owners).toEqual(nextIds.map((id) => owners[id - 1]));
        expect(block.indexSignals).toEqual(nextIds.map((id) => indices[id - 1]));
        expect(block.indexSignals!.map((index) => index!.value)).toEqual([0, 1, 2, 3, 4]);
        expect(parent.nodes.map(getNodeLabel)).toEqual([
          'start',
          ...nextIds.flatMap((id) => ['r', `a${id}`, `b${id}`, '/r']),
          'end',
        ]);
      }
      block.dispose();
      expect(owners.every((owner) => owner!.flags & OwnerFlags.Disposed)).toBe(true);
      expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
    }
  );

  it('clears the range when the next rows are empty', () => {
    const { block, parent } = createMeasuredBlock([]);
    const clear = block.range.clear.bind(block.range);
    let clearCount = 0;
    block.range.clear = () => {
      clearCount++;
      clear();
    };

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(clearCount).toBe(1);
    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
  });

  it.each([false, true])('clears rows while preserving siblings: %s', (hasSiblings) => {
    const document = createDocument({
      html: `<ul>${hasSiblings ? '<li>before</li>' : ''}<!--start--><li>row</li><!--end-->${hasSiblings ? '<li>after</li>' : ''}</ul>`,
    });
    const list = document.querySelector('ul')!;
    const start = list.childNodes[hasSiblings ? 1 : 0] as Comment;
    const end = list.childNodes[hasSiblings ? 3 : 2] as Comment;
    const replaceChildren = vi.spyOn(list, 'replaceChildren').mockImplementation(() => {
      while (list.firstChild !== null) {
        list.removeChild(list.firstChild);
      }
    });

    new ForRange(document, start, end).clear();

    expect(start.parentNode).toBe(list);
    expect(end.parentNode).toBe(list);
    expect(list.textContent).toBe(hasSiblings ? 'beforeafter' : '');
    expect(replaceChildren).toHaveBeenCalledTimes(hasSiblings ? 0 : 1);
  });

  it('ignores detached collection markers when clearing', () => {
    const document = createDocument({ html: '<ul></ul>' });
    const start = document.createComment('start');
    const end = document.createComment('end');

    expect(() => new ForRange(document, start, end).clear()).not.toThrow();
  });

  it('disposes all row owners without scanning their siblings', () => {
    const { block } = createMeasuredBlock([]);
    const oldOwners = block.owners.slice();
    const ownerItems = block.listOwner.items as Owner[];
    const indexOf = vi.spyOn(ownerItems, 'indexOf');

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(indexOf).not.toHaveBeenCalled();
    expect(block.listOwner.items).toBeNull();
    expect(block.listOwner.flags & OwnerFlags.Disposed).toBe(0);
    expect(oldOwners.every((owner) => owner!.flags & OwnerFlags.Disposed)).toBe(true);
  });

  it('does not clear an already empty range', () => {
    const { block } = createKeyedBlock([], []);
    const clear = vi.spyOn(block.range, 'clear');

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(clear).not.toHaveBeenCalled();
  });

  it('appends keyed rows after a retained prefix', () => {
    const { block, parent } = createKeyedBlock([1, 2], [1, 2, 3, 4]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '2', '3', '4', 'end']);
  });

  it('prepends keyed rows before a retained suffix', () => {
    const { block, parent } = createKeyedBlock([2, 3], [0, 1, 2, 3]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '0', '1', '2', '3', 'end']);
  });

  it('replaces disjoint keyed rows with one replaceChildren call', () => {
    const document = createDocument({
      html: '<ul><!--start--><li>1</li><li>2</li><!--end--></ul>',
    });
    const list = document.querySelector('ul')!;
    const startNode = list.firstChild as Comment;
    const endNode = list.lastChild as Comment;
    const oldRows = Array.from(list.querySelectorAll('li'));
    const items = useSignal([{ id: 3 }, { id: 4 }]);
    const listOwner = createOwner(null);
    const renderRow = (_ctx: ContainerContext, item: { id: number }) => {
      const row = document.createElement('li');
      row.textContent = String(item.id);
      return row;
    };
    const block = new ForBlock(
      new ForRange(document, startNode, endNode),
      items,
      (item) => item.id,
      renderRow,
      IndexMode.None,
      listOwner,
      null,
      { document } as ContainerContext
    );
    block.keys = ['1', '2'];
    block.rows = oldRows;
    const oldOwners = oldRows.map(() => createOwner(listOwner));
    block.owners = oldOwners;
    const insertBefore = vi.spyOn(list, 'insertBefore');
    const replaceChildren = vi.spyOn(list, 'replaceChildren').mockImplementation(() => {
      while (list.firstChild !== null) {
        list.removeChild(list.firstChild);
      }
    });

    try {
      block.reconcile(new ForBlockSubscription(block), (item) => item.id, renderRow);

      expect(replaceChildren).toHaveBeenCalledOnce();
      expect(replaceChildren).toHaveBeenCalledWith();
      const fragmentInsertions = insertBefore.mock.calls.filter(([node]) => node.nodeType === 11);
      expect(fragmentInsertions).toEqual([[expect.objectContaining({ nodeType: 11 }), endNode]]);
      expect([...list.childNodes].map((node) => node.textContent)).toEqual([
        'start',
        '3',
        '4',
        'end',
      ]);
      expect(oldOwners.every((owner) => owner.flags & OwnerFlags.Disposed)).toBe(true);
    } finally {
      insertBefore.mockRestore();
      replaceChildren.mockRestore();
    }
  });

  it('releases disjoint rows before rendering their replacements', () => {
    const document = createDocument({
      html: '<ul><!--start--><li>1</li><li>2</li><!--end--></ul>',
    });
    const list = document.querySelector('ul')!;
    const startNode = list.firstChild as Comment;
    const endNode = list.lastChild as Comment;
    const oldRows = Array.from(list.querySelectorAll('li'));
    const items = useSignal([{ id: 3 }, { id: 4 }]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(document, startNode, endNode),
      items,
      (item) => item.id,
      () => [],
      IndexMode.None,
      listOwner,
      null,
      { document } as ContainerContext
    );
    const oldOwners = oldRows.map(() => createOwner(listOwner));
    block.keys = ['1', '2'];
    block.rows = oldRows;
    block.owners = oldOwners;
    const replaceChildren = vi.spyOn(list, 'replaceChildren').mockImplementation(() => {
      while (list.firstChild !== null) {
        list.removeChild(list.firstChild);
      }
    });

    try {
      block.reconcile(
        new ForBlockSubscription(block),
        (item) => item.id,
        (_ctx, item) => {
          expect(block.rows).toHaveLength(0);
          expect(oldOwners.every((owner) => owner.flags & OwnerFlags.Disposed)).toBe(true);
          const row = document.createElement('li');
          row.textContent = String(item.id);
          return row;
        }
      );

      expect([...list.childNodes].map((node) => node.textContent)).toEqual([
        'start',
        '3',
        '4',
        'end',
      ]);
    } finally {
      replaceChildren.mockRestore();
    }
  });

  it('disposes partially created disjoint rows when rendering throws', () => {
    const document = createDocument({
      html: '<ul><!--start--><li>1</li><!--end--></ul>',
    });
    const list = document.querySelector('ul')!;
    const startNode = list.firstChild as Comment;
    const endNode = list.lastChild as Comment;
    const oldRow = list.querySelector('li')!;
    const items = useSignal([{ id: 2 }, { id: 3 }]);
    const text = useSignal('row');
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(document, startNode, endNode),
      items,
      (item) => item.id,
      () => [],
      IndexMode.None,
      listOwner,
      null,
      { document } as ContainerContext
    );
    block.keys = ['1'];
    block.rows = [oldRow];
    block.owners = [createOwner(listOwner)];
    let createdOwner = null as ReturnType<typeof createOwner> | null;
    const replaceChildren = vi.spyOn(list, 'replaceChildren').mockImplementation(() => {
      while (list.firstChild !== null) {
        list.removeChild(list.firstChild);
      }
    });

    try {
      expect(() =>
        block.reconcile(
          new ForBlockSubscription(block),
          (item) => item.id,
          (_ctx, item) => {
            if (item.id === 3) {
              throw new Error('row failed');
            }
            const effect = createTextNodeEffect(document.createTextNode(''), text);
            createdOwner = effect.owner;
            return document.createElement('li');
          }
        )
      ).toThrow('row failed');

      expect(block.rows).toHaveLength(0);
      expect(createdOwner).not.toBeNull();
      expect(createdOwner!.flags & OwnerFlags.Disposed).toBeTruthy();
      expect([...list.childNodes]).toEqual([startNode, endNode]);
    } finally {
      replaceChildren.mockRestore();
    }
  });

  it('replaces disjoint keyed rows without removing range siblings', () => {
    const document = createDocument({
      html: '<ul><li>before</li><!--start--><li class="row">1</li><!--end--><li>after</li></ul>',
    });
    const list = document.querySelector('ul')!;
    const startNode = Array.from(list.childNodes).find(
      (node) => node.nodeType === 8 && node.textContent === 'start'
    ) as Comment;
    const endNode = Array.from(list.childNodes).find(
      (node) => node.nodeType === 8 && node.textContent === 'end'
    ) as Comment;
    const oldRow = list.querySelector('.row')!;
    const items = useSignal([{ id: 2 }]);
    const listOwner = createOwner(null);
    const renderRow = (_ctx: ContainerContext, item: { id: number }) => {
      const row = document.createElement('li');
      row.className = 'row';
      row.textContent = String(item.id);
      return row;
    };
    const range = new ForRange(document, startNode, endNode);
    const block = new ForBlock(
      range,
      items,
      (item) => item.id,
      renderRow,
      IndexMode.None,
      listOwner,
      null,
      {
        document,
      } as ContainerContext
    );
    block.keys = ['1'];
    block.rows = [oldRow];
    block.owners = [createOwner(listOwner)];
    // One Range is created per range operation, so counting them counts the operations.
    const rangeOps = vi.spyOn(document, 'createRange').mockClear();
    const replaceChildren = vi.spyOn(list, 'replaceChildren');

    try {
      block.reconcile(new ForBlockSubscription(block), (item) => item.id, renderRow);

      expect(replaceChildren).not.toHaveBeenCalled();
      expect(rangeOps).toHaveBeenCalledOnce();
      expect(Array.from(list.querySelectorAll('li'), (row) => row.textContent)).toEqual([
        'before',
        '2',
        'after',
      ]);
    } finally {
      rangeOps.mockRestore();
      replaceChildren.mockRestore();
    }
  });

  it('retains a shared prefix when the remaining keys are disjoint', () => {
    const { block } = createKeyedBlock([1, 2], [1, 3]);
    const retainedRow = block.rows[0];

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(block.rows[0]).toBe(retainedRow);
  });

  it('replaces a large disjoint keyed range with the mapped lookup', () => {
    const oldIds = Array.from({ length: 40 }, (_, index) => index);
    const nextIds = Array.from({ length: 40 }, (_, index) => index + 40);
    const { block, parent } = createKeyedBlock(oldIds, nextIds);
    // One Range is created per range operation, so counting them counts the operations.
    const rangeOps = vi.spyOn(block.range.document, 'createRange').mockClear();

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(rangeOps).toHaveBeenCalledOnce();
    expect(parent.nodes.slice(1, -1).map(getNodeLabel)).toEqual(nextIds.map(String));
  });

  it('removes one element row without allocating a DOM range', () => {
    const { block, parent } = createKeyedBlock([1, 2, 3], [1, 3]);
    const removedOwner = block.owners[1]!;
    const createRange = vi.spyOn(block.range.document, 'createRange').mockClear();

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      () => []
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '3', 'end']);
    expect(createRange).not.toHaveBeenCalled();
    expect(removedOwner.flags & OwnerFlags.Disposed).toBeTruthy();
    createRange.mockRestore();
  });

  it('trims removed keyed rows from the head and tail', () => {
    const { block, parent } = createKeyedBlock([0, 1, 2, 3], [1, 2]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '2', 'end']);
  });

  it('deletes a contiguous keyed suffix in one range operation', () => {
    const { block, parent } = createKeyedBlock([0, 1, 2, 3], [0, 1]);
    const removedOwners = block.owners.slice(2);
    // One Range is created per range operation, so counting them counts the operations.
    const rangeOps = vi.spyOn(block.range.document, 'createRange').mockClear();

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(rangeOps).toHaveBeenCalledOnce();
    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '0', '1', 'end']);
    expect(removedOwners.every((owner) => owner!.flags & OwnerFlags.Disposed)).toBe(true);
  });

  it('creates rows directly when starting empty', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = useSignal([1, 2, 3]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item,
      (_ctx, item) => [createElementNode(String(item))],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item,
      (_ctx, item) => [createElementNode(String(item))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '2', '3', 'end']);
    expect(block.owners).toEqual([null, null, null]);
  });

  it('creates rows from scalar node output', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = useSignal([1]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item,
      (_ctx, item) => createElementNode(String(item)),
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item,
      (_ctx, item) => createElementNode(String(item))
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', 'end']);
  });

  it('creates and trims native range rows for multi-node fragments', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = useSignal([1, 2]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item,
      (_ctx, item) => [createTestDomNode(`a${item}`), createTestDomNode(`b${item}`)],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );
    const subscription = new ForBlockSubscription(block);

    block.reconcile(
      subscription,
      (item) => item,
      (_ctx, item) => [createTestDomNode(`a${item}`), createTestDomNode(`b${item}`)]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual([
      'start',
      'r',
      'a1',
      'b1',
      '/r',
      'r',
      'a2',
      'b2',
      '/r',
      'end',
    ]);

    // One Range is created per range operation, so counting them counts the operations.
    const rangeOps = vi.spyOn(block.range.document, 'createRange').mockClear();
    items.value = [1];
    block.reconcile(
      subscription,
      (item) => item,
      (_ctx, item) => [createTestDomNode(`a${item}`), createTestDomNode(`b${item}`)]
    );

    expect(rangeOps).toHaveBeenCalledOnce();
    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'r', 'a1', 'b1', '/r', 'end']);
  });

  it('retains keyed items and updates their index signals', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const firstItems = [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ];
    const items = useSignal(firstItems);
    const rendered: typeof firstItems = [];
    const positions: Array<() => number> = [];
    const renderRow = (
      _ctx: ContainerContext,
      item: (typeof firstItems)[number],
      index: number | { value: number } | undefined
    ) => {
      rendered.push(item);
      if (typeof index === 'object') {
        positions.push(() => index.value);
      }
      return [createElementNode('row')];
    };
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item.id,
      renderRow,
      IndexMode.Effects,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );
    const subscription = new ForBlockSubscription(block);

    block.reconcile(subscription, (item) => item.id, renderRow);
    items.value = [
      { id: 0, label: 'z' },
      { id: 1, label: 'aa' },
      { id: 2, label: 'bb' },
    ];
    block.reconcile(subscription, (item) => item.id, renderRow);

    expect(rendered.map((item) => item.label)).toEqual(['a', 'b', 'z']);
    expect(rendered[0]).toBe(firstItems[0]);
    expect(rendered[1]).toBe(firstItems[1]);
    expect(block.indexSignals![1]!.value).toBe(1);
    expect(block.indexSignals![2]!.value).toBe(2);
    expect(positions.slice(0, 2).map((read) => read())).toEqual([1, 2]);
  });

  it('throws on duplicate keys in dev', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const items = useSignal([1, 1]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item,
      (_ctx, item) => [createElementNode(String(item))],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    expect(() =>
      block.reconcile(
        new ForBlockSubscription(block),
        (item) => item,
        (_ctx, item) => [createElementNode(String(item))]
      )
    ).toThrow('Duplicate ForBlock key "1".');
  });

  it('detaches empty element parent while creating initial rows', () => {
    const document = createDocument({
      html: '<section><ul><!--start--><!--end--></ul><p>after</p></section>',
    });
    const host = document.querySelector('section')!;
    const list = document.querySelector('ul')!;
    const after = document.querySelector('p')!;
    const startNode = list.firstChild as Comment;
    const endNode = list.lastChild as Comment;
    const removeChild = vi.spyOn(host.constructor.prototype, 'removeChild');
    const insertBefore = vi.spyOn(host.constructor.prototype, 'insertBefore');
    const renderRow = (_ctx: ContainerContext, item: number) => {
      const li = document.createElement('li');
      li.textContent = String(item);
      return [li];
    };

    const items = useSignal([1, 2, 3]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(document, startNode, endNode),
      items,
      (item) => item,
      renderRow,
      IndexMode.None,
      listOwner,
      null,
      { document } as ContainerContext
    );

    try {
      block.reconcile(new ForBlockSubscription(block), (item) => item, renderRow);

      expect(removeChild.mock.calls.filter(([node]) => node === list)).toHaveLength(1);
      expect(
        insertBefore.mock.calls.filter(([node, before]) => node === list && before === after)
      ).toHaveLength(1);
      expect(host.firstElementChild).toBe(list);
      expect(list.querySelector('li')!.hasAttribute('q:row')).toBe(false);
      expect([...list.childNodes].map((node) => node.textContent)).toEqual([
        'start',
        '1',
        '2',
        '3',
        'end',
      ]);
    } finally {
      removeChild.mockRestore();
      insertBefore.mockRestore();
    }
  });

  it('does not track signals read by key functions', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const items = useSignal([1, 2, 3]);
    const keySuffix = useSignal('a');
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => `${item}:${keySuffix.value}`,
      (_ctx, item) => [createElementNode(String(item))],
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );
    const subscription = new ForBlockSubscription(block);

    block.reconcile(
      subscription,
      (item) => `${item}:${keySuffix.value}`,
      (_ctx, item) => [createElementNode(String(item))]
    );

    expect(subscription.deps).toContain(items);
    expect(subscription.deps).not.toContain(keySuffix);
  });

  it('creates row-owned subscriptions without an extra owner context', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const items = useSignal([1]);
    const text = useSignal('row');
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item,
      (_ctx, item) => {
        createTextNodeEffect(createText(), text);
        return [createElementNode(String(item))];
      },
      IndexMode.None,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item,
      (_ctx, item, _index, collection) => {
        expect(collection).toBe(block);
        createTextNodeEffect(createText(), text);
        return [createElementNode(String(item))];
      }
    );

    expect(block.owners[0]).not.toBeNull();
    expect(block.rowInvokeContext.owner).toBeNull();
    expect(toArray(listOwner.items)).toContain(block.owners[0]);
    expect(ownerItemsLength(block.owners[0]!.items)).toBe(1);
  });

  it('clears rows on dispose', () => {
    const { block, parent } = createMeasuredBlock([]);

    block.dispose();

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
  });

  it('computes keys in production', async () => {
    vi.resetModules();
    vi.doMock('@qwik.dev/core/build', async (importOriginal) => ({
      ...(await importOriginal<typeof import('@qwik.dev/core/build')>()),
      isDev: false,
    }));
    try {
      const [build, { ForBlock: ProdForBlock, ForRange: ProdForRange }, effect, reactive, owner] =
        await Promise.all([
          import('@qwik.dev/core/build'),
          import('./for'),
          import('../effect/effect'),
          import('../../reactive/public-api'),
          import('../../runtime/owner'),
        ]);
      expect(build.isDev).toBe(false);
      const start = createTestDomNode('start');
      const end = createTestDomNode('end');
      createTestParentNode([start, end]);
      const items = reactive.useSignal([1, 2]);
      const listOwner = owner.createOwner(null);
      const block = new ProdForBlock(
        new ProdForRange(
          start.ownerDocument!,
          start as unknown as Comment,
          end as unknown as Comment
        ),
        items,
        (item) => item,
        (_ctx, item) => [createElementNode(String(item))],
        IndexMode.None,
        listOwner,
        null,
        { document: start.ownerDocument! } as ContainerContext
      );

      block.reconcile(
        new effect.ForBlockSubscription(block),
        (item) => item,
        (_ctx, item) => [createElementNode(String(item))]
      );

      expect(block.keys).toEqual(['1', '2']);
    } finally {
      vi.doUnmock('@qwik.dev/core/build');
      vi.resetModules();
    }
  });
});
