import { component$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender }, //
  { name: 'csrRender', render: csrRender }, //
])('$name: component', ({ render }) => {
  it('should render component', async () => {
    const MyComp = component$(() => {
      return <p>Hello Qwik</p>;
    });

    const { container, html, cleanup } = await render(<MyComp />, { debug });

    expect(container.innerHTML).toBe('<p>Hello Qwik</p>');
    expect(html).toBe('<p>Hello Qwik</p>');

    cleanup();
  });

  it('should render component with fragment', async () => {
    const MyComp = component$(() => {
      return <>Hello Qwik</>;
    });

    const { container, html, cleanup } = await render(<MyComp />, { debug });

    expect(container.innerHTML).toBe('Hello Qwik');
    expect(html).toBe('Hello Qwik');

    cleanup();
  });
});
