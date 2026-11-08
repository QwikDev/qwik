import { describe, expect, it, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';
import {
  useSignal,
  component$,
  type Signal as SignalType,
  untrack,
  useVisibleTask$,
} from '@qwik.dev/core';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: signals`, () => {
  it('should render signal', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <p>{count.value}</p>;
    };

    const { container, cleanup } = await render(MyComp, { debug });

    expect(container.querySelector('p')?.textContent).toBe('0');

    cleanup();
  });

  it('should update signal value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });

  it('should update mixed signal text', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>Count {count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('Count 0');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('Count 1');

    cleanup();
  });

  it('should update text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value + 1}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });

    const button = container.querySelector('button');
    expect(button?.textContent).toBe('1');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('2');

    cleanup();
  });

  it('should update empty text expression value', async () => {
    const MyComp = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value > 0 ? count.value : ''}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(MyComp, { debug });
    const button = container.querySelector('button');
    expect(button?.textContent).toBe('');

    expect(qwikLoader).toBeDefined();
    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('1');

    cleanup();
  });
});

describe(`${name}: useSignal`, () => {
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

    const { container, cleanup, flush } = await render(Counter, {
      ...{ debug },
      props: { initial: 123 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 123!');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 124!');
  });
  it('should rerender child', async () => {
    (globalThis as any).__mainTestLog = [];
    const Display = component$((props: { dValue: number }) => {
      (globalThis as any).__mainTestLog.push('Display');
      return <span>Count: {props.dValue}!</span>;
    });
    const Counter = component$((props: { initial: number }) => {
      (globalThis as any).__mainTestLog.push('Counter');
      const count = useSignal(props.initial);
      return (
        <button onClick$={() => count.value++}>
          <Display dValue={count.value} />
        </button>
      );
    });

    const { container, cleanup, flush } = await render(Counter, {
      ...{ debug },
      props: { initial: 123 },
    });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 123!');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Count: 123!');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect((globalThis as any).__mainTestLog).toEqual(['Counter', 'Display']);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 124!');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('Count: 124!');
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

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Value: true!');
    expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class enable'
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Value: true!');
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class enable'
    );
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('span')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class true signal-true enable'
    );
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(2);
    expect(container.querySelector('div')!.textContent).toBe('Value: false!');
    expect(container.querySelector('div')!.getAttribute('class')?.trim() ?? '').toBe('');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('div')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class disable'
    );
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Value: false!');
    expect(container.querySelectorAll('span')).toHaveLength(2);
    expect(container.querySelector('span')!.textContent).toBe('');
    expect(container.querySelector('span')!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class disable'
    );
    expect(container.querySelectorAll('span')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('span')[1]!.getAttribute('class')?.trim() ?? '').toBe(
      'my-class false signal-false disable'
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
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('100');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('100');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('not found');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('not found');
  });

  it('should deserialize signal without effects', async () => {
    const Cmp = component$(() => {
      const counter = useSignal(0);
      useVisibleTask$(() => {
        counter.value++;
      });
      return <div></div>;
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'div', 'qvisible');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
  });

  describe('derived', () => {
    it('should update value directly in DOM', async () => {
      (globalThis as any).__mainTestLog = [];
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        (globalThis as any).__mainTestLog.push('Counter: ' + untrack(() => count.value));
        return <button onClick$={() => count.value++}>Count: {count.value}!</button>;
      });

      const { container, cleanup, flush } = await render(Counter, {
        ...{
          debug,
          // oldSSR: true,
        },
        props: { initial: 123 },
      });
      onTestFinished(cleanup);
      expect((globalThis as any).__mainTestLog).toEqual(['Counter: 123']);
      (globalThis as any).__mainTestLog.length = 0;
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Count: 123!');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__mainTestLog).toEqual([]);
      (globalThis as any).__mainTestLog.length = 0;
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Count: 124!');
    });
    it('should allow signal to deliver value or JSX', async () => {
      (globalThis as any).__mainTestLog = [];
      const Counter = component$(() => {
        const count = useSignal<any>('initial');
        (globalThis as any).__mainTestLog.push('Counter: ' + untrack(() => count.value));
        return (
          <button
            onClick$={() => (count.value = typeof count.value == 'string' ? <b>JSX</b> : 'text')}
          >
            -{count.value}-
          </button>
        );
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect((globalThis as any).__mainTestLog).toEqual(['Counter: initial']);
      (globalThis as any).__mainTestLog.length = 0;
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('-initial-');
      expect(container.querySelectorAll('b')).toHaveLength(0);
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__mainTestLog).toEqual([]);
      (globalThis as any).__mainTestLog.length = 0;
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('-JSX-');
      expect(container.querySelectorAll('b')).toHaveLength(1);
      expect(container.querySelector('b')!.textContent).toBe('JSX');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).__mainTestLog).toEqual([]);
      (globalThis as any).__mainTestLog.length = 0;
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('-text-');
      expect(container.querySelectorAll('b')).toHaveLength(0);
    });
    it('should update value when store, update and render are separated', async () => {
      (globalThis as any).renderLog = [];
      const Display = component$((props: { displayValue: number }) => {
        (globalThis as any).renderLog.push('Display');
        return <>Count: {props.displayValue}!</>;
      });
      const Incrementor = component$((props: { countSignal: SignalType<number> }) => {
        (globalThis as any).renderLog.push('Incrementor');
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
        (globalThis as any).renderLog.push('Counter');
        const count = useSignal(123);
        return (
          <>
            <Display displayValue={count.value} />
            <Incrementor countSignal={count} />
          </>
        );
      });
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect((globalThis as any).renderLog).toEqual(['Counter', 'Display', 'Incrementor']);
      (globalThis as any).renderLog.length = 0;
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).renderLog).toEqual([]);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('+1');
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
      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('123');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('124');
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

      const { container, cleanup, flush } = await render(Issue4249, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('not-equal');

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('equal');
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

      const { container, cleanup, flush } = await render(Issue4249, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('not-equal');
      expect(container.querySelector('div')!.getAttribute('data-value')).toBe('not-equal');

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('equal');
      expect(container.querySelector('div')!.getAttribute('data-value')).toBe('equal');
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

      const { container, cleanup, flush } = await render(AppTest, { debug: debug });
      onTestFinished(cleanup);

      await expect(container.querySelector('div')!.textContent).toBe('1 + 2 = 3');
      expect(container.querySelector('div')!.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('div')!.querySelector('input')!.getAttribute('type')).toBe(
        'number'
      );
      expect(container.querySelector('div')!.querySelector('input')!.getAttribute('id')).toBe(
        'input1'
      );
      expect(
        (container.querySelector('div')!.querySelector('input')! as HTMLInputElement).value
      ).toBe('1');
      expect(container.querySelector('div')!.querySelectorAll('input')[1]!.textContent).toBe('');
      expect(
        container.querySelector('div')!.querySelectorAll('input')[1]!.getAttribute('type')
      ).toBe('number');
      expect(container.querySelector('div')!.querySelectorAll('input')[1]!.getAttribute('id')).toBe(
        'input2'
      );
      expect(
        (container.querySelector('div')!.querySelectorAll('input')[1]! as HTMLInputElement).value
      ).toBe('2');

      const input1 = container.querySelector('#input1')! as HTMLInputElement;

      input1.value = '10';
      input1.valueAsNumber = 10;

      await trigger(container, input1, 'input');
      await flush();
      await expect(container.querySelector('div')!.textContent).toBe('10 + 2 = 12');
      expect(container.querySelector('div')!.querySelector('input')!.textContent).toBe('');
      expect(container.querySelector('div')!.querySelector('input')!.getAttribute('type')).toBe(
        'number'
      );
      expect(container.querySelector('div')!.querySelector('input')!.getAttribute('id')).toBe(
        'input1'
      );
      expect(
        (container.querySelector('div')!.querySelector('input')! as HTMLInputElement).value
      ).toBe('10');
      expect(container.querySelector('div')!.querySelectorAll('input')[1]!.textContent).toBe('');
      expect(
        container.querySelector('div')!.querySelectorAll('input')[1]!.getAttribute('type')
      ).toBe('number');
      expect(container.querySelector('div')!.querySelectorAll('input')[1]!.getAttribute('id')).toBe(
        'input2'
      );
      expect(
        (container.querySelector('div')!.querySelectorAll('input')[1]! as HTMLInputElement).value
      ).toBe('2');
    });
  });
});
