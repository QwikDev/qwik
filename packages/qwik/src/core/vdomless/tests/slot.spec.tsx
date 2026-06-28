import { component$, createContextId, Slot } from '@qwik.dev/core';
import { createContext, createContextProvider, createSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: slot', ({ render }) => {
  it('projects default and named slots', async () => {
    const Card = component$(() => {
      return (
        <section>
          <header>
            <Slot name="header" />
          </header>
          <main>
            <Slot />
          </main>
        </section>
      );
    });

    const App = component$(() => {
      return (
        <Card>
          <h1 q:slot="header">Title</h1>
          <p>Body</p>
        </Card>
      );
    });

    const { container, cleanup } = await render(<App />, { debug });

    expect(container.querySelector('header')?.textContent).toBe('Title');
    expect(container.querySelector('main')?.textContent).toBe('Body');
    cleanup();
  });

  it('renders slot fallback when no projection exists', async () => {
    const Empty = component$(() => {
      return (
        <section>
          <Slot>
            <span>Fallback</span>
          </Slot>
        </section>
      );
    });

    const { container, cleanup } = await render(<Empty />, { debug });

    expect(container.querySelector('section')?.textContent).toBe('Fallback');
    cleanup();
  });

  it('renders slot after a dynamic SSR attr', async () => {
    const Button = component$((props: { id: string }) => {
      return (
        <button id={props.id}>
          <Slot />
        </button>
      );
    });

    const App = component$(() => {
      return <Button id="run">Run</Button>;
    });

    const { container, cleanup } = await render(<App />, { debug });

    expect(container.querySelector('#run')?.textContent).toBe('Run');
    cleanup();
  });

  it('provides parent context to projected slot children', async () => {
    const contextId = createContextId<string>('slot-parent-context');

    const Parent = component$(() => {
      createContextProvider(contextId, 'provided');
      return (
        <section>
          <Slot />
        </section>
      );
    });

    const Child = component$(() => {
      const value = createContext(contextId);
      return <span>{value}</span>;
    });

    const App = component$(() => {
      return (
        <Parent>
          <Child />
        </Parent>
      );
    });

    const { container, cleanup } = await render(<App />, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('provides app context to projected slot children', async () => {
    const contextId = createContextId<string>('slot-app-context');

    const Parent = component$(() => {
      return (
        <section>
          <Slot />
        </section>
      );
    });

    const Child = component$(() => {
      const value = createContext(contextId);
      return <span>{value}</span>;
    });

    const App = component$(() => {
      createContextProvider(contextId, 'provided');
      return (
        <Parent>
          <Child />
        </Parent>
      );
    });

    const { container, cleanup } = await render(<App />, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('toggles a projected slot after render', async () => {
    const Toggle = component$(() => {
      const shown = createSignal(true);
      return (
        <section>
          <button onClick$={() => (shown.value = !shown.value)}>toggle</button>
          {shown.value && <Slot />}
        </section>
      );
    });

    const App = component$(() => {
      return (
        <Toggle>
          <span id="projected">Projected</span>
        </Toggle>
      );
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(container.querySelector('#projected')?.textContent).toBe('Projected');

    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#projected')).toBeFalsy();

    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#projected')?.textContent).toBe('Projected');
    cleanup();
  });

  it('updates conditional content inside a projection', async () => {
    const Frame = component$(() => {
      return (
        <section>
          <Slot />
        </section>
      );
    });

    const App = component$(() => {
      const shown = createSignal(true);
      return (
        <Frame>
          <button onClick$={() => (shown.value = !shown.value)}>toggle</button>
          {shown.value && <span id="on">On</span>}
        </Frame>
      );
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(container.querySelector('#on')?.textContent).toBe('On');

    await qwikLoader?.dispatch(button, 'click');

    expect(container.querySelector('#on')).toBeFalsy();
    cleanup();
  });
});
