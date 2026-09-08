import { component$, useComputed$, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: async JSX callbacks`, () => {
  it('tracks reads after await inside a nested JSX callback', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const result = useComputed$(async () => {
        const create = async () => {
          let settled = false;
          try {
            await Promise.reject('retry');
          } catch {
            await Promise.resolve();
          } finally {
            settled = true;
          }
          const label = settled ? count.value : -1;
          return { label, view: <b>{label}</b> };
        };
        return create();
      });
      return (
        <main>
          <output>{result.value?.label ?? 'pending'}</output>
          <button onClick$={() => count.value++}>increment</button>
        </main>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    try {
      expect(container.querySelector('output')?.textContent).toBe('0');
      await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
      expect(container.querySelector('output')?.textContent).toBe('1');
    } finally {
      cleanup();
    }
  });
});
