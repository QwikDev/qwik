import { component$, Pending, useComputed$, useSignal } from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: pending`, () => {
  it('updates the parent while scalar content under Pending waits', async () => {
    const App = component$(() => {
      const version = useSignal(0);
      const count = useSignal(0);
      const value = useComputed$(() => {
        if (version.value === 0) {
          return 'ready';
        }
        return new Promise<string>((resolve) => {
          (globalThis as any).__resolvePendingScalar = resolve;
        });
      });
      return (
        <section>
          <button
            id="refresh"
            onClick$={() => {
              version.value++;
              value.clear();
            }}
          >
            refresh
          </button>
          <button id="increment" onClick$={() => count.value++}>
            increment
          </button>
          <p id="count">{count.value}</p>
          <Pending fallback$={(() => <p id="loading">loading</p>) as any}>
            <p id="value">{value.value}</p>
          </Pending>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App, { debug });
    try {
      await vi.waitFor(() => expect(container.querySelector('#value')?.textContent).toBe('ready'));
      await qwikLoader?.dispatch(container.querySelector('#refresh')!, 'click');
      await vi.waitFor(() => expect(container.querySelector('#loading')).toBeTruthy());
      await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
      expect(container.querySelector('#count')?.textContent).toBe('1');
      expect(container.querySelector('#loading')).toBeTruthy();
      (globalThis as any).__resolvePendingScalar('updated');
      await vi.waitFor(() =>
        expect(container.querySelector('#value')?.textContent).toBe('updated')
      );
      expect(container.querySelector('#loading')).toBeFalsy();
    } finally {
      (globalThis as any).__resolvePendingScalar?.('updated');
      delete (globalThis as any).__resolvePendingScalar;
      cleanup();
    }
  });
});
