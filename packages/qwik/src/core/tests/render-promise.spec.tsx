import { Fragment as Component, Fragment, component$ } from '@qwikdev/core';
import { domRender, ssrRenderToDom } from '@qwikdev/core/testing';
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
});
