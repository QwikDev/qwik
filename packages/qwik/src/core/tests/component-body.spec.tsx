import { $, component$, useSignal, type QRL } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

describe(`${name}: component bodies`, () => {
  it('uses the current mutable QRL binding for events', async () => {
    const App = component$((props: { mode: number }) => {
      const count = useSignal(0);
      let action: QRL<() => void> | null = $(() => {
        count.value++;
      });
      const replacement = $(() => {
        count.value += 2;
      });
      if (props.mode === 1) {
        action = replacement;
      } else if (props.mode === 2) {
        action = null;
      }
      return <button onClick$={action}>{count.value}</button>;
    });
    for (let mode = 0; mode < 3; mode++) {
      const { container, cleanup, qwikLoader } = await render(App, { props: { mode } });
      try {
        const button = container.querySelector('button')!;
        expect(button.textContent).toBe('0');
        await qwikLoader?.dispatch(button, 'click');
        expect(button.textContent).toBe(mode === 2 ? '0' : String(mode + 1));
        await qwikLoader?.dispatch(button, 'click');
        expect(button.textContent).toBe(mode === 2 ? '0' : String((mode + 1) * 2));
      } finally {
        cleanup();
      }
    }
  });

  it('preserves mutations in block conditions and thrown values', async () => {
    const App = component$(() => {
      try {
        let message;
        message = 'ready';
        let count = 0;
        count++;
        if (count === 1 && message === 'ready') {
          message = 'ok';
          throw new Error(message);
        }
      } catch (error) {
        return <p>{(error as Error).message}</p>;
      }
      return <p>bad</p>;
    });
    const { container, cleanup } = await render(App);
    expect(container.querySelector('p')?.textContent).toBe('ok');
    cleanup();
  });

  it('captures local values at each QRL creation', async () => {
    const App = component$(() => {
      const label = useSignal('ready');
      const initialize = () => {
        count = 2;
      };
      let count = 0;
      initialize();
      const first = $(() => {
        label.value = String(count);
      });
      count++;
      const second = $(() => {
        label.value = String(count);
      });
      return (
        <section>
          <button id="first" onClick$={first}>
            first
          </button>
          <button id="second" onClick$={second}>
            second
          </button>
          <p>{label.value}</p>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('#first')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('2');
    await qwikLoader?.dispatch(container.querySelector('#second')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('3');
    cleanup();
  });

  it('captures initialized values from separate block executions', async () => {
    const App = component$(() => {
      const label = useSignal('ready');
      const handlers: QRL<() => void>[] = [];
      let index = 0;
      while (index < 2) {
        let value = index++;
        value += 10;
        const handler = $(() => {
          label.value = String(value);
        });
        handlers.push(handler);
      }
      return (
        <section>
          <button id="first" onClick$={() => handlers[0]()}>
            first
          </button>
          <button id="second" onClick$={() => handlers[1]()}>
            second
          </button>
          <p>{label.value}</p>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    await qwikLoader?.dispatch(container.querySelector('#first')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('10');
    await qwikLoader?.dispatch(container.querySelector('#second')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('11');
    cleanup();
  });

  it('preserves empty returns, block scope and conditional rendering', async () => {
    const App = component$(({ mode }: { mode: number }) => {
      if (mode === 0) {
        return;
      }
      if (mode === 1) {
        return null;
      }
      if (mode === 2) {
        return undefined;
      }
      let label = 'out';
      label += 'er';
      {
        let label = 'inner';
        label += '!';
        if (mode === 3) {
          return <p>{label}</p>;
        }
      }
      if (mode === 4) {
        return <b>{label}</b>;
      } else {
        throw new Error('invalid mode');
      }
    });
    for (let mode = 0; mode <= 4; mode++) {
      const { container, cleanup } = await render(App, { props: { mode } });
      expect(container.querySelector('p, b')?.textContent ?? '').toBe(
        mode === 3 ? 'inner!' : mode === 4 ? 'outer' : ''
      );
      cleanup();
    }
    await expect(render(App, { props: { mode: 5 } })).rejects.toThrow('invalid mode');
  });

  it('shares explicit object state across handlers and setup mutations', async () => {
    const App = component$(() => {
      const state = { count: 1, suffix: '!' };
      const label = useSignal('ready');
      const increment = $(() => {
        state.count++;
      });
      state.count = 4;
      function format(value: number) {
        return String(value);
      }
      label.value = format(state.count);
      return (
        <section>
          <button id="increment" onClick$={increment}>
            increment
          </button>
          <button
            id="read"
            onClick$={() => {
              label.value = state.count + state.suffix;
              state.suffix += '!';
            }}
          >
            read
          </button>
          <p>{label.value}</p>
        </section>
      );
    });
    const { container, cleanup, qwikLoader } = await render(App);
    expect(container.querySelector('p')?.textContent).toBe('4');
    await qwikLoader?.dispatch(container.querySelector('#increment')!, 'click');
    await qwikLoader?.dispatch(container.querySelector('#read')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('5!');
    await qwikLoader?.dispatch(container.querySelector('#read')!, 'click');
    expect(container.querySelector('p')?.textContent).toBe('5!!');
    cleanup();
  });

  it('renders a conditional return with a local component and event capture', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      function Child() {
        return <button onClick$={() => count.value++}>{count.value}</button>;
      }
      try {
        if (count.value === 0) {
          return <Child />;
        }
        return null;
      } finally {
        count.value = 1;
      }
    });
    const { container, cleanup, qwikLoader } = await render(App);
    const button = container.querySelector('button')!;
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('2');
    cleanup();
  });
});
