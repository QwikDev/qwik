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

    expect(container.innerHTML).toBe('<p>0</p>');
    expect(html).toBe('<p>0</p>');

    cleanup();
  });
});
