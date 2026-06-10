import { component$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';
import { createSignal } from '@qwik.dev/core/spark';

const debug = true;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: signals', ({ render }) => {
  it('should render signal', async () => {
    const MyComp = component$(() => {
      const count = createSignal(0);
      return <p>{count.value}</p>;
    });

    const { container, html, cleanup } = await render(<MyComp />, { debug });

    if (render === ssrRender) {
      expect(container.innerHTML).toContain('<p q:id="0">0</p>');
      expect(html).toContain('<p q:id="0">0</p>');

      const script = container.querySelector('script[type="qwik/state"]');
      expect(script).not.toBeNull();
    } else {
      expect(container.innerHTML).toBe('<p>0</p>');
      expect(html).toBe('<p>0</p>');
    }

    cleanup();
  });

  it('should update signal value', async () => {
    const MyComp = component$(() => {
      const count = createSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });
});
