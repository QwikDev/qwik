import { createContextId } from '@qwik.dev/core';
import { createContext, createContextProvider, useSignal, type Signal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { render: ssrRender }, //
  { render: csrRender }, //
])('$name: context', ({ render }) => {
  it('should provide and retrieve context', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-integration');
      const source = useSignal('provided');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <p>{context.value}</p>;
    };

    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');
    cleanup();
  });

  it('should keep retrieved context reactive', async () => {
    const MyComp = () => {
      const contextId = createContextId<Signal<string>>('context-reactive');
      const source = useSignal('before');
      createContextProvider(contextId, source);
      const context = createContext(contextId);

      return <button onClick$={() => (context.value = 'after')}>{context.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    const button = container.querySelector('button');

    expect(button?.textContent).toBe('before');
    expect(qwikLoader).toBeDefined();

    await qwikLoader?.dispatch(button!, 'click');

    expect(button?.textContent).toBe('after');

    cleanup();
  });

  it('should provide and retrieve context in nested component', async () => {
    const contextId = createContextId<Signal<string>>('context-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      createContextProvider(contextId, source);

      return <Child />;
    };

    const Child = () => {
      const context = createContext(contextId);
      return <p>{context.value}</p>;
    };
    const { container, cleanup } = await render(<MyComp />, { debug });

    expect(container.querySelector('p')?.textContent).toBe('provided');
    cleanup();
  });

  it('should provide and retrieve context in dynamic component', async () => {
    const contextId = createContextId<Signal<string>>('context-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      createContextProvider(contextId, source);
      const toggle = useSignal(false);

      return (
        <button onClick$={() => (toggle.value = !toggle.value)}>
          {toggle.value ? <Child /> : null}
        </button>
      );
    };

    const Child = () => {
      const context = createContext(contextId);
      return <span>{context.value}</span>;
    };
    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    expect(container.querySelector('span')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('should ignore closed nested context scopes for dynamic components', async () => {
    const contextId = createContextId<Signal<string>>('context-nearest-open');
    const MyComp = () => {
      const source = useSignal('outer');
      const toggle = useSignal(false);
      createContextProvider(contextId, source);

      return (
        <section>
          <Inner />
          <button onClick$={() => (toggle.value = true)}>
            {toggle.value ? <OuterChild /> : null}
          </button>
        </section>
      );
    };

    const Inner = () => {
      const source = useSignal('inner');
      createContextProvider(contextId, source);
      return <InnerChild />;
    };

    const InnerChild = () => {
      const context = createContext(contextId);
      return <span id="inner">{context.value}</span>;
    };

    const OuterChild = () => {
      const context = createContext(contextId);
      return <span id="outer">{context.value}</span>;
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    expect(container.querySelector('#inner')?.textContent).toBe('inner');
    expect(container.querySelector('#outer')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('#outer')?.textContent).toBe('outer');
    cleanup();
  });

  it('should provide and retrieve context in dynamic for block component', async () => {
    const contextId = createContextId<Signal<string>>('context-for-integration');
    const MyComp = () => {
      const source = useSignal('provided');
      const items = useSignal<string[]>([]);
      createContextProvider(contextId, source);

      return (
        <button onClick$={() => (items.value = ['child'])}>
          {items.value.map((item) => (
            <Child key={item} />
          ))}
        </button>
      );
    };

    const Child = () => {
      const context = createContext(contextId);
      return <span>{context.value}</span>;
    };

    const { container, cleanup, qwikLoader } = await render(<MyComp />, { debug });
    expect(container.querySelector('span')).toBeUndefined();

    const button = container.querySelector('button');
    await qwikLoader?.dispatch(button!, 'click');

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });
});
