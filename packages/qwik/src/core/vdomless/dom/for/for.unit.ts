import { describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../../testing/document';
import { createTextNodeEffect, ForBlockSubscription } from '../effect/effect';
import { createSignal } from '../../reactive/signal';
import type { ContainerContext } from '../../runtime/container-context';
import { createOwner } from '../../runtime/owner';
import {
  createTestDomNode,
  createTestParentNode,
  createText,
  getNodeLabel,
} from '../../test-utils';
import { ForBlock, ForRange } from './for';

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

    const items = createSignal(nextIds.map((id) => ({ id })));
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
      false,
      false,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.keys = [1, 2, 3, 4, 5];
    block.rows = [a, b, c, d, e] as unknown as Element[];
    block.owners = block.rows.map(() => createOwner(listOwner));

    return { block, insertCount: () => insertCount, parent };
  };

  const createKeyedBlock = (oldIds: number[], nextIds: number[]) => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const oldRows = oldIds.map((id) => createTestDomNode(String(id)));
    const parent = createTestParentNode([startNode, ...oldRows, endNode]);
    const items = createSignal(nextIds.map((id) => ({ id })));
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
      false,
      false,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.keys = oldIds;
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

  it('trims removed keyed rows from the head and tail', () => {
    const { block, parent } = createKeyedBlock([0, 1, 2, 3], [1, 2]);

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item.id,
      (_ctx, item) => [createElementNode(String((item as { id: number }).id))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '2', 'end']);
  });

  it('creates rows directly when starting empty', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = createSignal([1, 2, 3]);
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
      false,
      false,
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
    const items = createSignal([1]);
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
      false,
      false,
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

  it('creates native range rows for multi-node fragments', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = createSignal([1, 2]);
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
      false,
      false,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
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
  });

  it('updates retained item and index signals', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const items = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument!,
        startNode as unknown as Comment,
        endNode as unknown as Comment
      ),
      items,
      (item) => item.id,
      () => [createElementNode('row')],
      true,
      true,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );
    const subscription = new ForBlockSubscription(block);

    block.reconcile(
      subscription,
      (item) => item.id,
      () => [createElementNode('row')]
    );
    items.value = [
      { id: 0, label: 'z' },
      { id: 1, label: 'aa' },
      { id: 2, label: 'bb' },
    ];
    block.reconcile(
      subscription,
      (item) => item.id,
      () => [createElementNode('row')]
    );

    expect(block.itemSignals![1]!.value).toEqual({ id: 1, label: 'aa' });
    expect(block.indexSignals![1]!.value).toBe(1);
    expect(block.itemSignals![2]!.value).toEqual({ id: 2, label: 'bb' });
    expect(block.indexSignals![2]!.value).toBe(2);
  });

  it('throws on duplicate keys in dev', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    createTestParentNode([startNode, endNode]);
    const items = createSignal([1, 1]);
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
      false,
      false,
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
    const renderRow = (_ctx: ContainerContext, item: number | { value: number }) => {
      const li = document.createElement('li');
      li.textContent = String(typeof item === 'object' ? item.value : item);
      return [li];
    };

    const items = createSignal([1, 2, 3]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(document, startNode, endNode),
      items,
      (item) => item,
      renderRow,
      false,
      false,
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
    const items = createSignal([1, 2, 3]);
    const keySuffix = createSignal('a');
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
      false,
      false,
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
    const items = createSignal([1]);
    const text = createSignal('row');
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
      false,
      false,
      listOwner,
      null,
      { document: startNode.ownerDocument! } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item,
      (_ctx, item) => {
        createTextNodeEffect(createText(), text);
        return [createElementNode(String(item))];
      }
    );

    expect(block.owners[0]).not.toBeNull();
    expect(block.rowInvokeContext.owner).toBeNull();
    expect(listOwner.items).toContain(block.owners[0]);
    expect(block.owners[0]!.items).toHaveLength(1);
  });

  it('clears rows on dispose', () => {
    const { block, parent } = createMeasuredBlock([]);

    block.dispose();

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
  });
});
