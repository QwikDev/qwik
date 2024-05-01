import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import {
  component$,
  useSignal,
  useStore,
  useComputed$,
  Fragment as Signal,
  useComputedQrl,
  useLexicalScope,
  qrl,
} from '@builder.io/qwik';
import { domRender, ssrRenderToDom } from '../../testing/rendering.unit-util';
import '../../testing/vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useComputed', ({ render }) => {
  it('should compute signals synchronously', async () => {
    const Counter = component$(() => {
      const count = useSignal(123);
      const doubleCount = useComputedQrl<number>(
        qrl(
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
          Double count: <Signal>{'246'}</Signal>! <Signal>{'123'}</Signal>
        </button>
      </>
    );
    expect(container.document.querySelector('button[id=123]')).toBeTruthy();
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button id="124">
          Double count: <Signal>{'248'}</Signal>! <Signal>{'124'}</Signal>
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
          Double count: <Signal>{'492'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal>{'496'}</Signal>!
        </button>
      </>
    );
  });

  it('should not rerun if there are no signal dependencies', async () => {
    (globalThis as any).runCount = 0;
    const DoubleCounter = component$((props: { initial: number }) => {
      const count = props.initial;
      const doubleCount = useComputed$(() => {
        (globalThis as any).runCount++;
        return count * 2;
      });
      return <button onClick$={() => (count as any)++}>Double count: {doubleCount.value}!</button>;
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
          Double count: <Signal>{'2'}</Signal>!
        </button>
      </>
    );
    expect((globalThis as any).runCount).toBe(1);
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Double count: <Signal>{'2'}</Signal>!
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
          Count: <Signal>{'1'}</Signal>!
        </button>
      </>
    );
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          Count: <Signal>{'2'}</Signal>!
        </button>
      </>
    );
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
        <>
          <>
            <button>Next</button>
            <>
              <div>{'123'}</div>
            </>
          </>
        </>
      );
    });

    it.skip('#3294 - improvement(after v2): should lazily evaluate the function with useSignal', async () => {
      let useComputedCount = 0;
      const Issue3294 = component$(() => {
        const firstName = useSignal('Misko');
        const lastName = useSignal('Hevery');
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputed$(() => {
          useComputedCount++;
          return lastName.value + ' ' + firstName.value;
        });
        const secondUseComputed = useComputed$(() => {
          useComputedCount++;
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
            <span>Hevery Misko</span>
          </div>
        </>
      );
      expect(useComputedCount).toBe(1);
    });

    it.skip('#3294 - improvement(after v2): should lazily evaluate the function with store', async () => {
      let useComputedCount = 0;
      const Issue3294 = component$(() => {
        const store = useStore({ firstName: 'Misko', lastName: 'Hevery' });
        const execFirstUseComputed = useSignal(true);
        const firstUseComputed = useComputed$(() => {
          useComputedCount++;
          return store.lastName + ' ' + store.firstName;
        });
        const secondUseComputed = useComputed$(() => {
          useComputedCount++;
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
            <span>Hevery Misko</span>
          </div>
        </>
      );
      expect(useComputedCount).toBe(1);
    });
  });
});
