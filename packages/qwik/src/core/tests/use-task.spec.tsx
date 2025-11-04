import {
  Fragment as Component,
  Fragment,
  Fragment as Signal,
  Fragment as Awaited,
  Slot,
  component$,
  isServer,
  useSignal,
  useStore,
  useTask$,
  type Signal as SignalType,
} from '@qwik.dev/core';
import { domRender, getTestPlatform, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useTask', ({ render }) => {
  it('should execute task', async () => {
    const Counter = component$(() => {
      const count = useSignal('wrong');
      useTask$(() => {
        count.value = 'WORKS';
      });
      return <span>{count.value}</span>;
    });

    const { vNode } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <span>
          <Signal>WORKS</Signal>
        </span>
      </Component>
    );
  });
  it('should execute async task', async () => {
    const log: string[] = [];
    const Counter = component$(() => {
      log.push('Counter');
      const count = useSignal('wrong');
      useTask$(async () => {
        log.push('task');
        await delay(10);
        log.push('resolved');
        count.value = 'WORKS';
      });
      log.push('render');
      return <span>{count.value}</span>;
    });

    const { vNode } = await render(<Counter />, { debug });
    expect(log).toEqual(['Counter', 'task', 'resolved', 'Counter', 'render']);
    expect(vNode).toMatchVDOM(
      <Component>
        <span>
          <Signal>WORKS</Signal>
        </span>
      </Component>
    );
  });
  it('should handle exceptions', async () => {
    const error = new Error('HANDLE ME');
    const ThrowError = component$(() => {
      useTask$(() => {
        throw error;
      });
      return <span>OK</span>;
    });
    try {
      await render(
        <ErrorProvider>
          <ThrowError />
        </ErrorProvider>,
        { debug }
      );
      expect(render).toBe(domRender);
      expect(ErrorProvider.error).toBe(error);
    } catch (e) {
      expect(render).toBe(ssrRenderToDom);
      expect(e).toBe(error);
    }
  });
  it('should handle async exceptions', async () => {
    const error = new Error('HANDLE ME');
    const ThrowError = component$(() => {
      useTask$(async () => {
        await delay(1);
        throw error;
      });
      return <span>OK</span>;
    });
    try {
      await render(
        <ErrorProvider>
          <ThrowError />
        </ErrorProvider>,
        { debug }
      );
      expect(render).toBe(domRender);
      expect(ErrorProvider.error).toBe(error);
    } catch (e) {
      expect(render).toBe(ssrRenderToDom);
      expect(e).toBe(error);
    }
  });
  it('should not run next task until previous async task is finished', async () => {
    const log: string[] = [];
    const Counter = component$(() => {
      log.push('Counter');
      const count = useSignal('');
      useTask$(async () => {
        log.push('1:task');
        await delay(10);
        log.push('1:resolved');
        count.value += 'A';
      });
      useTask$(async () => {
        log.push('2:task');
        await delay(10);
        log.push('2:resolved');
        count.value += 'B';
      });
      log.push('render');
      return <span>{count.value}</span>;
    });

    const { vNode } = await render(<Counter />, { debug });
    expect(log).toEqual([
      'Counter',
      '1:task',
      '1:resolved',
      'Counter',
      '2:task',
      '2:resolved',
      'Counter', //
      'render',
    ]);
    expect(vNode).toMatchVDOM(
      <Component>
        <span>
          <Signal>AB</Signal>
        </span>
      </Component>
    );
  });
  describe('track', () => {
    it('should rerun on track', async () => {
      const Counter = component$(() => {
        const count = useSignal(10);
        const double = useSignal(0);
        useTask$(({ track }) => {
          double.value = 2 * track(() => count.value);
        });
        return (
          <button
            onClick$={() => {
              count.value++;
            }}
          >
            {double.value}
          </button>
        );
      });

      const { vNode, document } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>20</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>22</Signal>
          </button>
        </Component>
      );
      await getTestPlatform().flush();
    });
    it('should rerun on track derived signal', async () => {
      const Counter = component$(() => {
        const countRaw = useStore({ count: 10 });
        const count = new WrappedSignalImpl(
          null,
          (o: any, prop: string) => o[prop],
          [countRaw, 'count'],
          null
        );
        const double = useSignal(0);
        useTask$(({ track }) => {
          double.value = 2 * track(() => count.value);
        });
        return <button onClick$={() => countRaw.count++}>{double.value}</button>;
      });

      const { vNode, document } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>20</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>22</Signal>
          </button>
        </Component>
      );
      await getTestPlatform().flush();
    });
    it('should track store property', async () => {
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useTask$(({ track }) => {
          const count = track(store, 'count');
          store.double = 2 * count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
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
    it('should track store', async () => {
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useTask$(({ track }) => {
          const storeCounter = track(store);
          store.double = 2 * storeCounter.count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
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

    it('should unsubscribe from removed component', async () => {
      (global as any).logs = [] as string[];

      const ToggleChild = component$((props: { name: string; count: number }) => {
        useTask$(({ track }) => {
          const count = track(() => props.count);
          const logText = `Child of "${props.name}" (${count})`;
          (global as any).logs.push(logText);
        });

        return (
          <div>
            <h1>Toggle {props.name}</h1>
          </div>
        );
      });

      const Toggle = component$(() => {
        const store = useStore({
          count: 0,
          cond: false,
        });
        return (
          <div>
            <button id="increment" type="button" onClick$={() => store.count++}>
              Root increment
            </button>
            <div>
              {!store.cond ? (
                <ToggleChild name="A" count={store.count} />
              ) : (
                <ToggleChild name="B" count={store.count} />
              )}
              <button type="button" id="toggle" onClick$={() => (store.cond = !store.cond)}>
                Toggle
              </button>
            </div>
          </div>
        );
      });

      const { document } = await render(<Toggle />, { debug });

      await trigger(document.body, '#increment', 'click');
      await trigger(document.body, '#toggle', 'click');
      await trigger(document.body, '#increment', 'click');
      await trigger(document.body, '#toggle', 'click');

      expect((global as any).logs).toEqual([
        'Child of "A" (0)', // init
        'Child of "A" (1)', // increment
        'Child of "B" (1)', // toggle
        'Child of "B" (2)', // increment
        'Child of "A" (2)', // toggle
      ]);
    });

    it('should not rerun on track if the value is not a signal', async () => {
      (globalThis as any).counter = 0;
      const OtpBase = component$((props: any) => {
        useTask$(({ track }) => {
          track(() => props.disabled);
          (globalThis as any).counter++;
        });

        return (
          <div>
            <Slot />
          </div>
        );
      });

      const Cmp = component$(() => {
        const isDisabled = useSignal(false);

        const OtpRoot = (props: any) => {
          return <OtpBase {...props}>{props.children}</OtpBase>;
        };
        return (
          <>
            <OtpRoot disabled={isDisabled.value} />

            <button type="button" onClick$={() => (isDisabled.value = !isDisabled.value)}>
              Disable OTP
            </button>
          </>
        );
      });

      const { document } = await render(<Cmp />, { debug });
      await trigger(document.body, 'button', 'click');
      await trigger(document.body, 'button', 'click');
      await trigger(document.body, 'button', 'click');
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).counter).toBe(5);
      (globalThis as any).counter = undefined;
    });
  });
  describe('queue', () => {
    it('should execute dependant tasks', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0, quadruple: 0 });
        // Quadruple runs first, but will run again after double is updated
        useTask$(({ track }) => {
          (globalThis as any).log.push('quadruple');
          const trackingValue = track(store, 'double') * 2;
          store.quadruple = trackingValue;
        });
        useTask$(({ track }) => {
          (globalThis as any).log.push('double');
          store.double = track(store, 'count') * 2;
        });
        (globalThis as any).log.push('Counter');
        return (
          <button onClick$={() => store.count++}>
            {store.count + '/' + store.double + '/' + store.quadruple}
          </button>
        );
      });

      const { vNode, document } = await render(<Counter />, { debug });
      expect((globalThis as any).log).toEqual(['quadruple', 'double', 'Counter', 'quadruple']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>1/2/4</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, 'button', 'click');
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(['double', 'quadruple']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>2/4/8</Signal>
          </button>
        </Component>
      );
    });
  });
  describe('cleanup', () => {
    it('should execute cleanup task rerun on track', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const count = useSignal(0);
        useTask$(({ track }) => {
          const _count = track(() => count.value);
          (globalThis as any).log.push('task: ' + _count);
          return () => (globalThis as any).log.push('cleanup: ' + _count);
        });
        (globalThis as any).log.push('Counter: ' + count.value);
        return <button onClick$={() => count.value++}>{count.value}</button>;
      });
      const isCSR = render === domRender;

      const { vNode, document } = await render(<Counter />, { debug });
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(
        isCSR ? ['task: 0', 'Counter: 0'] : ['task: 0', 'Counter: 0', 'cleanup: 0']
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>0</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, 'button', 'click');
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(
        isCSR ? ['cleanup: 0', 'task: 1', 'Counter: 1'] : ['task: 1', 'Counter: 1']
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>1</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log.length = 0;
      await trigger(document.body, 'button', 'click');
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(['cleanup: 1', 'task: 2', 'Counter: 2']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>2</Signal>
          </button>
        </Component>
      );
    });
    it('should execute cleanup task on unmount', async () => {
      (globalThis as any).log = [] as string[];
      const Child = component$(() => {
        useTask$(({ cleanup }) => {
          (globalThis as any).log.push('task:');
          cleanup(() => (globalThis as any).log.push('cleanup:'));
        });
        (globalThis as any).log.push('Child');
        return <span>Child</span>;
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            {show.value ? <Child /> : null}
          </button>
        );
      });
      const isCSR = render === domRender;

      const { vNode, document } = await render(<Parent />, { debug });
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(
        isCSR ? ['task:', 'Child'] : ['task:', 'Child', 'cleanup:']
      );
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <span>Child</span>
            </Component>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(isCSR ? ['cleanup:'] : []);
      expect(vNode).toMatchVDOM(
        <Component>
          <button></button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');

      expect((globalThis as any).log).toEqual(['task:', 'Child']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <span>Child</span>
            </Component>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');
      // console.log('log', log);
      expect((globalThis as any).log).toEqual(['cleanup:']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button></button>
        </Component>
      );
      (globalThis as any).log = undefined;
    });
    it('should handle promises and tasks', async () => {
      (global as any).log = [] as string[];
      const MyComp = component$(() => {
        const promise = useSignal<Promise<number>>();
        (global as any).log.push('render');

        // Tasks should run one after the other, awaiting returned promises.
        // Here we "sideload" a promise via the signal
        useTask$(() => {
          promise.value = Promise.resolve(0)
            .then(() => {
              (global as any).log.push('inside.1');
              return delay(10);
            })
            .then(() => {
              (global as any).log.push('1b');
              return 1;
            });
          (global as any).log.push('1a');
        });

        useTask$(async () => {
          (global as any).log.push('2a');
          await delay(10);
          (global as any).log.push('2b');
        });

        useTask$(() => {
          promise.value = promise.value!.then(() => {
            (global as any).log.push('3b');
            return 3;
          });
          (global as any).log.push('3a');
        });

        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { vNode } = await render(<MyComp />, { debug });
      expect((global as any).log).toEqual([
        // 1st render
        'render',
        // task 1 returns sync and sideloads promise
        '1a',
        // task 2 runs sync after that and returns a promise
        '2a',
        // async microtasks run, task 1 queues a delay
        'inside.1',
        '2b',
        'render',
        // task 3 runs sync and attaches to the promise
        '3a',
        // microtasks run
        '1b',
        '3b',
      ]);
      // The DOM should have the final value of the sideloaded promise
      expect(vNode).toMatchVDOM(
        <Component>
          <p>
            Should have a number: "
            <Signal>
              <Awaited>3</Awaited>
            </Signal>
            "
          </p>
        </Component>
      );
    });
  });

  it('should run cleanup with component rerender', async () => {
    const Child = component$((props: { cleanupCounter: SignalType<number> }) => {
      useTask$(({ cleanup }) => {
        cleanup(() => {
          props.cleanupCounter.value++;
        });
      });
      return <span></span>;
    });

    const Cmp = component$(() => {
      const counter = useSignal<number>(0);
      const cleanupCounter = useSignal<number>(0);
      return (
        <div>
          <button onClick$={() => counter.value++}></button>
          <Child key={counter.value} cleanupCounter={cleanupCounter} />
          {cleanupCounter.value}
        </div>
      );
    });

    const { vNode, container } = await render(<Cmp />, { debug });
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <Component>
            <span></span>
          </Component>
          <Signal ssr-required>{'6'}</Signal>
        </div>
      </Component>
    );
  });

  describe('regression', () => {
    it('#5782', async () => {
      const Child = component$(({ sig }: { sig: SignalType<SignalType<number>> }) => {
        const counter = useSignal(0);
        useTask$(({ track }) => {
          track(sig);
          sig.value = counter;
        });
        return <p>{counter.value}</p>;
      });

      const Issue5782 = component$(() => {
        const counterDefault = useSignal(0);
        const sig = useSignal(counterDefault);
        const showChild = useSignal(false);
        return (
          <>
            <button id="decrease" onClick$={() => sig.value.value--}>
              --
            </button>
            {sig.value.value}
            <button id="increase" onClick$={() => sig.value.value++}>
              ++
            </button>
            <button id="toggle" onClick$={() => (showChild.value = !showChild.value)}>
              Toggle
            </button>
            {showChild.value && <Child sig={sig} />}
          </>
        );
      });

      const { vNode, document } = await render(<Issue5782 />, { debug });

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component ssr-required>
              <p>
                <Signal ssr-required>0</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#increase', 'click');
      await trigger(document.body, '#increase', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'2'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component ssr-required>
              <p>
                <Signal ssr-required>2</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, '#decrease', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'1'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component ssr-required>
              <p>
                <Signal ssr-required>1</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'1'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button id="decrease">--</button>
            <Signal ssr-required>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component ssr-required>
              <p>
                <Signal ssr-required>0</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );
    });

    it('#4332', async () => {
      const Child = component$((props: { val: string }) => {
        useTask$(({ track }) => {
          track(() => props.val);
        });
        return <>{props.val}</>;
      });

      const Parent = component$(() => {
        const sig = useSignal<{ data: string } | undefined>({ data: 'abcd' });

        return (
          <>
            <button onClick$={() => (sig.value = sig.value ? undefined : { data: 'abcd' })}>
              Toggle
            </button>
            {sig.value && <Child val={sig.value.data} />}
          </>
        );
      });
      const { vNode, document } = await render(<Parent />, { debug });
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>Toggle</button>
            <Component ssr-required>
              <Fragment ssr-required>
                <Signal ssr-required>abcd</Signal>
              </Fragment>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>Toggle</button>
            {''}
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>Toggle</button>
            <Component ssr-required>
              <Fragment ssr-required>
                <Signal ssr-required>abcd</Signal>
              </Fragment>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });

  it('should rerender component after task', async () => {
    const Cmp = component$(() => {
      const sort = useSignal<'id' | 'size'>('size');
      const table = useSignal([
        { id: 1, size: 4 },
        { id: 2, size: 3 },
        { id: 3, size: 2 },
        { id: 4, size: 1 },
        { id: 5, size: 7 },
        { id: 6, size: 8 },
        { id: 7, size: 9 },
      ]);

      useTask$(({ track }) => {
        const key = track(sort);
        table.value = table.value.sort((a, b) => a[key] - b[key]).slice();
      });

      return (
        <>
          <span>{table.value.map((row) => row.size).join(' ')}</span>
          <button onClick$={() => (sort.value = sort.value === 'id' ? 'size' : 'id')}>Sort</button>
        </>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <span>1 2 3 4 7 8 9</span>
          <button>Sort</button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <span>4 3 2 1 7 8 9</span>
          <button>Sort</button>
        </Fragment>
      </Component>
    );

    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <span>1 2 3 4 7 8 9</span>
          <button>Sort</button>
        </Fragment>
      </Component>
    );
  });

  it('catch the ', async () => {
    const error = new Error('HANDLE ME');
    const Cmp = component$(() => {
      useTask$(() => {
        if (isServer) {
          document.body;
        }
      });

      return <div>1</div>;
    });
    try {
      await render(
        <ErrorProvider>
          <Cmp />
        </ErrorProvider>,
        { debug }
      );
    } catch (e: unknown) {
      expect((e as Error).message).toBeTruthy;
    }
    const Cmp1 = component$(() => {
      useTask$(() => {
        throw error;
      });

      return <div>1</div>;
    });
    try {
      await render(
        <ErrorProvider>
          <Cmp1 />
        </ErrorProvider>,
        { debug }
      );
    } catch (error) {
      expect((error as Error).message).toBe('HANDLE ME');
    }
  });
});
