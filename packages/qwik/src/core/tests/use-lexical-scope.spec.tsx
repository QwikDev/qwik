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
])('$render.name: useLexicalScope', ({ render }) => {
  it('should update const prop event value', async () => {
    type Cart = string[];

    const Parent = component$(() => {
      const cart = useStore<Cart>([]);
      const results = useSignal(['foo']);

      return (
        <div>
          <button id="first" onClick$={() => (results.value = ['item'])}></button>

          {results.value.map((item) => (
            <button
              id="second"
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
          <button id="second">foo</button>
          <ul></ul>
        </div>
      </Component>
    );

    await trigger(document.body, 'button#first', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="first"></button>
          <button id="second">item</button>
          <ul></ul>
        </div>
      </Component>
    );

    await trigger(document.body, 'button#second', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button id="first"></button>
          <button id="second">item</button>
          <ul>
            <li>
              <span>item</span>
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
});
