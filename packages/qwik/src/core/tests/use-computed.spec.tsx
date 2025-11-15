import {
  Fragment,
  Fragment as Signal,
  Fragment as Component,
  component$,
  createComputed$,
  createSignal,
  noSerialize,
  qrl,
  untrack,
  useComputed$,
  useComputedQrl,
  useLexicalScope,
  useSignal,
  useStore,
  useTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import * as qError from '../shared/error/error';
import { QError } from '../shared/error/error';

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
                const [count] = useLexicalScope();
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

  it('should disallow Promise in computed result', async () => {
    const qErrorSpy = vi.spyOn(qError, 'qError');
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useComputed$(() => Promise.resolve(count.value * 2));
      return (
        <button onClick$={() => count.value++}>
          {
            // @ts-expect-error
            doubleCount.value
          }
        </button>
      );
    });
    try {
      await render(
        <ErrorProvider>
          <Counter />
        </ErrorProvider>,
        { debug }
      );
    } catch (e) {
      expect((e as Error).message).toBeDefined();
      expect(qErrorSpy).toHaveBeenCalledWith(QError.computedNotSync, expect.any(Array));
    }
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
});
