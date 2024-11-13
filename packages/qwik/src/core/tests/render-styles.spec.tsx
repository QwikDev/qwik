import {
  Fragment as Component,
  component$,
  Fragment,
  Fragment as Signal,
  useStore,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: render styles', ({ render }) => {
  it('should render styles', async () => {
    const Child = component$<{ count: number }>(({ count }) => {
      // const count = props.counter.count;
      return (
        <span
          class={{
            even: count % 2 === 0,
            odd: count % 2 === 1,
            stable0: true,
            hidden: false,
          }}
        >
          {count}
        </span>
      );
    });

    const TestCmp = component$(() => {
      const count = useStore({ count: 0 });

      return (
        <>
          <button onClick$={() => count.count++} />
          <Child count={count.count} />
        </>
      );
    });

    const { vNode, container } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button />
          <Component>
            <span class="even stable0">
              <Signal ssr-required>0</Signal>
            </span>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <button />
          <Component>
            <span class="odd stable0">
              <Signal ssr-required>1</Signal>
            </span>
          </Component>
        </Fragment>
      </Component>
    );
  });
});
