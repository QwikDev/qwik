import {
  Fragment as Awaited,
  Fragment as Component,
  Fragment,
  Fragment as Projection,
  Fragment as Signal,
  useVisibleTask$,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { trigger, domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { component$, Slot, type Signal as SignalType, untrack, useSignal } from '@qwik.dev/core';
import { _EFFECT_BACK_REF } from '@qwik.dev/core/internal';
import { vnode_getFirstChild, vnode_locate } from '../client/vnode-utils';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useSignal', ({ render }) => {
  it('should update value', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      return (
        <button
          onClick$={() => {
            count.value++;
          }}
        >
          Count: {count.value}!
        </button>
      );
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'123'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal ssr-required>{'124'}</Signal>!
        </button>
      </>
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
      const count = useSignal(props.initial);
      return (
        <button onClick$={() => count.value++}>
          <Display dValue={count.value} />
        </button>
      );
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <>
            <span>
              Count: <Signal ssr-required>{'123'}</Signal>!
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
              Count: <Signal ssr-required>{'124'}</Signal>!
            </span>
          </>
        </button>
      </>
    );
  });
  it('should update from JSX', async () => {
    const Child = component$(() => {
      return (
        <span>
          <Slot />
        </span>
      );
    });

    const Counter = component$((props: { initial: number }) => {
      const jsx = useSignal(<Child>content</Child>);
      const show = useSignal(false);
      return (
        <button onClick$={() => (show.value = !show.value)}>
          {show.value ? jsx.value : 'hidden'}
        </button>
      );
    });

    const { vNode, container } = await render(<Counter initial={123} />, { debug });
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>hidden</Signal>
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          <Signal ssr-required>
            <Component ssr-required>
              <span>
                <Projection ssr-required>content</Projection>
              </span>
            </Component>
          </Signal>
        </button>
      </>
    );
  });
  it('should render promise values', async () => {
    const MyCmp = component$(() => {
      const promise = Promise.resolve('const ');
      const signal = useSignal(Promise.resolve(0));
      return (
        <button key="0" onClick$={() => (signal.value = signal.value.then((v) => v + 1))}>
          {promise}
          {signal.value}
        </button>
      );
    });

    const { vNode, container, document } = await render(<MyCmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <button key="0">
          <Awaited ssr-required>{'const '}</Awaited>
          <Signal ssr-required>
            <Awaited ssr-required>{'0'}</Awaited>
          </Signal>
        </button>
      </Component>
    );
    await expect(document.querySelector('button')).toMatchDOM(<button key="0">const 0</button>);
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <button>
          <Awaited ssr-required>{'const '}</Awaited>
          <Signal ssr-required>
            <Awaited ssr-required>{'1'}</Awaited>
          </Signal>
        </button>
      </Component>
    );
    await expect(document.querySelector('button')).toMatchDOM(<button key="0">const 1</button>);
  });
  it('should handle all ClassList cases', async () => {
    const Cmp = component$(() => {
      const enable = useSignal(true);
      return (
        <div>
          <button onClick$={() => (enable.value = !enable.value)}>
            Value: {enable.value.toString()}!
          </button>
          <div class={`my-class ${enable.value ? 'enable' : 'disable'}`} />
          <span
            class={{
              'my-class': true,
              enable: enable.value,
              disable: !enable.value,
              'another-class': false,
            }}
          />
          <span
            class={[
              'my-class',
              enable.value.toString(),
              'signal-' + enable.value.toString(),
              enable.value ? 'enable' : 'disable',
            ]}
          />
        </div>
      );
    });

    const { vNode, container } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>
            {'Value: '}
            {'true'}
            {'!'}
          </button>
          <div class="my-class enable" />
          <span class="my-class enable" />
          <span class="my-class true signal-true enable" />
        </div>
      </Component>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button>
            {'Value: '}
            {'false'}
            {'!'}
          </button>
          <div class="my-class disable" />
          <span class="my-class disable" />
          <span class="my-class false signal-false disable" />
        </div>
      </Component>
    );
  });

  it('should not execute signal when not used', async () => {
    const Cmp = component$(() => {
      const data = useSignal<{ price: number } | null>({ price: 100 });
      return (
        <div>
          <button onClick$={() => (data.value = null)}></button>
          {data.value == null && <span>not found</span>}
          {data.value != null && <span>{data.value.price}</span>}
        </div>
      );
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          {''}
          <span>
            <Signal ssr-required>100</Signal>
          </span>
        </div>
      </Component>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div>
          <button></button>
          <span>not found</span>
          {''}
        </div>
      </Component>
    );
  });

  it('should deserialize signal without effects', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      useVisibleTask$(() => {
        counter.value++;
      });
      return <div></div>;
    });

    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'div', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );
  });

  describe('signals cleanup', () => {
    it('should not add multiple same subscribers for virtual node', async () => {
      const Child = component$(() => {
        return <></>;
      });

      const Cmp = component$(() => {
        const counter = useSignal<number>(0);
        const cleanupCounter = useSignal<number>(0);

        return (
          <>
            <button onClick$={() => counter.value++}></button>
            <Child key={counter.value} />
            <pre>{cleanupCounter.value + ''}</pre>
          </>
        );
      });

      const { container } = await render(<Cmp />, { debug });

      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');

      const signalVNode = vnode_getFirstChild(
        vnode_locate(container.rootVNode, container.element.querySelector('pre')!)
      )!;
      const subscribers = (signalVNode as any)[_EFFECT_BACK_REF];
      expect(subscribers).toHaveLength(1);
    });

    it('should not add multiple same subscribers for element node', async () => {
      (globalThis as any).signal = undefined;

      const Cmp = component$(() => {
        const show = useSignal(true);
        const cleanupCounter = useSignal<number>(0);

        useVisibleTask$(() => {
          untrack(() => ((globalThis as any).signal = cleanupCounter));
        });

        return (
          <div>
            <button onClick$={() => (show.value = !show.value)}></button>
            {show.value && <pre attr-test={cleanupCounter.value + ''}></pre>}
          </div>
        );
      });

      const { container } = await render(<Cmp />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(container.element, 'div', 'qvisible');
      }

      expect(
        // wrapped signal on the pre element
        (globalThis as any).signal.$effects$.values().next().value.consumer.$effects$
      ).toHaveLength(1);
      expect((globalThis as any).signal.$effects$).toHaveLength(1);

      await trigger(container.element, 'button', 'click');
      expect((globalThis as any).signal.$effects$).toHaveLength(0);

      await trigger(container.element, 'button', 'click'); // <-- this should not add another subscriber
      expect((globalThis as any).signal.$effects$).toHaveLength(1);
      expect(
        (globalThis as any).signal.$effects$.values().next().value.consumer.$effects$
      ).toHaveLength(1);

      await trigger(container.element, 'button', 'click');
      expect((globalThis as any).signal.$effects$).toHaveLength(0);

      await trigger(container.element, 'button', 'click'); // <-- this should not add another subscriber
      expect((globalThis as any).signal.$effects$).toHaveLength(1);
      expect(
        (globalThis as any).signal.$effects$.values().next().value.consumer.$effects$
      ).toHaveLength(1);

      (globalThis as any).signal = undefined;
    });
  });

  describe('derived', () => {
    it('should update value directly in DOM', async () => {
      const log: string[] = [];
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
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
            Count: <Signal ssr-required>{'123'}</Signal>!
          </button>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(log).toEqual([]);
      log.length = 0;
      expect(vNode).toMatchVDOM(
        <>
          <button>
            Count: <Signal ssr-required>{'124'}</Signal>!
          </button>
        </>
      );
    });
    it('should allow signal to deliver value or JSX', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        const count = useSignal<any>('initial');
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
            -<Signal ssr-required>{'initial'}</Signal>-
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
            -<Signal ssr-required>{'text'}</Signal>-
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
              props.countSignal.value++;
            }}
          >
            +1
          </button>
        );
      });
      const Counter = component$(() => {
        renderLog.push('Counter');
        const count = useSignal(123);
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
        <Component ssr-required>
          <Fragment ssr-required>
            <Component ssr-required>
              <Fragment ssr-required>
                Count: <Signal ssr-required>{'124'}</Signal>!
              </Fragment>
            </Component>
            <Component ssr-required>
              <button>+1</button>
            </Component>
          </Fragment>
        </Component>
      );
    });
    it('should pass signal as prop into child component', async () => {
      const Display = component$((props: { value: number }) => {
        return <div>{props.value}</div>;
      });
      const Counter = component$(() => {
        // const count = useStore({ value: 123 });
        const count = useSignal(123);
        return (
          <>
            <button onClick$={() => count.value++} />
            <Display value={count.value} />
          </>
        );
      });
      const { vNode, container } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <Component>
              <div>
                <Signal ssr-required>123</Signal>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <Component>
              <div>
                <Signal ssr-required>124</Signal>
              </div>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });

  describe('regression', () => {
    it('#4249 - should render signal text with double condition', async () => {
      const Issue4249 = component$(() => {
        const first = useSignal('');
        const second = useSignal('');

        return (
          <>
            <button
              onClick$={() => {
                first.value = 'foo';
                second.value = 'foo';
              }}
            ></button>
            <div>
              {first.value && second.value && first.value === second.value ? 'equal' : 'not-equal'}
            </div>
          </>
        );
      });

      const { vNode, document } = await render(<Issue4249 />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <div>
              <Signal ssr-required>not-equal</Signal>
            </div>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <div>
              <Signal ssr-required>equal</Signal>
            </div>
          </Fragment>
        </Component>
      );
    });

    it('#4249 - should render signal value with double condition', async () => {
      const Issue4249 = component$(() => {
        const first = useSignal('');
        const second = useSignal('');

        return (
          <>
            <button
              onClick$={() => {
                first.value = 'foo';
                second.value = 'foo';
              }}
            ></button>
            <div
              data-value={
                first.value && second.value && first.value === second.value ? 'equal' : 'not-equal'
              }
            >
              {first.value && second.value && first.value === second.value ? 'equal' : 'not-equal'}
            </div>
          </>
        );
      });

      const { vNode, document } = await render(<Issue4249 />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <div data-value="not-equal">
              <Signal ssr-required>not-equal</Signal>
            </div>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button></button>
            <div data-value="equal">
              <Signal ssr-required>equal</Signal>
            </div>
          </Fragment>
        </Component>
      );
    });

    it('should update the sum when input values change', async () => {
      const AppTest = component$(() => {
        const a = useSignal(1);
        const b = useSignal(2);
        return (
          <div>
            {a.value} + {b.value} = {a.value + b.value}
            <input type="number" id="input1" bind:value={a} />
            <input type="number" id="input2" bind:value={b} />
          </div>
        );
      });

      const { document } = await render(<AppTest />, { debug: debug });

      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          1 + 2 = 3
          <input type="number" id="input1" value="1" />
          <input type="number" id="input2" value="2" />
        </div>
      );

      const input1 = document.querySelector('#input1')! as HTMLInputElement;

      input1.value = '10';
      input1.valueAsNumber = 10;

      await trigger(document.body, input1, 'input');
      await expect(document.querySelector('div')).toMatchDOM(
        <div>
          10 + 2 = 12
          <input type="number" id="input1" value="10" />
          <input type="number" id="input2" value="2" />
        </div>
      );
    });
  });
});
