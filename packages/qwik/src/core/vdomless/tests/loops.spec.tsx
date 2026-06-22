import { createSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { ElementRowDom, ForBlock, ForRange } from '../dom/for/for';
import { ForBlockSubscription } from '../dom/effect/effect';
import { createOwner } from '../runtime/owner';
import {
  createTestDomNode,
  createTestParentNode,
  csrRender,
  getNodeLabel,
  ssrRender,
} from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: loops', ({ render }) => {
  it('updates retained keyed rows and row event captures', async () => {
    const MyComp = () => {
      const items = createSignal([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]);
      // TODO(vdomless): empty SSR dynamic text currently leaves no text node to inflate.
      const selected = createSignal('none');
      return (
        <section>
          <button
            id="swap"
            onClick$={() => {
              items.value = [items.value[1], { ...items.value[0], label: 'Alpha*' }];
            }}
          >
            swap
          </button>
          <ul>
            {items.value.map((item, index) => (
              <li key={item.id}>
                <button onClick$={() => (selected.value = item.label + ':' + index)}>pick</button>
                <span>
                  {item.label}:{index}
                </span>
              </li>
            ))}
          </ul>
          <p id="selected">{selected.value}</p>
        </section>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Alpha:0',
      'Beta:1',
    ]);

    await qwikLoader?.dispatch(container.querySelector('#swap')!, 'click');

    expect([...container.querySelectorAll('li span')].map((node) => node.textContent)).toEqual([
      'Beta:0',
      'Alpha*:1',
    ]);

    await qwikLoader?.dispatch(container.querySelectorAll('li button')[1]!, 'click');

    expect(container.querySelector('#selected')?.textContent).toBe('Alpha*:1');
    cleanup();
  });

  it('renders keyed fragment rows', async () => {
    const MyComp = () => {
      const items = createSignal([
        { id: 'a', label: 'Alpha' },
        { id: 'b', label: 'Beta' },
      ]);
      return (
        <p>
          {items.value.map((item) => (
            <>
              <span key={item.id}>{item.label}</span>
              <em>!</em>
            </>
          ))}
        </p>
      );
    };

    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('Alpha!Beta!');
    cleanup();
  });
});

describe('ForBlock reorder', () => {
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
      new ForRange(startNode as unknown as Comment, endNode as unknown as Comment),
      items,
      (item) => item.id,
      () => [],
      false,
      false,
      listOwner,
      null
    );

    block.keys = [1, 2, 3, 4, 5];
    block.rows = [a, b, c, d, e].map((element) => new ElementRowDom(element as unknown as Element));
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

  it('clears rows on dispose', () => {
    const { block, parent } = createMeasuredBlock([]);

    block.dispose();

    expect(parent.nodes.map(getNodeLabel)).toEqual(['start', 'end']);
  });
});
