import { component$, useTask$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

describe.each([
  { name: 'ssr', render: ssrRender },
  { name: 'csr', render: csrRender },
])('$name: public render root', ({ render }) => {
  it('renders a root without props', async () => {
    const App = component$(() => <p>ready</p>);
    const { container, cleanup } = await render(App);

    expect(container.querySelector('p')?.textContent).toBe('ready');
    cleanup();
  });

  it('passes options.props directly to the compiled root', async () => {
    const App = component$((props: { label: string; count: number }) => (
      <p>{props.label + ':' + props.count}</p>
    ));
    const { container, cleanup } = await render(App, {
      props: { label: 'items', count: 3 },
    });

    expect(container.querySelector('p')?.textContent).toBe('items:3');
    cleanup();
  });

  it('runs setup once and cleanup exactly once', async () => {
    (globalThis as any).__renderApiSetups = 0;
    (globalThis as any).__renderApiCleanups = 0;
    const App = component$(() => {
      (globalThis as any).__renderApiSetups++;
      useTask$(() => () => (globalThis as any).__renderApiCleanups++);
      return <p>ready</p>;
    });
    const result = await render(App);

    expect((globalThis as any).__renderApiSetups).toBe(1);
    result.cleanup();
    result.cleanup();
    expect((globalThis as any).__renderApiCleanups).toBe(1);
    delete (globalThis as any).__renderApiSetups;
    delete (globalThis as any).__renderApiCleanups;
  });
});
