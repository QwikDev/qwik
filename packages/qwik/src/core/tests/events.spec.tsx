import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, Fragment as Component } from '@qwik.dev/core';

const debug = false; //true;
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

  it('registers touchmove as passive', async () => {
    const Cmp = component$(() => {
      return (
        // @qwik-disable-next-line preventdefault-passive-check
        <div passive:touchmove preventdefault:touchmove onTouchMove$={() => {}}></div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    const ev = await trigger(document.body, 'div', 'touchmove');

    expect(ev!.defaultPrevented).toBe(false);
  });

  it('dispatches capture handlers before bubbling handlers', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['parent capture', 'button bubble']);
    (globalThis as any).logs = undefined;
  });

  it('stops bubbling after capture stoppropagation', async () => {
    (globalThis as any).logs = [];
    const Cmp = component$(() => {
      return (
        <div
          capture:click
          stoppropagation:click
          onClick$={() => {
            (globalThis as any).logs.push('parent capture');
          }}
        >
          <button
            onClick$={() => {
              (globalThis as any).logs.push('button bubble');
            }}
          ></button>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });

    await trigger(document.body, 'button', 'click');
    expect((globalThis as any).logs).toEqual(['parent capture']);
    (globalThis as any).logs = undefined;
  });
});
