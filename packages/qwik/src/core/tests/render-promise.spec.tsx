import { Fragment as Component, Fragment, component$, useSignal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: render promise', ({ render }) => {
  it('should render promise', async () => {
    const TestCmp = component$(() => {
      const promise = Promise.resolve('PROMISE_VALUE');
      return <div>{promise}</div>;
    });

    const { vNode } = await render(<TestCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Fragment>PROMISE_VALUE</Fragment>
        </div>
      </Component>
    );
  });

  it('should handle thrown Promise', async () => {
    const Child = component$(() => {
      const signal = useSignal(0);
      if (signal.value === 0) {
        throw Promise.resolve(signal.value++);
      }
      return 'child';
    });
    const Cmp = component$(() => {
      return (
        <div>
          <Child />
        </div>
      );
    });
    const { document } = await render(<Cmp />, { debug });
    expect(document.querySelector('div')).toHaveProperty('textContent', 'child');
  });
});
