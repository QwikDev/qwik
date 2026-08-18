import { component$, createContextId, Slot } from '@qwik.dev/core';
import { useContext, useContextProvider, useSignal, useStore } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: slot`, () => {
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

    const { container, cleanup } = await render(App, { debug });

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

    const { container, cleanup } = await render(Empty, { debug });

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

    const { container, cleanup } = await render(App, { debug });

    expect(container.querySelector('#run')?.textContent).toBe('Run');
    cleanup();
  });

  it('provides parent context to projected slot children', async () => {
    const contextId = createContextId<string>('slot-parent-context');

    const Parent = component$(() => {
      useContextProvider(contextId, 'provided');
      return (
        <section>
          <Slot />
        </section>
      );
    });

    const Child = component$(() => {
      const value = useContext(contextId);
      return <span>{value}</span>;
    });

    const App = component$(() => {
      return (
        <Parent>
          <Child />
        </Parent>
      );
    });

    const { container, cleanup } = await render(App, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('provides parent context to a slot projected inside a branch', async () => {
    const contextId = createContextId<string>('slot-branch-context');

    const Projector = component$(() => {
      const shown = useSignal(false);
      return !shown.value ? <button onClick$={() => (shown.value = true)}>show</button> : <Slot />;
    });

    const Child = component$(() => {
      const value = useContext(contextId);
      return <span id="projected">{value}</span>;
    });

    const App = component$(() => {
      useContextProvider(contextId, 'provided');
      return (
        <Projector>
          <Child />
        </Projector>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    expect(container.querySelector('#projected')).toBeFalsy();

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('#projected')?.textContent).toBe('provided');
    cleanup();
  });

  it('provides parent context to every sibling projected inside a branch', async () => {
    const contextId = createContextId<string>('slot-branch-siblings-context');

    const Projector = component$(() => {
      const shown = useSignal(false);
      return !shown.value ? <button onClick$={() => (shown.value = true)}>show</button> : <Slot />;
    });

    const First = component$(() => {
      const value = useContext(contextId);
      return <span id="first">{value}</span>;
    });

    const Second = component$(() => {
      const value = useContext(contextId);
      return <span id="second">{value}</span>;
    });

    const App = component$(() => {
      useContextProvider(contextId, 'provided');
      return (
        <Projector>
          <First />
          <Second />
        </Projector>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    // The second sibling is projected after the first one resolves, on a separate code path.
    expect(container.querySelector('#first')?.textContent).toBe('provided');
    expect(container.querySelector('#second')?.textContent).toBe('provided');
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
      const value = useContext(contextId);
      return <span>{value}</span>;
    });

    const App = component$(() => {
      useContextProvider(contextId, 'provided');
      return (
        <Parent>
          <Child />
        </Parent>
      );
    });

    const { container, cleanup } = await render(App, { debug });

    expect(container.querySelector('span')?.textContent).toBe('provided');
    cleanup();
  });

  it('toggles a projected slot after render', async () => {
    const Toggle = component$(() => {
      const shown = useSignal(true);
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

    const { container, cleanup, qwikLoader } = await render(App, { debug });
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
      const shown = useSignal(true);
      return (
        <Frame>
          <button onClick$={() => (shown.value = !shown.value)}>toggle</button>
          {shown.value && <span id="on">On</span>}
        </Frame>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(container.querySelector('#on')?.textContent).toBe('On');

    await qwikLoader?.dispatch(button, 'click');

    expect(container.querySelector('#on')).toBeFalsy();
    cleanup();
  });
  // A consumer that re-renders must not dispose the content it is re-projecting.
  it('keeps projected content live across repeated consumer renders', async () => {
    const Switch = component$((props: { pick: string }) => {
      return <Slot name={props.pick} />;
    });

    const Panel = component$(({ count }: { count: number }) => {
      const store = useStore({ flip: false });
      return (
        <div id="panel">
          <button id="flip" onClick$={() => (store.flip = !store.flip)}>
            flip
          </button>
          <Switch pick={store.flip ? 'b' : 'a'}>
            <span q:slot="a">A {count}</span>
            <span q:slot="b">B {count}</span>
          </Switch>
        </div>
      );
    });

    const App = component$(() => {
      const state = useStore({ count: 0 });
      return (
        <div>
          <button id="inc" onClick$={() => state.count++}>
            inc
          </button>
          <Panel count={state.count} />
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const shown = () => container.querySelector('#panel')?.textContent?.replace('flip', '').trim();
    const flip = () => qwikLoader?.dispatch(container.querySelector('#flip')!, 'click');
    const inc = () => qwikLoader?.dispatch(container.querySelector('#inc')!, 'click');

    expect(shown()).toBe('A 0');

    await inc();
    expect(shown()).toBe('A 1');

    await flip();
    expect(shown()).toBe('B 1');

    await flip();
    expect(shown()).toBe('A 1');

    await inc();
    expect(shown()).toBe('A 2');

    cleanup();
  });
});
