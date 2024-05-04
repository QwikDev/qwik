import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { Fragment, Fragment as Component, Fragment as Signal } from '../render/jsx/jsx-runtime';
import { SignalDerived, type Signal as SignalType } from '../state/signal';
import { useSignal } from '../use/use-signal';
import { useStore } from '../use/use-store.public';
import { useTask$ } from '../use/use-task';
import { delay } from '../util/promises';
import { ErrorProvider, domRender, ssrRenderToDom } from '../../testing/rendering.unit-util';
import '../../testing/vdom-diff.unit-util';
import { getTestPlatform } from '../../testing/platform';

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
          <div>
            <ThrowError />
          </div>
        </ErrorProvider>,
        { debug }
      );
      expect(ErrorProvider.error).toBe(render === domRender ? error : null);
    } catch (e) {
      expect(render).toBe(ssrRenderToDom);
      expect(e).toBe(error);
    }
  });
  it('should handle async exceptions', async () => {
    const error = new Error('HANDLE ME');
    const Counter = component$(() => {
      useTask$(async () => {
        await delay(1);
        throw error;
      });
      return <span>OK</span>;
    });

    try {
      await render(
        <ErrorProvider>
          <Counter />
        </ErrorProvider>,
        { debug }
      );
      expect(ErrorProvider.error).toBe(render === domRender ? error : null);
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
      'Counter',
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
        return <button onClick$={() => count.value++}>{double.value}</button>;
      });

      const { vNode, document } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>20</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>22</Signal>
          </button>
        </Component>
      );
      await getTestPlatform().flush();
    });
    it('should rerun on track derived signal', async () => {
      const Counter = component$(() => {
        const countRaw = useStore({ count: 10 });
        const count = new SignalDerived((o: any, prop: string) => o[prop], [countRaw, 'count']);
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
            <Signal>20</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>22</Signal>
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
            <Signal>2</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal>4</Signal>
          </button>
        </Component>
      );
    });
  });
  describe('queue', () => {
    it('should execute dependant tasks', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0, quadruple: 0 });
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
            <Signal>1/2/4</Signal>
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
            <Signal>2/4/8</Signal>
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
            <Signal>0</Signal>
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
            <Signal>1</Signal>
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
            <Signal>2</Signal>
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
      const log: string[] = [];
      const MyComp = component$(() => {
        log.push('render');
        const promise = useSignal<Promise<number>>();

        // Tasks should run one after the other, awaiting returned promises.
        // Here we "sideload" a promise via the signal
        useTask$(() => {
          promise.value = Promise.resolve(0)
            .then(() => {
              log.push('inside.1');
              return delay(10);
            })
            .then(() => {
              log.push('1b');
              return 1;
            });
          log.push('1a');
        });

        useTask$(async () => {
          log.push('2a');
          await delay(10);
          log.push('2b');
        });

        useTask$(() => {
          promise.value = promise.value!.then(() => {
            log.push('3b');
            return 3;
          });
          log.push('3a');
        });

        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { vNode } = await render(<MyComp />, { debug });
      expect(log).toEqual([
        // 1st render
        'render',
        // task 1 returns sync and sideloads promise
        '1a',
        // task 2 runs sync after that and returns a promise
        '2a',
        // async microtasks run, task 1 queues a delay
        'inside.1',
        '2b',
        // render waited until task 2 finished
        // re-render because of signal change in task 1
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
            <Fragment>
              <Signal>3</Signal>
            </Fragment>
            "
          </p>
        </Component>
      );
    });
  });

  describe('regression', () => {
    // TODO(optimizer-test): problem still exists with the optimizer!
    it.skip('#5782', async () => {
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
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component>
              <p>
                <Signal>0</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#increase', 'click');
      await trigger(document.body, '#increase', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'2'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component>
              <p>
                <Signal>2</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, '#decrease', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'1'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component>
              <p>
                <Signal>1</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'1'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            <Signal>{'0'}</Signal>
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component>
              <p>
                <Signal>0</Signal>
              </p>
            </Component>
          </Fragment>
        </Component>
      );
    });

    // TODO(optimizer-test): problem still exists with the optimizer!
    it.skip('#4332', async () => {
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
        <Component>
          <Fragment>
            <button>Toggle</button>
            <Component>
              <Fragment>
                <Signal>abcd</Signal>
              </Fragment>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>Toggle</button>
            {''}
          </Fragment>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>Toggle</button>
            <Component>
              <Fragment>
                <Signal>abcd</Signal>
              </Fragment>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });
});
