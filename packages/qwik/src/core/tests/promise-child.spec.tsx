import { describe, expect, it } from 'vitest';
import { component$, type JSXOutput } from '@qwik.dev/core';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

// SSR awaits the promise before streaming, so the interesting path is the client mount.
describe.runIf(name === 'csrRender')(`${name}: promise as JSX child`, () => {
  it('renders the resolved JSX once the promise settles', async () => {
    const App = component$(() => {
      const content = new Promise<JSXOutput>((resolve) => {
        (globalThis as unknown as Record<string, unknown>).__resolvePromiseChild = () =>
          resolve(<p id="async-value">Async content</p>);
      });
      return <div id="host">{content}</div>;
    });

    // the client render waits for the promise child, so it settles mid-render
    const rendering = render(App, { debug });
    await new Promise((resolve) => setTimeout(resolve, 5));
    (globalThis as unknown as Record<string, () => void>).__resolvePromiseChild();
    const { container, cleanup } = await rendering;

    expect(container.querySelector('#async-value')?.textContent).toBe('Async content');

    cleanup();
  });
});
