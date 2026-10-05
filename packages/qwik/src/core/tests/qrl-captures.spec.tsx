import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import {
  component$,
  useStore,
  useSignal,
  Fragment as Component,
  Fragment as Signal,
} from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: QRL captures', ({ render }) => {
  it('should update const prop event value', async () => {
    type Cart = string[];

    const Parent = component$(() => {
      const cart = useStore<Cart>([]);
      const results = useSignal(['foo', 'bar']);

      return (
        <div>
          <button id="first" onClick$={() => (results.value = ['item1', 'item2'])}></button>

          {results.value.map((item, key) => (
            <button
              id={'second-' + key}
              onClick$={() => {
                cart.push(item);
              }}
            >
              {item}
            </button>
          ))}
          <ul>
            {cart.map((item) => (
              <li>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    });

    const { vNode, document } = await render(<Parent />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="first"></button>
          <button id="second-0">foo</button>
          <button id="second-1">bar</button>
          <ul></ul>
        </div>
      </Component>
    );

    await trigger(document.body, 'button#first', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="first"></button>
          <button id="second-0">item1</button>
          <button id="second-1">item2</button>
          <ul></ul>
        </div>
      </Component>
    );

    await trigger(document.body, 'button#second-1', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="first"></button>
          <button id="second-0">item1</button>
          <button id="second-1">item2</button>
          <ul>
            <li>
              <span>item2</span>
            </li>
          </ul>
        </div>
      </Component>
    );
  });

  describe('regression', () => {
    it('#5662 - should update value in the list', async () => {
      /**
       * ROOT CAUSE ANALYSIS: This is a bug in Optimizer. The optimizer incorrectly marks the
       * `onClick` listener as 'const'/'immutable'. Because it is const, the QRL associated with the
       * click handler always points to the original object, and it is not updated.
       */
      const Cmp = component$(() => {
        const store = useStore<{ users: { name: string }[] }>({ users: [{ name: 'Giorgio' }] });

        return (
          <div>
            {store.users.map((user, key) => (
              <span
                key={key}
                onClick$={() => {
                  store.users = store.users.map(({ name }: { name: string }) => ({
                    name: name === user.name ? name + '!' : name,
                  }));
                }}
              >
                {user.name}
              </span>
            ))}
          </div>
        );
      });
      const { vNode, container } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <span key="0">
              <Signal ssr-required>{'Giorgio'}</Signal>
            </span>
          </div>
        </Component>
      );
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <span key="0">
              <Signal ssr-required>{'Giorgio!!!!!'}</Signal>
            </span>
          </div>
        </Component>
      );
    });
  });

  describe('loop params named like a prop', () => {
    it('should select the clicked tab', async () => {
      const Tabs = component$(({ tab, tabs }: { tab: string; tabs: string[] }) => {
        const selected = useSignal('');
        return (
          <div>
            {tabs.map((tab) => (
              <button id={tab} onClick$={() => (selected.value = tab)} />
            ))}
            <p>{selected.value}</p>
          </div>
        );
      });

      const { document } = await render(<Tabs tab="prop" tabs={['a', 'b']} />, { debug });
      await trigger(document.body, 'button#b', 'click');

      expect(document.querySelector('p')!.textContent).toBe('b');
    });

    it('should read the loop item', async () => {
      (globalThis as any).__loopItemLog = [];
      const List = component$(({ item, items }: { item: string; items: string[] }) => {
        return (
          <ul>
            {items.map((item) => (
              <li id={item} onClick$={() => (globalThis as any).__loopItemLog.push(item)} />
            ))}
          </ul>
        );
      });

      const { document } = await render(<List item="prop" items={['a', 'b']} />, { debug });
      await trigger(document.body, 'li#a', 'click');
      await trigger(document.body, 'li#b', 'click');

      expect((globalThis as any).__loopItemLog).toEqual(['a', 'b']);
      delete (globalThis as any).__loopItemLog;
    });
  });
});

describe('QRL captures serialization', () => {
  it('should serialize only the aliased store branch an event handler captures', async () => {
    const Cmp = component$(() => {
      const store = useStore({ counter: { count: 1 }, largeData: { data: 'LARGE DATASET' } });
      const counter = store.counter;
      return <button onClick$={() => counter.count++}>{counter.count}</button>;
    });
    const { document } = await ssrRenderToDom(<Cmp />, { debug });
    const state = document.querySelector('script[type="qwik/state"]')!.textContent;
    expect(state).not.toContain('LARGE DATASET');

    await trigger(document.body, 'button', 'click');
    expect(document.querySelector('button')!.textContent).toBe('2');
  });
});
