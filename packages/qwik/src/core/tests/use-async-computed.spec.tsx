import { Fragment as Signal, component$, useSignal, useTask$ } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { useAsyncComputed$ } from '../use/use-async-computed';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useAsyncComputed', ({ render }) => {
  it('should resolve promise in computed result', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(({ track }) => Promise.resolve(track(count) * 2));
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'4'}</Signal>
        </button>
      </>
    );
  });

  it('should compute async computed result from async computed result', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(({ track }) => Promise.resolve(track(count) * 2));
      const quadrupleCount = useAsyncComputed$(({ track }) =>
        Promise.resolve(track(doubleCount) * 2)
      );
      return <button onClick$={() => count.value++}>{quadrupleCount.value}</button>;
    });
    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'4'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'8'}</Signal>
        </button>
      </>
    );
  });

  it('should resolve delayed promise in computed result', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(
        ({ track }) =>
          new Promise<number>((resolve) => {
            setTimeout(() => {
              resolve(track(() => count.value * 2));
            });
          })
      );
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { vNode, container } = await render(<Counter />, { debug });

    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'2'}</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>{'4'}</Signal>
        </button>
      </>
    );
  });

  it('should handle error if promise is rejected', async () => {
    (globalThis as any).log = [];
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(() => Promise.reject(new Error('test')));

      useTask$(({ track }) => {
        track(doubleCount);

        (globalThis as any).log.push((doubleCount as any).untrackedError.message);
      });

      return <button onClick$={() => count.value++}>{(doubleCount as any).value}</button>;
    });
    await render(<Counter />, { debug });
    expect((globalThis as any).log).toEqual(['test']);
  });

  it('should handle undefined as promise result', async () => {
    (globalThis as any).log = [];
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(() => Promise.resolve(undefined));

      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { vNode } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal>{''}</Signal>
        </button>
      </>
    );
  });

  describe('loading', () => {
    it('should show loading state', async () => {
      (globalThis as any).delay = () =>
        new Promise<void>((res) => ((globalThis as any).delay.resolve = res));
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsyncComputed$(async ({ track }) => {
          const countValue = track(count);
          if (countValue > 1) {
            await (globalThis as any).delay();
          }
          return countValue * 2;
        });
        return (
          <button onClick$={() => count.value++}>
            {doubleCount.loading ? 'loading' : doubleCount.value}
          </button>
        );
      });
      const { vNode, container } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'2'}</Signal>
          </button>
        </>
      );

      await trigger(container.element, 'button', 'click', {}, { waitForIdle: false });

      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'loading'}</Signal>
          </button>
        </>
      );

      await (globalThis as any).delay.resolve();
      await waitForDrain(container);
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'4'}</Signal>
          </button>
        </>
      );
    });
  });

  describe('error', () => {
    it('should show error state', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsyncComputed$(async ({ track }) => {
          const countValue = track(count);
          if (countValue > 1) {
            throw new Error('test');
          }
          return countValue * 2;
        });
        return (
          <button onClick$={() => count.value++}>
            {doubleCount.error ? 'error' : doubleCount.value}
          </button>
        );
      });
      const { vNode, container } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'2'}</Signal>
          </button>
        </>
      );

      await trigger(container.element, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'error'}</Signal>
          </button>
        </>
      );
    });
  });
});
