import { describe, expect, it } from 'vitest';
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
        startNode.ownerDocument,
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
      { document: startNode.ownerDocument } as ContainerContext
    );

    block.keys = [1, 2, 3, 4, 5];
    block.rows = [a, b, c, d, e] as unknown as Element[];
    block.owners = block.rows.map(() => createOwner(listOwner));

    return { block, insertCount: () => insertCount, parent };
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

  it('creates rows directly when starting empty', () => {
    const startNode = createTestDomNode('start');
    const endNode = createTestDomNode('end');
    const parent = createTestParentNode([startNode, endNode]);
    const items = createSignal([1, 2, 3]);
    const listOwner = createOwner(null);
    const block = new ForBlock(
      new ForRange(
        startNode.ownerDocument,
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
      { document: startNode.ownerDocument } as ContainerContext
    );

    block.reconcile(
      new ForBlockSubscription(block),
      (item) => item,
      (_ctx, item) => [createElementNode(String(item))]
    );

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', '1', '2', '3', 'end']);
    expect(block.owners).toEqual([null, null, null]);
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
        startNode.ownerDocument,
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
      { document: startNode.ownerDocument } as ContainerContext
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
        startNode.ownerDocument,
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
      { document: startNode.ownerDocument } as ContainerContext
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
