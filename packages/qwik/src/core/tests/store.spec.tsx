import { describe, expect, it } from 'vitest';
import { forceStoreEffects, unwrapStore, useStore } from '@qwik.dev/core';
import { testRenderer } from '../test-utils';
import { useComputed, useSignal } from '../reactive/public-api';
import { getStoreSources } from '../reactive/store';
import { createOwner, runWithOwner } from '../runtime/owner';

const debug = false;

describe('store runtime', () => {
  it('runs a factory once without tracking its reads', () => {
    const source = useSignal(2);
    let runs = 0;
    const state = createOwned(() =>
      useComputed(() =>
        useStore(() => {
          runs++;
          return { count: source.value };
        })
      )
    );

    expect(state.value.count).toBe(2);
    expect(state.value.count).toBe(2);
    expect(runs).toBe(1);
    expect(source.subs).toBeNull();
  });

  it('supports shallow and non-reactive stores', () => {
    const raw = { nested: { count: 0 } };
    const shallow = useStore(raw, { deep: false });
    const count = createOwned(() => useComputed(() => shallow.nested.count));

    expect(count.value).toBe(0);
    shallow.nested.count = 1;
    expect(count.value).toBe(0);

    shallow.nested = { count: 2 };
    expect(count.value).toBe(2);

    expect(useStore(raw, { reactive: false })).toBe(raw);
  });

  it('caches deep and shallow proxies independently', () => {
    const raw = { count: 0 };
    const deep = useStore(raw);
    const shallow = useStore(raw, { deep: false });

    expect(useStore(raw)).toBe(deep);
    expect(useStore(raw, { deep: false })).toBe(shallow);
    expect(shallow).not.toBe(deep);
  });

  it('unwraps deep, shallow, and nested proxies', () => {
    const nested = { count: 0 };
    const raw = { nested };
    const deep = useStore(raw);
    const shallow = useStore(raw, { deep: false });
    const plain = { value: 1 };

    expect(unwrapStore(deep)).toBe(raw);
    expect(unwrapStore(shallow)).toBe(raw);
    expect(unwrapStore(deep.nested)).toBe(nested);
    expect(unwrapStore(plain)).toBe(plain);
    expect(unwrapStore(1)).toBe(1);
  });

  it('forces only an existing store property source without allocating another source', () => {
    const raw = { count: 0, name: 'Qwik' };
    const state = useStore(raw);
    const nonReactive = useStore(raw, { reactive: false });
    let runs = 0;
    const count = createOwned(() =>
      useComputed(() => {
        runs++;
        return state.count;
      })
    );

    expect(count.value).toBe(0);
    expect(runs).toBe(1);
    expect([...getStoreSources(state)]).toHaveLength(1);

    forceStoreEffects(state, 'name');
    expect([...getStoreSources(state)]).toHaveLength(1);
    expect(count.value).toBe(0);
    expect(runs).toBe(1);

    forceStoreEffects(raw, 'count');
    forceStoreEffects(nonReactive, 'count');
    expect(count.value).toBe(0);
    expect(runs).toBe(1);

    forceStoreEffects(state, 'count');
    expect(count.value).toBe(0);
    expect(runs).toBe(2);
  });

  it('shares forced property notifications between deep and shallow proxies', () => {
    const raw = { count: 0 };
    const deep = useStore(raw);
    const shallow = useStore(raw, { deep: false });
    let runs = 0;
    const count = createOwned(() =>
      useComputed(() => {
        runs++;
        return deep.count;
      })
    );

    expect(count.value).toBe(0);
    expect(runs).toBe(1);

    forceStoreEffects(shallow, 'count');
    expect(count.value).toBe(0);
    expect(runs).toBe(2);
  });

  it('tracks shallow props without notifying unrelated props', () => {
    const state = useStore({ count: 0, name: 'Qwik' });
    let runs = 0;
    const count = createOwned(() =>
      useComputed(() => {
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
    const state = useStore({ user: { name: 'Ada' } });
    const name = createOwned(() => useComputed(() => state.user.name));

    expect(name.value).toBe('Ada');

    state.user.name = 'Grace';
    expect(name.value).toBe('Grace');

    state.user = { name: 'Evelyn' };
    expect(name.value).toBe('Evelyn');
  });

  it('tracks array indexes and length', () => {
    const state = useStore<{ items: string[] }>({ items: [] });
    const first = createOwned(() => useComputed(() => state.items[0]));
    const length = createOwned(() => useComputed(() => state.items.length));

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
    const state = useStore<{ a?: number; b?: number }>({ a: 1 });
    const hasA = createOwned(() => useComputed(() => 'a' in state));
    const hasB = createOwned(() => useComputed(() => 'b' in state));

    expect(hasA.value).toBe(true);
    expect(hasB.value).toBe(false);

    state.b = 2;
    expect(hasB.value).toBe(true);

    delete state.a;
    expect(hasA.value).toBe(false);
  });
});

const { name, render } = testRenderer;

describe(`${name}: stores`, () => {
  it('supports a store factory inside a custom hook', async () => {
    const useCounterStore = () => useStore(() => ({ count: 0 }));
    const App = () => {
      const state = useCounterStore();
      return <button onClick$={() => state.count++}>{state.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates shallow store text after an event', async () => {
    const App = () => {
      const state = useStore({ count: 0 });
      return <button onClick$={() => state.count++}>{state.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates deep store text after an event', async () => {
    const App = () => {
      const state = useStore({ deep: { count: 0 } });
      return <button onClick$={() => state.deep.count++}>{state.deep.count}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('resumes top-level subscriptions on a shallow store', async () => {
    const App = () => {
      const state = useStore({ nested: { count: 0 } }, { deep: false });
      return (
        <button onClick$={() => (state.nested = { count: state.nested.count + 1 })}>
          {state.nested.count}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates after mutating the unwrapped store and forcing its property', async () => {
    const App = () => {
      const state = useStore({ count: 0 });
      return (
        <button
          onClick$={() => {
            unwrapStore(state).count++;
            forceStoreEffects(state, 'count');
          }}
        >
          {state.count}
        </button>
      );
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
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
