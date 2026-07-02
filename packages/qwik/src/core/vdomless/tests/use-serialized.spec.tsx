import { describe, expect, it } from 'vitest';
import { createAsync$, createSerializer$, useSignal } from '@qwik.dev/core/spark';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { render: ssrRender }, //
  { render: csrRender }, //
])('$render.name: serializer signals', ({ render }) => {
  it('should do custom serialization', async () => {
    const Counter = () => {
      const myCount = createSerializer$({
        deserialize: (count = 0) => ({
          count,
        }),
        serialize: (data) => data.count,
        initial: 2,
      });
      const spy = useSignal(myCount.value.count);
      return (
        <button
          onClick$={() => {
            myCount.value.count++;
            spy.value = myCount.value.count;
          }}
        >
          {spy.value}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<Counter />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('2');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('3');

    cleanup();
  });

  it('should update reactively', async () => {
    const Counter = () => {
      const sig = useSignal(1);
      const myCount = createSerializer$(() => ({
        deserialize: () => ({
          count: sig.value * 2,
        }),
        update: (current) => {
          current.count = sig.value * 2;
          return current;
        },
      }));
      return <button onClick$={() => sig.value++}>{myCount.value.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<Counter />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('2');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('4');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('6');

    cleanup();
  });

  it('should support custom serialize function', async () => {
    const Counter = () => {
      const count = createSerializer$({
        deserialize: (data: number = 0) => ({
          count: data,
        }),
        serialize: (obj) => obj.count,
      });
      return (
        <button
          onClick$={() => {
            count.value.count++;
            count.trigger();
          }}
        >
          {count.value.count}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<Counter />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('2');

    cleanup();
  });

  it('should recalculate value without update function', async () => {
    const Counter = () => {
      const count = createSerializer$({
        deserialize: (data: number = 0) => ({
          count: data,
        }),
        serialize: (obj) => obj.count,
      });
      return (
        <button
          onClick$={() => {
            count.value.count++;
            count.invalidate();
          }}
        >
          {count.value.count}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<Counter />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('2');

    cleanup();
  });

  it('should deserialize a Promise initial value as Date', async () => {
    const DateDisplay = () => {
      const dateStr = createAsync$(() => Promise.resolve('2025-01-15T12:00:00.000Z'));
      const date = createSerializer$(() => ({
        deserialize: (str: string) => new Date(str),
        serialize: (d) => d.toISOString(),
        initial: dateStr.value,
      }));
      return <span>{date.value.toISOString()}</span>;
    };

    const { container, cleanup, flush } = await render(<DateDisplay />, { debug });

    await flush();
    expect(container.querySelector('span')!.textContent).toBe('2025-01-15T12:00:00.000Z');

    cleanup();
  });

  it('should not crash when used many times', async () => {
    const App = () => {
      const foo = useSignal(0);
      const custom = createSerializer$(() => ({
        initial: { bar: 'bar' },
        serialize: (c: { foo: number; bar: string }) => ({ foo: c.foo, bar: c.bar }),
        deserialize: (d) => ({ foo: foo.value, bar: d.bar }),
        update: (c) => {
          c.foo = foo.value;
          return c;
        },
      }));

      return (
        <button onClick$={() => foo.value++}>
          {foo.value} - {custom.value.foo} - {custom.value.bar}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0 - 0 - bar');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1 - 1 - bar');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('2 - 2 - bar');

    cleanup();
  });
});
