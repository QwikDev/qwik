import {
  $,
  Fragment as Signal,
  Slot,
  _jsxSorted,
  _wrapProp,
  component$,
  useAsync$,
  useConstant,
  useErrorBoundary,
  useSignal,
  useTask$,
  useVisibleTask$,
  type AsyncSignal,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import type { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
import { NEEDS_COMPUTATION } from '../reactive-primitives/types';
import { delay } from '../shared/utils/promises';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useAsync', ({ render }) => {
  it('should resolve promise in computed result', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsync$(({ track }) => Promise.resolve(track(count) * 2));
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
      const doubleCount = useAsync$(({ track }) => {
        return Promise.resolve(track(count) * 2);
      });
      const quadrupleCount = useAsync$(({ track }) => {
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

    // TODO this should not be needed
    await waitForDrain(container);
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
      const doubleCount = useAsync$(
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

  it('should throw error on value if promise is rejected', async () => {
    (globalThis as any).log = [];
    const ErrorBoundary = component$(() => {
      const store = useErrorBoundary();
      (globalThis as any).log.push(`rendering error boundary, ${store.error || 'no error'}`);
      return store.error ? <div>{JSON.stringify(store.error)}</div> : <Slot />;
    });
    const Counter = component$(() => {
      (globalThis as any).log.push('rendering counter');
      const doubleCount = useAsync$(() => Promise.reject(new Error('test')));
      return <div>{doubleCount.value}</div>;
    });
    let threw = false;
    try {
      await render(
        <ErrorBoundary>
          <Counter />,
        </ErrorBoundary>,
        { debug }
      );
    } catch (e) {
      threw = true;
    }
    if (render === ssrRenderToDom) {
      expect((globalThis as any).log).toEqual([
        'rendering error boundary, no error',
        'rendering counter',
      ]);
      expect(threw).toBe(true);
    } else {
      expect((globalThis as any).log).toEqual([
        'rendering error boundary, no error',
        'rendering counter',
        'rendering error boundary, Error: test',
      ]);
      expect(threw).toBe(false);
    }
  });

  it('should handle undefined as promise result', async () => {
    (globalThis as any).log = [];
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsync$(() => Promise.resolve(undefined));

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
      const doubleCount = useAsync$(({ track }) => Promise.resolve(track(count) * 2));
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
      const doubleCount = useAsync$(({ track }) => Promise.resolve(track(count) * 2));
      return _jsxSorted(
        'button',
        {
          'data-count': _wrapProp(doubleCount, 'value'),
          'q-e:click': $(() => count.value++),
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
        const doubleCount = useAsync$(async ({ track }) => {
          const countValue = track(count);
          if (countValue === 2) {
            await (globalThis as any).delay();
          } else {
            await delay(10);
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
      if (render === ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <>
            <button>
              <Signal ssr-required>{'2'}</Signal>
            </button>
          </>
        );
      } else {
        expect(vNode).toMatchVDOM(
          <>
            <button>
              <Signal ssr-required>{'loading'}</Signal>
            </button>
          </>
        );
        await delay(20);
        expect(vNode).toMatchVDOM(
          <>
            <button>
              <Signal ssr-required>{'2'}</Signal>
            </button>
          </>
        );
      }

      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>
            <Signal ssr-required>{'loading'}</Signal>
          </button>
        </>
      );

      (globalThis as any).delay.resolve();
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
    it('should not show initial value after SSR', async () => {
      const ref = {} as { s: AsyncSignal<number> };
      const Cmp = component$(() => {
        const asyncValue = useAsync$(async () => 42, { initial: 10 });
        ref.s = asyncValue;
        return <div>{asyncValue.value}</div>;
      });
      const { vNode } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <Signal>{'42'}</Signal>
          </div>
        </>
      );
    });
  });

  describe('error', () => {
    it('should show error state', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsync$(async ({ track }) => {
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
        const doubleCount = useAsync$(() => Promise.resolve(count.value * 2));

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

  describe('clientOnly', () => {
    it('should skip computation on SSR and eagerly compute on client (with subscribers)', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const asyncValue = useAsync$(async ({ track }) => track(count) * 2, {
          clientOnly: true,
          initial: 0,
        });
        return (
          <div>
            {asyncValue.loading ? (
              <div id="loading">loading...</div>
            ) : (
              <div id="value">{asyncValue.value}</div>
            )}
            <button onClick$={() => count.value++}></button>
          </div>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
      if (render === ssrRenderToDom) {
        // On SSR with clientOnly: true, should NOT compute during SSR
        // The signal should stay loading (because computation was skipped)
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <div id="loading">loading...</div>
              <button></button>
            </div>
          </>
        );

        await trigger(container.element, null, 'd:qidle');
        await waitForDrain(container);
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <div id="value">
                <Signal ssr-required>{'2'}</Signal>
              </div>
              <button></button>
            </div>
          </>
        );
      } else {
        // On pure DOM render, clientOnly doesn't prevent computation
        // Should compute immediately and show value
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <div id="value">
                <Signal ssr-required>{'2'}</Signal>
              </div>
              <button></button>
            </div>
          </>
        );
      }
    });

    it('should be loading on resume)', async () => {
      const Counter = component$(() => {
        const asyncValue = useAsync$(async ({ previous }) => 6, {
          clientOnly: true,
          initial: 0,
        }) as AsyncSignalImpl<number>;
        useVisibleTask$(
          () => {
            (globalThis as any).loading = asyncValue.$untrackedLoading$;
            (globalThis as any).value = asyncValue.$untrackedValue$;
          },
          // This fires before the document:onQIdle where clientOnly signals are resumed
          { strategy: 'document-ready' }
        );
        return (
          <div>
            {asyncValue.loading ? `loading... ${asyncValue.$untrackedValue$}` : asyncValue.value}
          </div>
        );
      });

      const { vNode, container } = await render(<Counter />, {
        debug,
      });
      if (render === ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <div>
            <Signal ssr-required>{'loading... 0'}</Signal>
          </div>
        );
        await trigger(container.element, null, 'd:qinit');
        // We don't serialize value if the signal is invalid
        expect((globalThis as any).value).toBe(NEEDS_COMPUTATION);
        expect((globalThis as any).loading).toBe(true);
        await trigger(container.element, null, 'd:qidle');
        await waitForDrain(container);
        expect(vNode).toMatchVDOM(
          <div>
            <Signal ssr-required>{'6'}</Signal>
          </div>
        );
      } else {
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <Signal ssr-required>{'6'}</Signal>
            </div>
          </>
        );
      }
    });

    it('should NOT compute clientOnly signals without subscribers', async () => {
      // Track which signals computed
      (globalThis as any).__asyncComputations__ = {
        unused: false,
        used: false,
      };

      const Counter = component$(() => {
        const count = useSignal(1);
        // Not used on purpose
        useAsync$(
          ({ track }) => {
            (globalThis as any).__asyncComputations__.unused = true;
            const current = track(count);
            return Promise.resolve(current * 2);
          },
          { clientOnly: true, initial: 0 }
        );
        const asyncValue = useAsync$(
          ({ track }) => {
            (globalThis as any).__asyncComputations__.used = true;
            const current = track(count);
            return Promise.resolve(current * 3);
          },
          { clientOnly: true, initial: 0 }
        );
        return (
          <div>
            {asyncValue.loading ? (
              <div id="loading">loading...</div>
            ) : (
              <div id="value">{asyncValue.value}</div>
            )}
            <button onClick$={() => count.value++}></button>
          </div>
        );
      });

      const { vNode } = await render(<Counter />, { debug });

      if (render === ssrRenderToDom) {
        // On SSR, both signals should be skipped
        expect((globalThis as any).__asyncComputations__.unused).toBe(false);
        expect((globalThis as any).__asyncComputations__.used).toBe(false);
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <div id="loading">loading...</div>
              <button></button>
            </div>
          </>
        );
      } else {
        // On client, only the used signal should compute
        await delay(10);
        // Verify unused signal was NOT computed
        expect((globalThis as any).__asyncComputations__.unused).toBe(false);
        // Verify used signal WAS computed
        expect((globalThis as any).__asyncComputations__.used).toBe(true);
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <div id="value">
                <Signal ssr-required>{'3'}</Signal>
              </div>
              <button></button>
            </div>
          </>
        );
      }
    });

    it('should throw when reading .value from clientOnly signal without initial value during SSR', async () => {
      const Counter = component$(() => {
        const asyncValue = useAsync$(async () => 42, {
          clientOnly: true,
          // No initial value provided
        });
        return <div>{asyncValue.value}</div>;
      });

      if (render === ssrRenderToDom) {
        // During SSR, accessing .value on a clientOnly signal without initial value should throw
        let threwError = false;
        let errorMessage = '';
        try {
          await render(<Counter />, { debug });
        } catch (e) {
          threwError = true;
          errorMessage = (e as Error).message;
        }

        expect(threwError).toBe(true);
        expect(errorMessage).toContain('cannot read .value from clientOnly async signal');
      } else {
        // During client render, clientOnly signals compute eagerly, so it should work
        // (or at least not throw with the "cannot read" error)
        const { vNode } = await render(<Counter />, { debug });
        // Should render successfully with the computed value
        expect(vNode).toBeDefined();
      }
    });
  });

  describe('cleanup', () => {
    it('should run cleanup on destroy', async () => {
      (globalThis as any).log = [];

      const Child = component$(() => {
        const asyncValue = useAsync$(async ({ cleanup }) => {
          cleanup(() => {
            (globalThis as any).log.push('cleanup');
          });
          return 1;
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
      // so from this point the log is equal for ssr and client
      expect((globalThis as any).log).toEqual(['cleanup']);
      await trigger(container.element, 'button', 'click'); //show
      await trigger(container.element, 'button', 'click'); //hide
      // on server and client cleanup called again
      expect((globalThis as any).log).toEqual(['cleanup', 'cleanup']);
    });

    it('should run cleanup on re-compute', async () => {
      (globalThis as any).log = [];

      const Counter = component$(() => {
        const count = useSignal(1);
        const asyncValue = useAsync$(({ track, cleanup }) => {
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

    it('should resume polling AsyncSignal with d:qidle on SSR', async () => {
      // This test verifies that polling AsyncSignals are tracked during serialization
      // and a d:qidle event is added to resume polling on document idle
      const Counter = component$(() => {
        const start = useConstant(Date.now);
        const elapsed = useAsync$(async () => Date.now() - start, { interval: 50 });
        return (
          <div>
            <div id="elapsed">{elapsed.value}</div>
            <button
              onClick$={() => {
                elapsed.interval = elapsed.interval ? 0 : 50;
              }}
            >
              Toggle updates
            </button>
          </div>
        );
      });

      const { container } = await render(<Counter />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(container.element, null, 'd:qidle');
      }
      const elapsedBefore = Number(container.element.querySelector('#elapsed')!.textContent);
      await delay(100);
      const elapsedAfter = Number(container.element.querySelector('#elapsed')!.textContent);
      expect(elapsedAfter).toBeGreaterThan(elapsedBefore);

      await trigger(container.element, 'button', 'click'); // disable polling
      const elapsedWhenStopped = Number(container.element.querySelector('#elapsed')!.textContent);
      await delay(100);
      const elapsedAfterStop = Number(container.element.querySelector('#elapsed')!.textContent);
      expect(elapsedAfterStop).toEqual(elapsedWhenStopped);
    });
  });
});
