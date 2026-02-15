import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$, useSignal } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  it('should correctly extract qrls from loop items', async () => {
    (globalThis as any).log = [];
    const Cmp = component$(() => {
      const loop: string[] = ['abcd', 'xyz'];
      return (
        <div>
          {loop.map((item, index) => {
            return (
              <div
                id={`item-${index}`}
                onClick$={() => (globalThis as any).log.push(item)}
                onMouseOver$={() => (globalThis as any).log.push(index)}
              >
                {item}
              </div>
            );
          })}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, document.getElementById('item-0'), 'click');
    expect((globalThis as any).log).toEqual(['abcd']);
    await trigger(document.body, document.getElementById('item-0'), 'mouseover');
    expect((globalThis as any).log).toEqual(['abcd', 0]);
    (globalThis as any).log = [];
    await trigger(document.body, document.getElementById('item-1'), 'click');
    expect((globalThis as any).log).toEqual(['xyz']);
    await trigger(document.body, document.getElementById('item-1'), 'mouseover');
    expect((globalThis as any).log).toEqual(['xyz', 1]);
    (globalThis as any).log = undefined;
  });

  it('should correctly extract qrls from loop items and capture refs', async () => {
    (globalThis as any).log = [];
    const Cmp = component$(() => {
      const foo = useSignal('hi');
      const bar = useSignal('ho');
      const loop: string[] = ['abcd', 'xyz'];
      return (
        <div>
          {loop.map((item, index) => {
            return (
              <div
                id={`item-${index}`}
                onClick$={() => (globalThis as any).log.push(item, foo.value)}
                onMouseOver$={() => (globalThis as any).log.push(index, bar.value)}
              >
                {item}
              </div>
            );
          })}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, document.getElementById('item-0'), 'click');
    expect((globalThis as any).log).toEqual(['abcd', 'hi']);
    await trigger(document.body, document.getElementById('item-0'), 'mouseover');
    expect((globalThis as any).log).toEqual(['abcd', 'hi', 0, 'ho']);
    (globalThis as any).log = [];
    await trigger(document.body, document.getElementById('item-1'), 'click');
    expect((globalThis as any).log).toEqual(['xyz', 'hi']);
    await trigger(document.body, document.getElementById('item-1'), 'mouseover');
    expect((globalThis as any).log).toEqual(['xyz', 'hi', 1, 'ho']);
    (globalThis as any).log = undefined;
  });
});
