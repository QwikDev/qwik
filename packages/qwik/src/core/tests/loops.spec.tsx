import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { component$ } from '@qwik.dev/core';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  //   { render: domRender }, //
])('$render.name: loops', ({ render }) => {
  it.only('should correctly extract qrls from loop items', async () => {
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
                onHover$={() => (globalThis as any).log.push(index)}
              >
                {item}
              </div>
            );
          })}
        </div>
      );
    });

    const { document, vNode } = await render(<Cmp />, { debug });
    await trigger(document.body, document.getElementById('item-0'), 'click');
    expect((globalThis as any).log).toEqual(['abcd']);
    (globalThis as any).log = undefined;
  });
});
