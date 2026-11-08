import { component$, useSignal, useStore, Slot, useAsync$ } from '@qwik.dev/core';
import { describe, expect, it, onTestFinished } from 'vitest';
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

describe(`${name}: render promise`, () => {
  it('should render promise', async () => {
    const TestCmp = component$(() => {
      const promise = Promise.resolve('PROMISE_VALUE');
      return <div>{promise}</div>;
    });

    const { container, cleanup } = await render(TestCmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('PROMISE_VALUE');
  });

  it('should handle thrown Promise', async () => {
    const Child = component$(() => {
      const value = useAsync$(async () => 'child');
      return value.value;
    });
    const Cmp = component$(() => {
      return (
        <div>
          <Child />
        </div>
      );
    });
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelector('div')).toHaveProperty('textContent', 'child');
  });

  it('should not duplicate projected element children when component throws a promise on first render', async () => {
    const Wrapper = component$(() => (
      <form>
        <Slot />
      </form>
    ));
    const Title = component$(() => <header>title</header>);
    const Footer = component$(() => <footer>footer</footer>);
    const Cmp = component$(() => {
      const store = useAsync$(async () => 'resolved');
      return (
        <Wrapper>
          <Title />
          <div class="fields">{store.value}</div>
          <Footer />
        </Wrapper>
      );
    });
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div.fields')).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelectorAll('footer')).toHaveLength(1);
  });

  it('should not duplicate named slot content when component throws a promise on first render', async () => {
    const Wrapper = component$(() => (
      <form>
        <section>
          <Slot name="top" />
        </section>
        <Slot />
      </form>
    ));
    const Title = component$(() => <header>title</header>);
    const Footer = component$(() => <footer>footer</footer>);
    const Cmp = component$(() => {
      const store = useAsync$(async () => 'resolved');
      return (
        <Wrapper>
          <div q:slot="top" class="banner">
            banner
          </div>
          <Title />
          <div class="fields">{store.value}</div>
          <Footer />
        </Wrapper>
      );
    });
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div.banner')).toHaveLength(1);
    expect(container.querySelectorAll('div.fields')).toHaveLength(1);
    expect(container.querySelectorAll('header')).toHaveLength(1);
    expect(container.querySelectorAll('footer')).toHaveLength(1);
  });
});
