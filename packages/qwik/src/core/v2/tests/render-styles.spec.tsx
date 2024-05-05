import { domRender, ssrRenderToDom, trigger } from '@builder.io/qwik/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '../../component/component.public';
import { Fragment as Component, Fragment } from '../../render/jsx/jsx-runtime';
import { useStore } from '../../use/use-store.public';

const debug = true; //true;
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
            <span class="even stable0">0</span>
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
            <span class="odd stable0">1</span>
          </Component>
        </Fragment>
      </Component>
    );
  });
});
