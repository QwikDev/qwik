import { describe, expect, it } from 'vitest';
import { createStore } from '@qwik.dev/core/spark';
import { csrRender, ssrRender } from '../test-utils';
import { createComputed } from '../reactive/computed';
import { createOwner, runWithOwner } from '../runtime/owner';

const debug = false;

describe('vdomless store runtime', () => {
  it('tracks shallow props without notifying unrelated props', () => {
    const state = createStore({ count: 0, name: 'Qwik' });
    let runs = 0;
    const count = createOwned(() =>
      createComputed(() => {
        runs++;
        return state.count;
      })
    );

    expect(count.value).toBe(0);
    expect(runs).toBe(1);

    state.name = 'Spark';

    expect(count.value).toBe(0);
    expect(runs).toBe(1);

    state.count = 1;

    expect(count.value).toBe(1);
    expect(runs).toBe(2);
  });

  it('tracks deep props and parent replacement', () => {
    const state = createStore({ user: { name: 'Ada' } });
    const name = createOwned(() => createComputed(() => state.user.name));

    expect(name.value).toBe('Ada');

    state.user.name = 'Grace';
    expect(name.value).toBe('Grace');

    state.user = { name: 'Evelyn' };
    expect(name.value).toBe('Evelyn');
  });

  it('tracks array indexes and length', () => {
    const state = createStore<{ items: string[] }>({ items: [] });
    const first = createOwned(() => createComputed(() => state.items[0]));
    const length = createOwned(() => createComputed(() => state.items.length));

    expect(first.value).toBeUndefined();
    expect(length.value).toBe(0);

    state.items.push('a');

    expect(first.value).toBe('a');
    expect(length.value).toBe(1);

    state.items.length = 0;

    expect(first.value).toBeUndefined();
    expect(length.value).toBe(0);
  });

  it('tracks property existence', () => {
    const state = createStore<{ a?: number; b?: number }>({ a: 1 });
    const hasA = createOwned(() => createComputed(() => 'a' in state));
    const hasB = createOwned(() => createComputed(() => 'b' in state));

    expect(hasA.value).toBe(true);
    expect(hasB.value).toBe(false);

    state.b = 2;
    expect(hasB.value).toBe(true);

    delete state.a;
    expect(hasA.value).toBe(false);
  });
});

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: stores', ({ render }) => {
  it('updates shallow store text after an event', async () => {
    const App = () => {
      const state = createStore({ count: 0 });
      return <button onClick$={() => state.count++}>{state.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates deep store text after an event', async () => {
    const App = () => {
      const state = createStore({ deep: { count: 0 } });
      return <button onClick$={() => state.deep.count++}>{state.deep.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });
});

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}
