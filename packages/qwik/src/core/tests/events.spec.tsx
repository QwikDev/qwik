import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, Fragment as Component } from '@qwik.dev/core';

const debug = true; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: events', ({ render }) => {
  it('should render event value', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <button
          onClick$={() => {
            (globalThis as any).logs.push('clicked');
          }}
        ></button>
      );
    });

    const { vNode, document } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['clicked']);
    (globalThis as any).logs = undefined;
  });
  it('should render event falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={undefined}></button>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });
  it('should render events array of falsy value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined, undefined]}></button>;
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });

  it('should not throw if event handler is array with undefined value', async () => {
    const Cmp = component$(() => {
      return <button onClick$={[undefined]}></button>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <button></button>
      </Component>
    );
  });
});
