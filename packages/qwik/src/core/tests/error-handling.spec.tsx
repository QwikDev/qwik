import { component$, useSignal, type Signal } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: error handling', ({ render }) => {
  it('keeps updating a sibling after an uncaught client render error', async () => {
    const Crasher = component$(() => {
      throw new Error('boom');
    });

    const Counter = component$<{ count: Signal<number> }>(({ count }) => (
      <button onClick$={() => count.value++}>{count.value}</button>
    ));

    const App = component$(() => {
      const count = useSignal(0);
      return (
        <>
          <Counter count={count} />
          {count.value === 1 && <Crasher />}
        </>
      );
    });

    const { container } = await render(<App />);
    const button = container.element.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await trigger(container.element, button, 'click', {}, { waitForIdle: false });
    await trigger(container.element, button, 'click', {}, { waitForIdle: false });
    expect(button.textContent).toBe('2');
  });
});
