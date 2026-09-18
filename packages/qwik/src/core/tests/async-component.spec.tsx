import { component$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: async component`, () => {
  it('renders an async component body', async () => {
    const Child = component$(async () => {
      const value = await Promise.resolve('loaded');
      return <span id="async-result">{value}</span>;
    });
    const App = component$(() => (
      <div>
        <h1 id="prefix">Prefix</h1>
        <Child />
      </div>
    ));

    const { container, cleanup } = await render(App, { debug: false });

    expect(container.querySelector('#async-result')?.textContent).toBe('loaded');
    cleanup();
  });
});
