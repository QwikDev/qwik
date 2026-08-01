import { component$, useSignal, useStore } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: promise`, () => {
  it('runs an event handler that captured a resolved promise', async () => {
    const App = component$(() => {
      const label = useSignal('initial');
      const promise = Promise.resolve('resolved');

      return (
        <button
          onClick$={async () => {
            label.value = await promise;
          }}
        >
          {label.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('initial');

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('resolved');

    cleanup();
  });

  it('runs an event handler that captured a rejected promise', async () => {
    const App = component$(() => {
      const label = useSignal('initial');
      const rejected = Promise.reject(new Error('failed message'));
      rejected.catch(() => null);

      return (
        <button
          onClick$={async () => {
            label.value = await rejected.catch((reason) => reason.message);
          }}
        >
          {label.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button');

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('failed message');

    cleanup();
  });

  it('runs an event handler that captured a promise held in a store', async () => {
    const App = component$(() => {
      const label = useSignal('initial');
      const store = useStore({ pending: Promise.resolve('from a store') });

      return (
        <button
          onClick$={async () => {
            label.value = await store.pending;
          }}
        >
          {label.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button');

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('from a store');

    cleanup();
  });

  it('runs an event handler that captured a promise inside an array', async () => {
    const App = component$(() => {
      const label = useSignal('initial');
      const pending = [Promise.resolve('from an array')];

      return (
        <button
          onClick$={async () => {
            label.value = await pending[0];
          }}
        >
          {label.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button');

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('from an array');

    cleanup();
  });

  it('runs an event handler that read a promise held in a signal', async () => {
    const App = component$(() => {
      const label = useSignal('initial');
      const pending = useSignal(Promise.resolve('from a signal'));

      return (
        <button
          onClick$={async () => {
            label.value = await pending.value;
          }}
        >
          {label.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button');

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('from a signal');

    cleanup();
  });
});
