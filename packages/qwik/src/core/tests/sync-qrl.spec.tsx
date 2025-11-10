import { component$, sync$ } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: sync-qrl', ({ render }) => {
  it('should prevent updates the checkbox', async () => {
    const Cmp = component$(() => {
      return (
        <input
          type="checkbox"
          onClick$={[
            sync$((e, target) => {
              if (target.getAttribute('shouldPreventDefault')) {
                e.preventDefault();
              }
              target.setAttribute('prevented', String(e.defaultPrevented));
            }),
          ]}
        />
      );
    });

    const { document } = await render(<Cmp />, { debug });
    const input = document.querySelector('input');

    await trigger(document.body, input, 'click');
    expect(input?.getAttribute('prevented')).toBe('false');

    input?.setAttribute('shouldPreventDefault', 'true');
    await trigger(document.body, input, 'click');
    expect(input?.getAttribute('prevented')).toBe('true');
  });
});
