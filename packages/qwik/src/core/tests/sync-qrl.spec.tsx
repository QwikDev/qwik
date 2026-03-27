import { $, component$, sync$ } from '@qwik.dev/core';
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

  it('should dispatch capture handlers before bubble handlers', async () => {
    const Cmp = component$(() => {
      return (
        <div
          id="parent"
          onClick$={$((_ev, el) => {
            el.setAttribute('order', (el.getAttribute('order') || '') + '|parent-bubble');
          })}
        >
          <section
            id="section"
            capture:click
            onClick$={$((_ev, el) => {
              const parent = el.closest('#parent')!;
              parent.setAttribute(
                'order',
                (parent.getAttribute('order') || '') + '|section-capture'
              );
            })}
          >
            <button
              id="button"
              onClick$={$((_ev, el) => {
                const parent = el.closest('#parent')!;
                parent.setAttribute(
                  'order',
                  (parent.getAttribute('order') || '') + '|button-bubble'
                );
              })}
            >
              Click
            </button>
          </section>
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, '#button', 'click');
    expect(document.querySelector('#parent')?.getAttribute('order')).toBe(
      '|section-capture|button-bubble|parent-bubble'
    );
  });
});
