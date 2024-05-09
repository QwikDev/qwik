import { Fragment as Component, Fragment, Fragment as Signal } from '@builder.io/qwik';
import { describe, expect, it, vi } from 'vitest';
import { advanceToNextTimerAndFlush, trigger } from '../../../testing/element-fixture';
import { domRender, ssrRenderToDom } from '../../../testing/rendering.unit-util';
import '../../../testing/vdom-diff.unit-util';
import { component$ } from '@builder.io/qwik';
import type { Signal as SignalType } from '../../state/signal';
import { untrack } from '../../use/use-core';
import { useSignal } from '../../use/use-signal';
import { useStore } from '../../use/use-store.public';
import { useTask$ } from '../../use/use-task';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useStore', ({ render }) => {
  it('should render value', async () => {
    const Cmp = component$(() => {
      const store = useStore({ items: [{ num: 0 }] });
      return (
        <>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <Fragment>
          <div key="0">0</div>
        </Fragment>
      </Component>
    );
  });
  it('should update value', async () => {
    const Counter = component$(() => {
      const count = useStore({ count: 123 });
      return <button onClick$={() => count.count++}>Count: {count.count}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'124'}</Signal>!
        </button>
      </Component>
    );
  });
  it('should update deep value', async () => {
    const Counter = component$(() => {
      const count = useStore({ obj: { count: 123 } });
      return <button onClick$={() => count.obj.count++}>Count: {count.obj.count}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal>{'123'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal>{'124'}</Signal>!
        </button>
      </>
    );
  });

  it('should update array value', async () => {
    const Counter = component$(() => {
      const count = useStore([123]);
      return <button onClick$={() => count[0]++}>Count: {count[0]}!</button>;
    });

    const { vNode, container } = await render(<Counter />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'123'}</Signal>!
        </button>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          Count: <Signal>{'124'}</Signal>!
        </button>
      </Component>
    );
  });

  it('should rerender child', async () => {
    const log: string[] = [];
    const Display = component$((props: { dValue: number }) => {
      log.push('Display');
      return <span>Count: {props.dValue}!</span>;
    });
    const Counter = component$((props: { initial: number }) => {
      log.push('Counter');
      const count = useStore({ obj: { value: props.initial } });
      return (
        <button onClick$={() => count.obj.value++}>
          <Display dValue={count.obj.value} />
        </button>
      );
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <>
            <span>
              Count: <Signal>{'123'}</Signal>!
            </span>
          </>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(log).toEqual(['Counter', 'Display']);
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <>
            <span>
              Count: <Signal>{'124'}</Signal>!
            </span>
          </>
        </button>
      </>
    );
  });
  describe('derived', () => {
    it('should update value directly in DOM', async () => {
      const log: string[] = [];
      const Counter = component$((props: { initial: number }) => {
        const count = useStore({ value: props.initial });
        log.push('Counter: ' + untrack(() => count.value));
        return <button onClick$={() => count.value++}>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, {
        debug,
        // oldSSR: true,
      });
      expect(log).toEqual(['Counter: 123']);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            Count: <>{'123'}</>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            Count: <>{'124'}</>!
          </button>
        </>
      );
    });
    it('should allow signal to deliver value or JSX', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        const count = useStore<any>({ value: 'initial' });
        log.push('Counter: ' + untrack(() => count.value));
        return (
          <button
            onClick$={() => (count.value = typeof count.value == 'string' ? <b>JSX</b> : 'text')}
          >
            -{count.value}-
          </button>
        );
      });

      const { vNode, container } = await render(<Counter />, { debug });
      expect(log).toEqual(['Counter: initial']);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            -<>{'initial'}</>-
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            -
            <>
              <b>JSX</b>
            </>
            -
          </button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            -<>{'text'}</>-
          </button>
        </>
      );
    });
    it('should update value when store, update and render are separated', async () => {
      const renderLog: string[] = [];
      const Display = component$((props: { displayValue: number }) => {
        renderLog.push('Display');
        return <>Count: {props.displayValue}!</>;
      });
      const Incrementor = component$((props: { countSignal: SignalType<number> }) => {
        renderLog.push('Incrementor');
        return (
          <button
            onClick$={() => {
              const signal = props.countSignal;
              signal.value++;
            }}
          >
            +1
          </button>
        );
      });
      const Counter = component$(() => {
        renderLog.push('Counter');
        const count = useStore({ value: 123 });
        return (
          <>
            <Display displayValue={count.value} />
            <Incrementor countSignal={count} />
          </>
        );
      });
      const { vNode, container } = await render(<Counter />, { debug });
      expect(renderLog).toEqual(['Counter', 'Display', 'Incrementor']);
      renderLog.length = 0;
      await trigger(container.element, 'button', 'click');
      expect(renderLog).toEqual([]);
      expect(vNode).toMatchVDOM(
        <Fragment>
          <>
            <Component>
              <>
                Count: <>{'124'}</>!
              </>
            </Component>
            <Component>
              <button>+1</button>
            </Component>
          </>
        </Fragment>
      );
    });
  });

  describe('regression', () => {
    it('#5597 - should update value', async () => {
      (globalThis as any).clicks = 0;
      const Issue5597 = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        return (
          <>
            <button
              onClick$={() => {
                count.value++;
                store.items = store.items.map((i: { num: number }) => ({ num: i.num + 1 }));
                (globalThis as any).clicks++;
              }}
            >
              Count: {count.value}!
            </button>
            {store.items.map((item, key) => (
              <div key={key}>{item.num}</div>
            ))}
          </>
        );
      });

      const { vNode, container } = await render(<Issue5597 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>
              {'Count: '}
              <Signal>{(globalThis as any).clicks}</Signal>
              {'!'}
            </button>
            <div key="0">{(globalThis as any).clicks}</div>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>
              {'Count: '}
              <Signal>{(globalThis as any).clicks}</Signal>
              {'!'}
            </button>
            <div key="0">{(globalThis as any).clicks}</div>
          </Fragment>
        </Component>
      );
    });

    it('#5597 - should update value with setInterval', async () => {
      vi.useFakeTimers();
      const Cmp = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        useTask$(
          ({ cleanup }) => {
            const intervalId = setInterval(() => {
              count.value++;
              store.items = store.items.map((i: { num: number }) => ({ num: i.num + 1 }));
            }, 500);

            cleanup(() => clearInterval(intervalId));
          },
          {
            eagerness: 'visible',
          }
        );
        return (
          <>
            <div>Count: {count.value}!</div>
            {store.items.map((item, key) => (
              <div key={key}>{item.num}</div>
            ))}
          </>
        );
      });
      const { vNode, document } = await render(<Cmp />, { debug });
      await trigger(document.body, 'div', 'qvisible');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div>
              {'Count: '}
              <Signal>{'0'}</Signal>
              {'!'}
            </div>
            <div key="0">0</div>
          </Fragment>
        </Component>
      );
      await advanceToNextTimerAndFlush();
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div>
              {'Count: '}
              <Signal>{'1'}</Signal>
              {'!'}
            </div>
            <div key="0">1</div>
          </Fragment>
        </Component>
      );
      await advanceToNextTimerAndFlush();
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <div>
              {'Count: '}
              <Signal>{'2'}</Signal>
              {'!'}
            </div>
            <div key="0">2</div>
          </Fragment>
        </Component>
      );
      vi.useRealTimers();
    });

    it.skip('#5662 - should update value in the list', async () => {
      /**
       * ROOT CAUSE ANALYSIS: This is a bug in Optimizer. The optimizer incorrectly marks the
       * `onClick` listener as 'const'/'immutable'. Because it is const, the QRL associated with the
       * click handler always points to the original object, and it is not updated.
       */
      const Cmp = component$(() => {
        const store = useStore<{ users: { name: string }[] }>({ users: [{ name: 'Giorgio' }] });

        return (
          <div>
            {store.users.map((user, key) => (
              <span
                key={key}
                onClick$={() => {
                  store.users = store.users.map(({ name }: { name: string }) => ({
                    name: name === user.name ? name + '!' : name,
                  }));
                }}
              >
                {user.name}
              </span>
            ))}
          </div>
        );
      });
      const { vNode, container } = await render(<Cmp />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <span key="0">
              <Signal>{'Giorgio'}</Signal>
            </span>
          </div>
        </Component>
      );
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      await trigger(container.element, 'span', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div>
            <span key="0">
              <Signal>{'Giorgio!!!!!'}</Signal>
            </span>
          </div>
        </Component>
      );
    });

    // TODO(optimizer-test): this is failing also in v1
    it.skip('#5017 - should update child nodes for direct array', async () => {
      const Child = component$<{ columns: string }>(({ columns }) => {
        return <div>Child: {columns}</div>;
      });

      const Parent = component$(() => {
        const state = useStore([{ columns: 'INITIAL' }]);
        return (
          <>
            <button onClick$={() => (state[0] = { columns: 'UPDATE' })}>update!</button>
            <Child columns={state[0].columns} />
            {state.map((block, idx) => {
              return <Child columns={block.columns} key={idx} />;
            })}
          </>
        );
      });

      const { vNode, container } = await render(<Parent />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>update!</button>
            <Component>
              <div>
                {'Child: '}
                {'INITIAL'}
              </div>
            </Component>
            <Component>
              <div>
                {'Child: '}
                {'INITIAL'}
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button>update!</button>
            <Component>
              <div>
                {'Child: '}
                {'UPDATE'}
              </div>
            </Component>
            <Component>
              <div>
                {'Child: '}
                {'UPDATE'}
              </div>
            </Component>
          </Fragment>
        </Component>
      );
    });

    it('#5001 - should serialize naked value', async () => {
      const Button = component$<{ unusedValue?: [number]; state: [number] }>(({ state }) => {
        return <button onClick$={() => state[0]++}>+1</button>;
      });
      const Parent = component$<{ nakedState: [number] }>(({ nakedState }) => {
        // STEP 2
        // We wrap the `nakedState` into `state`.
        // This means that Qwik needs to serialize the Proxy for the `nakedState`.
        const state = useStore(nakedState);
        // const signal = useSignal(0);
        return (
          <>
            <Button
              // STEP 3
              // Uncommenting the next line breaks the code. (UI no longer updates)
              // This seems te be because Qwik somehow gets confused between the two
              // objects and assumes that `state` is no longer a proxy hence no
              // subscription
              //
              unusedValue={nakedState}
              state={state}
            />
            {'Count: '}
            {/* <>{'0'}</> */}
            {state[0]}
            {/* {signal.value} */}
          </>
        );
      });
      const Issue5001 = component$(() => {
        const nakedState: [number] = [0];
        // STEP 1
        // By passing the `nakedState` into a child component, we force
        // Qwik to serialize `nakedState` into `qwik/json`
        return <Parent nakedState={nakedState} />;
      });

      const { vNode, document } = await render(<Issue5001 />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <Fragment>
              <Component>
                <button>+1</button>
              </Component>
              {'Count: '}
              <Signal>0</Signal>
            </Fragment>
          </Component>
        </Component>
      );

      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <Fragment>
              <Component>
                <button>+1</button>
              </Component>
              {'Count: '}
              <Signal>1</Signal>
            </Fragment>
          </Component>
        </Component>
      );
    });
  });
});
