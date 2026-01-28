import {
  $,
  Fragment as Signal,
  _jsxSorted,
  _wrapProp,
  component$,
  useSignal,
  useTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { useAsyncComputed$ } from '../use/use-async-computed';
import { delay } from '../shared/utils/promises';

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
    await waitForDrain(container);
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
          <Signal ssr-required>{'6'}</Signal>
        </button>
      </>
    );
  });

  it('should compute async computed result from async computed result', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(({ track }) => {
        return Promise.resolve(track(count) * 2);
      });
      const quadrupleCount = useAsyncComputed$(({ track }) => {
        return Promise.resolve(track(doubleCount) * 2);
      });
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
    await waitForDrain(container);
    await waitForDrain(container);
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
    // TODO: we should solve this in a better way
    await delay(50);
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

  it('should render as attribute', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(({ track }) => Promise.resolve(track(count) * 2));
      return <button data-count={doubleCount.value} onClick$={() => count.value++}></button>;
    });
    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button data-count="2"></button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    expect(vNode).toMatchVDOM(
      <>
        <button data-count="4"></button>
      </>
    );
  });

  it('should render var prop as attribute', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsyncComputed$(({ track }) => Promise.resolve(track(count) * 2));
      return _jsxSorted(
        'button',
        {
          'data-count': _wrapProp(doubleCount, 'value'),
          'on:click': $(() => count.value++),
        },
        null,
        null,
        0,
        null,
        undefined
      );
    });
    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button data-count="2"></button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    await waitForDrain(container);
    expect(vNode).toMatchVDOM(
      <>
        <button data-count="4"></button>
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
      await waitForDrain(container);
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
            <Signal ssr-required>{'loading'}</Signal>
          </button>
        </>
      );

      await (globalThis as any).delay.resolve();
      await waitForDrain(container);
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
      await waitForDrain(container);

      // TODO this probably should not be needed
      await waitForDrain(container);

      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'error'}</Signal>
          </button>
        </>
      );
    });
  });

  describe('promise', () => {
    it('should not rerun if promise is awaited before', async () => {
      (globalThis as any).log = [];
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsyncComputed$(() => Promise.resolve(count.value * 2));

        useTask$(async () => {
          await doubleCount.promise();
          (globalThis as any).log.push('task');
          (globalThis as any).log.push(doubleCount.value);
        });

        return <div></div>;
      });
      await render(<Counter />, { debug });
      expect((globalThis as any).log).toEqual(['task', 2]);

      (globalThis as any).log = undefined;
    });
  });

  describe('cleanup', () => {
    it('should run cleanup on destroy', async () => {
      (globalThis as any).log = [];

      const Child = component$(() => {
        const asyncValue = useAsyncComputed$(({ cleanup }) => {
          cleanup(() => {
            (globalThis as any).log.push('cleanup');
          });
          return Promise.resolve(1);
        });
        return <div>{asyncValue.value}</div>;
      });

      const Counter = component$(() => {
        const toggle = useSignal(true);

        return (
          <>
            <button onClick$={() => (toggle.value = !toggle.value)}></button>
            {toggle.value && <Child />}
          </>
        );
      });
      const { container } = await render(<Counter />, { debug });
      // on server its called after render
      // on client it is not called yet
      expect((globalThis as any).log).toEqual(render === ssrRenderToDom ? ['cleanup'] : []);
      await trigger(container.element, 'button', 'click');
      // on server after resuming cleanup is not called yet
      // on client it is called as usual
      expect((globalThis as any).log).toEqual(
        render === ssrRenderToDom ? ['cleanup'] : ['cleanup']
      );
      await trigger(container.element, 'button', 'click'); //show
      await trigger(container.element, 'button', 'click'); //hide
      // on server and client cleanup called again
      expect((globalThis as any).log).toEqual(['cleanup', 'cleanup']);
    });

    it('should run cleanup on re-compute', async () => {
      (globalThis as any).log = [];

      const Counter = component$(() => {
        const count = useSignal(1);
        const asyncValue = useAsyncComputed$(({ track, cleanup }) => {
          const current = track(count);
          cleanup(() => {
            (globalThis as any).log.push('cleanup');
          });
          return Promise.resolve(current * 2);
        });
        return <button onClick$={() => count.value++}>{asyncValue.value}</button>;
      });
      const { container } = await render(<Counter />, { debug });
      expect((globalThis as any).log).toEqual(render === ssrRenderToDom ? ['cleanup'] : []);

      await trigger(container.element, 'button', 'click');
      expect((globalThis as any).log).toEqual(['cleanup']);

      await trigger(container.element, 'button', 'click');
      expect((globalThis as any).log).toEqual(['cleanup', 'cleanup']);
    });
  });
});
