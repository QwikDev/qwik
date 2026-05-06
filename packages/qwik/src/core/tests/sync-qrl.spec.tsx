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
            sync$((e: Event, target: Element) => {
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

  it('should run parent sync qrls when a child async click bubbles', async () => {
    const Cmp = component$(() => {
      return (
        <div
          onClick$={[
            sync$((_event: Event, target: Element) => {
              target.setAttribute('parent-sync', 'true');
            }),
          ]}
        >
          <button
            onClick$={async (_event: Event, target: Element) => {
              target.setAttribute('child-async', 'true');
            }}
          ></button>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    const button = document.querySelector('button');
    const parent = document.querySelector('div');

    await trigger(document.body, button, 'click');

    expect(button?.getAttribute('child-async')).toBe('true');
    expect(parent?.getAttribute('parent-sync')).toBe('true');
  });
});
