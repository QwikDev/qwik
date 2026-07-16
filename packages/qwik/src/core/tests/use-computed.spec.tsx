import { $ } from '@qwik.dev/core';
import {
  Fragment as Component,
  Fragment,
  Fragment as Signal,
  Slot,
  _captures,
  _jsxSorted,
  _wrapProp,
  component$,
  createComputed$,
  createSignal,
  noSerialize,
  qrl,
  untrack,
  useComputed$,
  useComputedQrl,
  useConstant,
  useErrorBoundary,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type ComputedSignal,
} from '@qwik.dev/core/internal';
import { domRender, ssrRenderToDom, trigger, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import type { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { getSubscriber } from '../reactive-primitives/subscriber';
import { EffectProperty, NEEDS_COMPUTATION } from '../reactive-primitives/types';
import { delay } from '../shared/utils/promises';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useComputed', ({ render }) => {
  const isSsr = render === ssrRenderToDom;

  it('should compute signals synchronously', async () => {
    const Counter = component$(() => {
      const count = useSignal(123);
      const doubleCount = useComputedQrl<number>(
        qrl(
          // pretend to be an async import
          () =>
            Promise.resolve({
              lazy: () => {
                const [count] = _captures as any;
                return count.value * 2;
              },
            }),
          'lazy',
          [count]
        )
      );
      return <span>{doubleCount.value}</span>;
    });

    const { vNode } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <span>
          <Signal>{'246'}</Signal>
        </span>
      </>
    );
  });
  it('should render correctly with falsy value', async () => {
    const Cmp = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      const doubleCount = useComputed$(() => count.value * 2);
      return (
        <div>
          Double count: {doubleCount.value}! {count.value}
        </div>
      );
    });
    const { vNode } = await render(<Cmp initial={0} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <div>
          Double count: <Signal>{'0'}</Signal>! <Signal>{'0'}</Signal>
        </div>
      </>
    );
  });
  it('should update value based on signal', async () => {
    const DoubleCounter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      const doubleCount = useComputed$(() => count.value * 2);
      return (
        <button onClick$={() => count.value++} id={count.value.toString()}>
          Double count: {doubleCount.value}! {count.value}
        </button>
      );
    });

    const { vNode, container } = await render(<DoubleCounter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button id="123">
          Double count: <Signal ssr-required>{'246'}</Signal>! <Signal ssr-required>{'123'}</Signal>
        </button>
      </>
    );
    expect(container.document.querySelector('button[id=123]')).toBeTruthy();
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button id="124">
          Double count: <Signal ssr-required>{'248'}</Signal>! <Signal ssr-required>{'124'}</Signal>
        </button>
      </>
    );
    expect(container.document.querySelector('button[id=124]')).toBeTruthy();
  });

  it('should update value based on another computed', async () => {
    const QuadrupleCounter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      const doubleCount = useComputed$(() => count.value * 2);
      const quadrupleCount = useComputed$(() => doubleCount.value * 2);
      return <button onClick$={() => count.value++}>Double count: {quadrupleCount.value}!</button>;
    });

    const { vNode, container } = await render(<QuadrupleCounter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal ssr-required>{'492'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    // TODO figure out why this requires waitForDrain
    // computed signals should cause the cursor to pause
    await waitForDrain(container);
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal ssr-required>{'496'}</Signal>!
        </button>
      </>
    );
  });

  it('should not rerun if there are no signal dependencies', async () => {
    (globalThis as any).runCount = 0;
    const DoubleCounter = component$((props: { initial: number }) => {
      const obj = { count: props.initial };
      const doubleCount = useComputed$(() => {
        (globalThis as any).runCount++;
        return obj.count * 2;
      });
      return <button onClick$={() => obj.count++}>Double count: {doubleCount.value}!</button>;
    });

    const { vNode, container } = await render(<DoubleCounter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal>{'246'}</Signal>!
        </button>
      </>
    );
    expect((globalThis as any).runCount).toBe(1);
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal>{'246'}</Signal>!
        </button>
      </>
    );
    expect((globalThis as any).runCount).toBe(1);
  });

  it('should not rerun if value did not change', async () => {
    (globalThis as any).runCount = 0;
    const DoubleCounter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useComputed$(() => {
        (globalThis as any).runCount++;
        return count.value * 2;
      });
      return <button onClick$={() => (count.value = 1)}>Double count: {doubleCount.value}!</button>;
    });

    const { vNode, container } = await render(<DoubleCounter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal ssr-required>{'2'}</Signal>!
        </button>
      </>
    );
    expect((globalThis as any).runCount).toBe(1);
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal ssr-required>{'2'}</Signal>!
        </button>
      </>
    );
    expect((globalThis as any).runCount).toBe(1);
  });

  it('should allow return signal inside computed', async () => {
    const Counter = component$(() => {
      const foo = useSignal(1);
      const count = useComputed$(() => foo);
      return <button onClick$={() => count.value.value++}>Count: {count.value.value}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'1'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'2'}</Signal>!
        </button>
      </>
    );
  });

  it('should support async computed functions', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useComputed$(() => Promise.resolve(count.value * 2));
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { vNode, document } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>2</Signal>
        </button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>4</Signal>
        </button>
      </Component>
    );
  });

  it('should track dependencies read after an await via track() in async computed', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useComputed$(async ({ track }) => {
        await Promise.resolve();
        // the tracking context is lost after the first await: reads must use track()
        return track(count) * 2;
      });
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { vNode, document } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>2</Signal>
        </button>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Signal ssr-required>4</Signal>
        </button>
      </Component>
    );
  });

  it('should track when recomputing computed signal', async () => {
    const Cmp = component$(() => {
      const boolean1 = useSignal(true);
      const boolean2 = useSignal(true);
      const computed = useComputed$(() => {
        return boolean1.value || boolean2.value;
      });

      return (
        <div>
          {`${boolean1.value}`}
          {`${boolean2.value}`}
          {`${computed.value}`}
          <button id="toggle-boolean1" onClick$={() => (boolean1.value = !boolean1.value)}></button>
          <button id="toggle-boolean2" onClick$={() => (boolean2.value = !boolean2.value)}></button>
        </div>
      );
    });
    const { vNode, container } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Signal ssr-required>{'true'}</Signal>
          <Signal ssr-required>{'true'}</Signal>
          <Signal ssr-required>{'true'}</Signal>
          <button id="toggle-boolean1"></button>
          <button id="toggle-boolean2"></button>
        </div>
      </Component>
    );
    await trigger(container.element, 'button[id="toggle-boolean1"]', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Signal ssr-required>{'false'}</Signal>
          <Signal ssr-required>{'true'}</Signal>
          <Signal ssr-required>{'true'}</Signal>
          <button id="toggle-boolean1"></button>
          <button id="toggle-boolean2"></button>
        </div>
      </Component>
    );
    await trigger(container.element, 'button[id="toggle-boolean2"]', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <Signal ssr-required>{'false'}</Signal>
          <Signal ssr-required>{'false'}</Signal>
          <Signal ssr-required>{'false'}</Signal>
          <button id="toggle-boolean1"></button>
          <button id="toggle-boolean2"></button>
        </div>
      </Component>
    );
  });

  describe('async', () => {
    it('should compute async computed result from async computed result', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useComputed$(({ track }) => {
          return Promise.resolve(track(count) * 2);
        });
        const quadrupleCount = useComputed$(({ track }) => {
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
        const doubleCount = useComputed$(
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
        const doubleCount = useComputed$(() => Promise.reject(new Error('test')));
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
        const doubleCount = useComputed$(() => Promise.resolve(undefined));

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
        const doubleCount = useComputed$(({ track }) => Promise.resolve(track(count) * 2));
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
        const doubleCount = useComputed$(({ track }) => Promise.resolve(track(count) * 2));
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
  });

  describe('pending', () => {
    it('should show pending state', async () => {
      (globalThis as any).delay = () =>
        new Promise<void>((res) => ((globalThis as any).delay.resolve = res));
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useComputed$(async ({ track }) => {
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
            {doubleCount.pending ? 'loading' : doubleCount.value}
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
      const Cmp = component$(() => {
        const asyncValue = useComputed$(async () => 42, { initial: 10 });
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
        const doubleCount = useComputed$(async ({ track }) => {
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
        const doubleCount = useComputed$(() => Promise.resolve(count.value * 2));

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
        const asyncValue = useComputed$(async ({ track }) => track(count) * 2, {
          clientOnly: true,
          initial: 0,
        });
        return (
          <div>
            {asyncValue.pending ? (
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
        // The signal should stay pending (because computation was skipped)
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

    it('should be pending on resume', async () => {
      const Counter = component$(() => {
        const asyncValue = useComputed$(async () => 6, {
          clientOnly: true,
          initial: 0,
        }) as any as ComputedSignalImpl<number>;
        useVisibleTask$(
          () => {
            (globalThis as any).loading = asyncValue.$untrackedPending$;
            (globalThis as any).value = asyncValue.$untrackedValue$;
          },
          // This fires before the document:onQIdle where clientOnly signals are resumed
          { strategy: 'document-ready' }
        );
        return (
          <div>
            {asyncValue.pending ? `loading... ${asyncValue.$untrackedValue$}` : asyncValue.value}
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
        useComputed$(
          ({ track }) => {
            (globalThis as any).__asyncComputations__.unused = true;
            const current = track(count);
            return Promise.resolve(current * 2);
          },
          { clientOnly: true, initial: 0 }
        );
        const asyncValue = useComputed$(
          ({ track }) => {
            (globalThis as any).__asyncComputations__.used = true;
            const current = track(count);
            return Promise.resolve(current * 3);
          },
          { clientOnly: true, initial: 0 }
        );
        return (
          <div>
            {asyncValue.pending ? (
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

    it('should resume clientOnly signals subscribed only via task .pending', async () => {
      (globalThis as any).log = [];
      const Counter = component$(() => {
        const result = useSignal('no');
        const asyncValue = useComputed$(
          async () => {
            (globalThis as any).log.push('compute');
            return 'yes';
          },
          { clientOnly: true }
        );
        useTask$(({ track }) => {
          track(() => asyncValue.pending);
          if (asyncValue.pending) {
            return;
          }
          result.value = asyncValue.value;
        });
        return <div>{result.value}</div>;
      });

      const { container } = await render(<Counter />, { debug });
      const renderedText = () => container.document.querySelector('div')!.textContent;
      if (render === ssrRenderToDom) {
        expect((globalThis as any).log).toEqual([]);
        expect(renderedText()).toBe('no');
        await trigger(container.element, null, 'd:qidle');
        await waitForDrain(container);
      } else {
        await delay(10);
        await waitForDrain(container);
      }
      expect((globalThis as any).log).toEqual(['compute']);
      expect(renderedText()).toBe('yes');
      (globalThis as any).log = undefined;
    });

    it('should throw when reading .value from clientOnly signal without initial value during SSR', async () => {
      const Counter = component$(() => {
        const asyncValue = useComputed$(async () => 42, {
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
        expect(errorMessage).toContain('Cannot read .value of a clientOnly async signal');
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
        const asyncValue = useComputed$(async ({ cleanup }) => {
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
        const asyncValue = useComputed$(({ track, cleanup }) => {
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

    it('should resume polling computed with d:qidle on SSR', async () => {
      // This test verifies that polling computeds are tracked during serialization
      // and a d:qidle event is added to resume polling on document idle
      const Counter = component$(() => {
        const start = useConstant(Date.now);
        const elapsed = useComputed$(async () => Date.now() - start, { expires: 50 });
        return (
          <div>
            <div id="elapsed">{elapsed.value}</div>
            <button
              onClick$={() => {
                (elapsed as ComputedSignal<number>).expires = elapsed.expires ? 0 : 50;
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

  describe('createComputed$', () => {
    it('can be created anywhere', async () => {
      const count = createSignal(1);
      const doubleCount = createComputed$(() => count.value * 2);

      const Counter = component$(() => {
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
  });

  describe('regression', () => {
    it('#4979 - should work with inner computed', async () => {
      const InnerComponent = component$((props: { value: number }) => {
        const foo = useComputed$(() => props.value);
        return <div>{JSON.stringify(foo.value)}</div>;
      });

      const OuterComponent = component$(() => {
        const count = useSignal(123);
        return (
          <>
            <button onClick$={() => (count.value += 1)}>Next</button>
            {[count.value].map((o) => (
              <InnerComponent key={o} value={o} />
            ))}
          </>
        );
      });

      const { vNode } = await render(<OuterComponent />, { debug });
      expect(vNode).toMatchVDOM(
        <Fragment ssr-required>
          <Fragment ssr-required>
            <button>Next</button>
            <Fragment ssr-required>
              <div>{'123'}</div>
            </Fragment>
          </Fragment>
        </Fragment>
      );
    });

    it('#3294 - should lazily evaluate the function with useSignal', async () => {
      (globalThis as any).useComputedCount = 0;
      const Issue3294 = component$(() => {
        const firstName = useSignal('Misko');
        const lastName = useSignal('Hevery');
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputed$(() => {
          (globalThis as any).useComputedCount++;
          return lastName.value + ' ' + firstName.value;
        });
        const secondUseComputed = useComputed$(() => {
          (globalThis as any).useComputedCount++;
          return firstName.value + ' ' + lastName.value;
        });
        return (
          <div>
            {execFirstUseComputed.value ? (
              <span>{firstUseComputed.value}</span>
            ) : (
              <span>{secondUseComputed.value}</span>
            )}
          </div>
        );
      });

      const { vNode } = await render(<Issue3294 />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <span>
              <Signal>Hevery Misko</Signal>
            </span>
          </div>
        </>
      );
      expect((globalThis as any).useComputedCount).toBe(1);
    });

    it('#3294 - should lazily evaluate the function with store', async () => {
      (globalThis as any).useComputedCount = 0;
      const Issue3294 = component$(() => {
        const store = useStore({ firstName: 'Misko', lastName: 'Hevery' });
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputed$(() => {
          (globalThis as any).useComputedCount++;
          return store.lastName + ' ' + store.firstName;
        });
        const secondUseComputed = useComputed$(() => {
          (globalThis as any).useComputedCount++;
          return store.firstName + ' ' + store.lastName;
        });
        return (
          <div>
            {execFirstUseComputed.value ? (
              <span>{firstUseComputed.value}</span>
            ) : (
              <span>{secondUseComputed.value}</span>
            )}
          </div>
        );
      });

      const { vNode } = await render(<Issue3294 />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <span>
              <Signal>Hevery Misko</Signal>
            </span>
          </div>
        </>
      );
      expect((globalThis as any).useComputedCount).toBe(1);
    });

    it('#4918 - should not trigger track fn if value is not changed', async () => {
      (globalThis as any).logCount = 0;
      const Issue4918 = component$(() => {
        const countRef = useSignal(0);
        const isGreetOneRef = useComputed$(() => {
          return countRef.value > 1;
        });
        useTask$(({ track }) => {
          track(isGreetOneRef);
          (globalThis as any).logCount++;
        });
        return (
          <div>
            <button onClick$={() => (countRef.value = countRef.value + 1)}>incr</button>
          </div>
        );
      });

      const { document } = await render(<Issue4918 />, { debug });
      expect((globalThis as any).logCount).toBe(1);

      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).logCount).toBe(1);
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).logCount).toBe(2);
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).logCount).toBe(2);
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).logCount).toBe(2);
    });
  });

  it('should mark noSerialize as invalid after deserialization', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const runCount = useSignal(0);
      const showCount = useSignal(false);
      const doubleCount = useComputed$(() => {
        untrack(() => runCount.value++);
        return noSerialize({ double: count.value * 2 });
      });
      return (
        <div>
          Double count: {doubleCount.value?.double}
          <button onClick$={() => (showCount.value = !showCount.value)}>
            {showCount.value ? 'hide' : 'show'}
          </button>
          {showCount.value ? <span>{doubleCount.value?.double}</span> : '-'}
          <div>Ran {runCount.value} times.</div>
        </div>
      );
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Fragment ssr-required>
        <div>
          Double count: <Signal ssr-required>{'2'}</Signal>
          <button>
            <Signal ssr-required>show</Signal>
          </button>
          -
          <div>
            Ran <Signal ssr-required>{'1'}</Signal> times.
          </div>
        </div>
      </Fragment>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <div>
          Double count: <Signal>{'2'}</Signal>
          <button>
            <Signal>hide</Signal>
          </button>
          <span>
            <Signal>{'2'}</Signal>
          </span>
          <div>
            Ran <Signal>{isSsr ? '2' : '1'}</Signal> times.
          </div>
        </div>
      </>,
      true
    );
  });

  it('should clear backRef before computation when reusing effect subscriber', async () => {
    (globalThis as any).doubleCount = null;
    const Counter = component$((props: { count: number }) => {
      const doubleCount = useComputed$(() => {
        return props.count * 2;
      });
      (globalThis as any).doubleCount = doubleCount;
      return (
        <div>
          <span>{doubleCount.value}</span>
        </div>
      );
    });
    const Parent = component$(() => {
      const count = useSignal([{ value: 1 }]);
      return (
        <div>
          <button onClick$={() => (count.value = [{ value: count.value[0].value + 1 }])}>
            Increment
          </button>
          {count.value.map((c, index) => (
            <Counter key={index} count={c.value} />
          ))}
        </div>
      );
    });

    const { container } = await render(<Parent />, { debug });
    const effectSubscriber = getSubscriber((globalThis as any).doubleCount, EffectProperty.VNODE);
    expect(effectSubscriber.backRef).toBeDefined();
    expect(effectSubscriber.backRef?.size).toBe(1);

    await trigger(container.element, 'button', 'click');
    expect(effectSubscriber.backRef).toBeDefined();
    expect(effectSubscriber.backRef?.size).toBe(1);

    await trigger(container.element, 'button', 'click');
    expect(effectSubscriber.backRef).toBeDefined();
    expect(effectSubscriber.backRef?.size).toBe(1);
  });
});
