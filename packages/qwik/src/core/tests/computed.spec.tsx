import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { testRenderer } from '../test-utils';
import {
  useSignal,
  useComputed$,
  component$,
  noSerialize,
  untrack,
  useAsync$,
  useStore,
  useTask$,
} from '@qwik.dev/core';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: computed`, () => {
  it('should render computed signal', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <p>{double.value}</p>;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('0');

    cleanup();
  });

  it('should update signal value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>{double.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('2');

    cleanup();
  });

  it('should update mixed signal text', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>Count {double.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Count 0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('Count 2');

    cleanup();
  });

  it('should update text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      return <button onClick$={() => count.value++}>{double.value + 1}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('1');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('3');

    cleanup();
  });

  it('should update multiple text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      const double = useComputed$(() => count.value * 2);
      const quadruple = useComputed$(() => count.value * 4);
      return (
        <button onClick$={() => count.value++}>
          {count.value}
          {double.value + 1}
          {quadruple.value + 3}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('013');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('137');

    cleanup();
  });
});

describe(`${name}: useComputed`, () => {
  const isSsr = name === 'ssrRender';
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
    const { container, cleanup, flush } = await render(Cmp, {
      ...{ debug },
      props: { initial: 0 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe('Double count: 0! 0');
    });
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

    const { container, cleanup, flush } = await render(DoubleCounter, {
      ...{ debug },
      props: { initial: 123 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 246! 123');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.getAttribute('id')).toBe('123');
    });
    expect(container.querySelector('button[id=123]')).toBeTruthy();
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 248! 124');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.getAttribute('id')).toBe('124');
    });
    expect(container.querySelector('button[id=124]')).toBeTruthy();
  });

  it('should update value based on another computed', async () => {
    const QuadrupleCounter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      const doubleCount = useComputed$(() => count.value * 2);
      const quadrupleCount = useComputed$(() => doubleCount.value * 2);
      return <button onClick$={() => count.value++}>Double count: {quadrupleCount.value}!</button>;
    });

    const { container, cleanup, flush } = await render(QuadrupleCounter, {
      ...{ debug },
      props: { initial: 123 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 492!');
    });
    await triggerAll(container, 'button', 'click');
    await flush();
    // TODO figure out why this requires waitForDrain
    // computed signals should cause the cursor to pause
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 496!');
    });
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

    const { container, cleanup, flush } = await render(DoubleCounter, {
      ...{ debug },
      props: { initial: 123 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 246!');
    });
    expect((globalThis as any).runCount).toBe(1);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 246!');
    });
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

    const { container, cleanup, flush } = await render(DoubleCounter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 2!');
    });
    expect((globalThis as any).runCount).toBe(1);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Double count: 2!');
    });
    expect((globalThis as any).runCount).toBe(1);
  });

  it('should allow return signal inside computed', async () => {
    const Counter = component$(() => {
      const foo = useSignal(1);
      const count = useComputed$(() => foo);
      return <button onClick$={() => count.value.value++}>Count: {count.value.value}!</button>;
    });

    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Count: 1!');
    });
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('Count: 2!');
    });
  });

  it('should support async computed functions', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsync$(() => Promise.resolve(count.value * 2));
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('2');
    });
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('4');
    });
  });

  it('should track dependencies read after an await via track() in async computed', async () => {
    const Counter = component$(() => {
      const count = useSignal(1);
      const doubleCount = useAsync$<number>(async ({ track }) => {
        await Promise.resolve();
        return track(count) * 2;
      });
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    });
    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('2');
    });
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('4');
    });
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
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe('truetruetrue');
    });
    expect(container.querySelectorAll('button')).toHaveLength(2);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.getAttribute('id')).toBe('toggle-boolean1');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('toggle-boolean2');
    });
    await trigger(container, 'button[id="toggle-boolean1"]', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe('falsetruetrue');
    });
    expect(container.querySelectorAll('button')).toHaveLength(2);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.getAttribute('id')).toBe('toggle-boolean1');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('toggle-boolean2');
    });
    await trigger(container, 'button[id="toggle-boolean2"]', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe('falsefalsefalse');
    });
    expect(container.querySelectorAll('button')).toHaveLength(2);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.getAttribute('id')).toBe('toggle-boolean1');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('toggle-boolean2');
    });
  });

  describe('async', () => {
    it('should auto-track synchronous reads', async () => {
      const Counter = component$(() => {
        const explicitlyTracked = useSignal(1);
        const autoTracked = useSignal(10);
        const sum = useAsync$(() => {
          return Promise.resolve(explicitlyTracked.value + autoTracked.value);
        });
        return (
          <div>
            <button id="explicit" onClick$={() => explicitlyTracked.value++}></button>
            <button id="auto" onClick$={() => autoTracked.value++}></button>
            <span>{sum.value}</span>
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      const renderedSum = () => container.querySelector('span')!.textContent;
      expect(renderedSum()).toBe('11');

      await trigger(container, 'button#auto', 'click');
      await flush();
      await vi.waitFor(async () => {
        await flush();
        expect(renderedSum()).toBe('12');
      });

      await trigger(container, 'button#explicit', 'click');
      await flush();
      await vi.waitFor(async () => {
        await flush();
        expect(renderedSum()).toBe('13');
      });
    });

    it('should compute async computed result from async computed result', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsync$(() => {
          return Promise.resolve(count.value * 2);
        });
        const quadrupleCount = useAsync$(() => {
          return Promise.resolve(doubleCount.value * 2);
        });
        return <button onClick$={() => count.value++}>{quadrupleCount.value}</button>;
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('4');
      });

      await triggerAll(container, 'button', 'click');
      await flush();

      // TODO this should not be needed
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('8');
      });
    });

    it('should resolve delayed promise in computed result', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsync$<number>(
          ({ track }) =>
            new Promise<number>((resolve) => {
              setTimeout(() => {
                resolve(track(count) * 2);
              });
            })
        );
        return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('2');
      });
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('4');
      });
    });

    it('should handle undefined as promise result', async () => {
      (globalThis as any).log = [];
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsync$(() => Promise.resolve(undefined));

        return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('');
      });
    });

    it('should render as attribute', async () => {
      const Counter = component$(() => {
        const count = useSignal(1);
        const doubleCount = useAsync$(() => Promise.resolve(count.value * 2));
        return <button data-count={doubleCount.value} onClick$={() => count.value++}></button>;
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('');
      });
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.getAttribute('data-count')).toBe('2');
      });
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('');
      });
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.getAttribute('data-count')).toBe('4');
      });
    });
  });

  describe('pending', () => {
    it('should not show initial value after SSR', async () => {
      const Cmp = component$(() => {
        const asyncValue = useAsync$(async () => 42, { initial: 10 });
        return <div>{asyncValue.value}</div>;
      });
      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('div')!.textContent).toBe('42');
      });
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
      await render(Counter, { debug });
      expect((globalThis as any).log).toEqual(['task', 2]);

      (globalThis as any).log = undefined;
    });
  });

  describe('clientOnly', () => {
    it('should throw when reading .value from clientOnly signal without initial value during SSR', async () => {
      const Counter = component$(() => {
        const asyncValue = useAsync$(async () => 42, {
          clientOnly: true,
          // No initial value provided
        });
        return <div>{asyncValue.value}</div>;
      });

      if (name === 'ssrRender') {
        // During SSR, accessing .value on a clientOnly signal without initial value should throw
        let threwError = false;
        let errorMessage = '';
        try {
          await render(Counter, { debug });
        } catch (e) {
          threwError = true;
          errorMessage = (e as Error).message;
        }

        expect(threwError).toBe(true);
        expect(errorMessage).toContain('Cannot read .value of a clientOnly async signal');
      } else {
        // During client render, clientOnly signals compute eagerly, so it should work
        // (or at least not throw with the "cannot read" error)
        const { container, cleanup } = await render(Counter, { debug });
        onTestFinished(cleanup);
        // Should render successfully with the computed value
        expect(container).toBeDefined();
      }
    });
  });

  describe('cleanup', () => {
    it('should run cleanup on destroy', async () => {
      (globalThis as any).log = [];

      const Child = component$(() => {
        const asyncValue = useAsync$<number>(async ({ cleanup }) => {
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
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      // on server its called after render
      // on client it is not called yet
      expect((globalThis as any).log).toEqual(name === 'ssrRender' ? ['cleanup'] : []);
      await triggerAll(container, 'button', 'click');
      await flush();
      // on server after resuming cleanup is not called yet
      // on client it is called as usual
      // so from this point the log is equal for ssr and client
      expect((globalThis as any).log).toEqual(['cleanup']);
      await triggerAll(container, 'button', 'click');
      await flush(); //show
      await triggerAll(container, 'button', 'click');
      await flush(); //hide
      // on server and client cleanup called again
      expect((globalThis as any).log).toEqual(['cleanup', 'cleanup']);
    });

    it('should run cleanup on re-compute', async () => {
      (globalThis as any).log = [];

      const Counter = component$(() => {
        const count = useSignal(1);
        const asyncValue = useAsync$<number>(({ cleanup }) => {
          const current = count.value;
          cleanup(() => {
            (globalThis as any).log.push('cleanup');
          });
          return Promise.resolve(current * 2);
        });
        return <button onClick$={() => count.value++}>{asyncValue.value}</button>;
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect((globalThis as any).log).toEqual(name === 'ssrRender' ? ['cleanup'] : []);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).log).toEqual(['cleanup']);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).log).toEqual(['cleanup', 'cleanup']);
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

      const { container, cleanup, flush } = await render(OuterComponent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('button')!.textContent).toBe('Next');
      });
      expect(container.querySelectorAll('div')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('div')!.textContent).toBe('123');
      });
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

      const { container, cleanup, flush } = await render(Issue3294, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('div')!.textContent).toBe('Hevery Misko');
      });
      expect(container.querySelectorAll('span')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('span')!.textContent).toBe('Hevery Misko');
      });
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

      const { container, cleanup, flush } = await render(Issue3294, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('div')!.textContent).toBe('Hevery Misko');
      });
      expect(container.querySelectorAll('span')).toHaveLength(1);
      await vi.waitFor(async () => {
        await flush();
        expect(container.querySelector('span')!.textContent).toBe('Hevery Misko');
      });
      expect((globalThis as any).useComputedCount).toBe(1);
    });

    it('notifies a task with the current computed value after invalidation', async () => {
      (globalThis as any).__computedTaskValues = [];
      const Issue4918 = component$(() => {
        const countRef = useSignal(0);
        const isGreetOneRef = useComputed$(() => {
          return countRef.value > 1;
        });
        useTask$(() => {
          (globalThis as any).__computedTaskValues.push(isGreetOneRef.value);
        });
        return (
          <div>
            <button onClick$={() => (countRef.value = countRef.value + 1)}>incr</button>
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Issue4918, { debug });
      onTestFinished(cleanup);
      expect((globalThis as any).__computedTaskValues.at(-1)).toBe(false);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__computedTaskValues.at(-1)).toBe(false);
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__computedTaskValues.at(-1)).toBe(true);
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__computedTaskValues.at(-1)).toBe(true);
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__computedTaskValues.at(-1)).toBe(true);
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

    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(2);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe('Double count: 2show-Ran 1 times.');
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('Ran 1 times.');
    });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('show');
    });
    expect(container.querySelectorAll('span')).toHaveLength(0);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(2);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('div')!.textContent).toBe(
        'Double count: 2hide2Ran ' + String(isSsr ? '2' : '1') + ' times.'
      );
    });
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelectorAll('div')[1]!.textContent).toBe(
        'Ran ' + String(isSsr ? '2' : '1') + ' times.'
      );
    });
    expect(container.querySelectorAll('button')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('button')!.textContent).toBe('hide');
    });
    expect(container.querySelectorAll('span')).toHaveLength(1);
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('span')!.textContent).toBe('2');
    });
  });
});
