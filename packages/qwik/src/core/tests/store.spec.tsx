import { describe, expect, it, onTestFinished } from 'vitest';
import {
  forceStoreEffects,
  unwrapStore,
  useStore,
  component$,
  useComputed$,
  untrack,
  useTask$,
  useVisibleTask$,
  type EventHandler,
  type PropsOf,
} from '@qwik.dev/core';
import { testRenderer } from '../test-utils';
import { useComputed, useSignal } from '../reactive/public-api';
import { getStoreSources } from '../reactive/store';
import { createOwner, runWithOwner } from '../runtime/owner';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';

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

  it('reads frozen objects through a deep store without wrapping them', () => {
    // a proxy must hand back the exact value of a frozen target's property, or the read throws
    const menu = Object.freeze({ items: Object.freeze([{ title: 'Docs' }]) });
    expect(useStore(menu).items).toBe(menu.items);
    expect(useStore({ menu }).menu).toBe(menu);
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

  it('tracks key enumeration only for added and removed keys', () => {
    const state = useStore<Record<string, number>>({ a: 1 });
    let runs = 0;
    const keys = createOwned(() =>
      useComputed(() => {
        runs++;
        return Object.keys(state).join(',');
      })
    );

    expect(keys.value).toBe('a');
    state.a = 2;
    expect(keys.value).toBe('a');
    expect(runs).toBe(1);

    state.b = 3;
    expect(keys.value).toBe('a,b');
    delete state.a;
    expect(keys.value).toBe('b');
    expect(runs).toBe(3);
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

  it('renders a key added to the store after an event', async () => {
    const App = () => {
      const state = useStore<Record<string, number>>({ a: 1 });
      return (
        <>
          <button onClick$={() => (state[`k${Object.keys(state).length}`] = 1)} />
          <ul>
            {Object.entries(state).map(([key, value]) => (
              <li key={key}>
                {key}={value}
              </li>
            ))}
          </ul>
        </>
      );
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;
    const rows = () => Array.from(container.querySelectorAll('li'), (li) => li.textContent);

    expect(rows()).toEqual(['a=1']);
    await qwikLoader?.dispatch(button, 'click');
    expect(rows()).toEqual(['a=1', 'k1=1']);
    await qwikLoader?.dispatch(button, 'click');
    expect(rows()).toEqual(['a=1', 'k1=1', 'k2=1']);

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

  it('keeps destructured members live when the slot is replaced', async () => {
    const App = () => {
      const store = useStore({ item: { label: 'first' } });
      const { item } = store;
      return <button onClick$={() => (store.item = { label: 'second' })}>{item.label}</button>;
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('first');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('second');

    cleanup();
  });

  it('renders members destructured directly off a hook call through the compiler temp', async () => {
    const App = () => {
      const { item } = useStore({ item: { label: 'pinned' } });
      return <p>{item.label}</p>;
    };

    const { container, cleanup } = await render(App, { debug });

    expect(container.querySelector('p')?.textContent).toBe('pinned');

    cleanup();
  });

  // A prop derived from a store stays reactive only when the store read is proven, so it
  // rides the sources map instead of serializing as a snapshot.
  it('keeps a prop derived from a store reactive', async () => {
    const Child = (props: { value: string }) => <p id="out">{props.value}</p>;
    const App = () => {
      const store = useStore({ flip: false });
      return (
        <div>
          <button onClick$={() => (store.flip = !store.flip)}>toggle</button>
          <Child value={store.flip ? 'b' : 'a'} />
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(container.querySelector('#out')?.textContent).toBe('a');
    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#out')?.textContent).toBe('b');

    cleanup();
  });

  // A destructured alias is still the same store, so the read stays proven through it.
  it('keeps a prop derived from a destructured store alias reactive', async () => {
    const Child = (props: { value: string }) => <p id="out">{props.value}</p>;
    const App = () => {
      const store = useStore({ nested: { flip: false } });
      const { nested } = store;
      return (
        <div>
          <button onClick$={() => (nested.flip = !nested.flip)}>toggle</button>
          <Child value={nested.flip ? 'b' : 'a'} />
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    expect(container.querySelector('#out')?.textContent).toBe('a');
    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#out')?.textContent).toBe('b');

    cleanup();
  });
});

function createOwned<T>(run: () => T): T {
  return runWithOwner(createOwner(null), run);
}

describe(`${name}: useStore`, () => {
  it('should render value', async () => {
    const Cmp = component$(() => {
      const store = useStore({ items: [{ num: 0 }] });
      return (
        <>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
      );
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('0');
  });
  it('should update value', async () => {
    const Counter = component$(() => {
      const count = useStore({ count: 123 });
      return <button onClick$={() => count.count++}>Count: {count.count}!</button>;
    });

    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 123!');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 124!');
  });
  it('should update deep value', async () => {
    const Counter = component$(() => {
      const count = useStore({ obj: { count: 123 } });
      return <button onClick$={() => count.obj.count++}>Count: {count.obj.count}!</button>;
    });

    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 123!');
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Count: 124!');
  });

  it('should update array value', async () => {
    const Counter = component$(() => {
      const count = useStore([123]);
      return <button onClick$={() => count[0]++}>Count: {count[0]}!</button>;
    });

    const { container, cleanup, flush } = await render(Counter, { debug });
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
      const count = useStore({ obj: { value: props.initial } });
      return (
        <button onClick$={() => count.obj.value++}>
          <Display dValue={count.obj.value} />
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
  describe('derived', () => {
    it('should update value directly in DOM', async () => {
      (globalThis as any).__mainTestLog = [];
      const Counter = component$((props: { initial: number }) => {
        const count = useStore({ value: props.initial });
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
    it('should update value when store, update and render are separated', async () => {
      (globalThis as any).renderLog = [];
      const Display = component$((props: { displayValue: number }) => {
        (globalThis as any).renderLog.push('Display');
        return <>Count: {props.displayValue}!</>;
      });
      const Incrementor = component$((props: { countSignal: { value: number } }) => {
        (globalThis as any).renderLog.push('Incrementor');
        return (
          <button
            onClick$={() => {
              const signal = props.countSignal;
              signal.value++;
            }}
          >
            +1
          </button>
        );
      });
      const Counter = component$(() => {
        (globalThis as any).renderLog.push('Counter');
        const count = useStore({ value: 123 });
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

    it('should rerender inner component with store as a prop', async () => {
      interface InnerButtonProps {
        text: string;
        isActive: boolean;
        onClick$: PropsOf<'button'>['onClick$'];
      }
      const InnerButton = component$((props: InnerButtonProps) => {
        return (
          <button
            key={props.text}
            class={{ 'active-tab': props.isActive, 'repl-tab-button': true }}
            onClick$={props.onClick$}
          >
            {props.text}
          </button>
        );
      });

      const InnerButtonWrapper = component$((props: { data: any }) => {
        return (
          <InnerButton
            text="Options"
            isActive={props.data.selectedOutputDetail === 'options'}
            onClick$={() => {
              props.data.selectedOutputDetail = 'options';
            }}
          />
        );
      });

      const Parent = component$(() => {
        const store = useStore({
          selectedOutputDetail: 'console',
        });

        return <InnerButtonWrapper data={store} />;
      });

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Options');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'repl-tab-button'
      );

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Options');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'active-tab repl-tab-button'
      );
    });

    it('should rerender inner inline component with destructured props', async () => {
      interface InnerButtonProps {
        text: string;
        isActive: boolean;
        onClick$: EventHandler<MouseEvent, HTMLButtonElement>;
      }

      const Parent = component$(() => {
        const store = useStore({
          selectedOutputDetail: 'console',
        });

        const InnerButton = (props: InnerButtonProps) => {
          return (
            <button
              key={props.text}
              class={{ 'active-tab': props.isActive, 'repl-tab-button': true }}
              onClick$={props.onClick$}
            >
              {props.text}
            </button>
          );
        };

        const InnerButtonWrapper = ({ data }: { data: any }) => {
          return (
            <InnerButton
              text="Options"
              isActive={data.selectedOutputDetail === 'options'}
              onClick$={() => {
                data.selectedOutputDetail = 'options';
              }}
            />
          );
        };

        return <InnerButtonWrapper data={store} />;
      });

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Options');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'repl-tab-button'
      );

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Options');
      expect(container.querySelector('button')!.getAttribute('class')?.trim() ?? '').toBe(
        'active-tab repl-tab-button'
      );
    });
  });

  describe('SerializationConstant at the start', () => {
    it('should set the value with SerializationConstant at the start for initial empty value', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '' });
        return <button onClick$={() => (data.logs = '\n test')}>Data: {data.logs}!</button>;
      });

      const { container, cleanup, flush } = await render(DataCmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: !');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: \n test!');
    });

    it('should set the value with SerializationConstant at the start', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '\n abcd' });
        return <button onClick$={() => (data.logs = '\n test')}>Data: {data.logs}!</button>;
      });

      const { container, cleanup, flush } = await render(DataCmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: \n abcd!');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: \n test!');
    });

    it('should update the value with SerializationConstant at the start', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: '\n abcd' });
        return <button onClick$={() => (data.logs += '\n test')}>Data: {data.logs}!</button>;
      });

      const { container, cleanup, flush } = await render(DataCmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: \n abcd!');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data: \n abcd\n test!');
    });

    it('should push the value with SerializationConstant at the start to array', async () => {
      const DataCmp = component$(() => {
        const data = useStore({ logs: ['\n abcd'] });
        return (
          <button onClick$={() => data.logs.push('\n test')}>
            Data:
            {data.logs.map((d) => (
              <span>{d}</span>
            ))}
            !
          </button>
        );
      });

      const { container, cleanup, flush } = await render(DataCmp, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data:\n abcd!');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('\n abcd');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Data:\n abcd\n test!');
      expect(container.querySelectorAll('span')).toHaveLength(2);
      expect(container.querySelector('span')!.textContent).toBe('\n abcd');
      expect(container.querySelectorAll('span')[1]!.textContent).toBe('\n test');
    });
  });

  it('should deep watch store', async () => {
    const Cmp = component$(() => {
      const store = useStore({
        nested: {
          fields: { are: 'also tracked' },
        },
        list: ['Item 1'],
      });

      return (
        <>
          <p>{store.nested.fields.are}</p>
          <button
            id="tracked"
            onClick$={() => {
              // Even though we are mutating a nested object, this will trigger a re-render
              store.nested.fields.are = 'tracked';
            }}
          ></button>
          <button
            id="add-item"
            onClick$={() => {
              // Because store is deep watched, this will trigger a re-render
              store.list.push(`Item ${store.list.length}`);
            }}
          ></button>
          <ul>
            {store.list.map((item, key) => (
              <li key={key}>{item}</li>
            ))}
          </ul>
        </>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')!.textContent).toBe('also tracked');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('tracked');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('add-item');
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelector('ul')!.textContent).toBe('Item 1');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelector('li')!.textContent).toBe('Item 1');
    await trigger(container, 'button#add-item', 'click');
    await flush();
    await trigger(container, 'button#add-item', 'click');
    await flush();
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p')!.textContent).toBe('also tracked');
    expect(container.querySelectorAll('button')).toHaveLength(2);
    expect(container.querySelector('button')!.textContent).toBe('');
    expect(container.querySelector('button')!.getAttribute('id')).toBe('tracked');
    expect(container.querySelectorAll('button')[1]!.textContent).toBe('');
    expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('add-item');
    expect(container.querySelectorAll('ul')).toHaveLength(1);
    expect(container.querySelector('ul')!.textContent).toBe('Item 1Item 1Item 2');
    expect(container.querySelectorAll('li')).toHaveLength(3);
    expect(container.querySelector('li')!.textContent).toBe('Item 1');
    expect(container.querySelectorAll('li')[1]!.textContent).toBe('Item 1');
    expect(container.querySelectorAll('li')[2]!.textContent).toBe('Item 2');
  });

  it('should render value via JSON.stringify', async () => {
    const Stringify = component$<{
      data: any;
      style?: any;
    }>((props) => {
      return <>{JSON.stringify(props.data)}</>;
    });

    const Cmp = component$(() => {
      const group = useStore({
        controls: {
          ctrl: {
            value: '',
          },
        },
      });

      return (
        <button onClick$={() => (group.controls.ctrl.value = 'test')}>
          <Stringify data={group} />
          <Stringify data={group.controls} />
          <Stringify data={group.controls.ctrl} />
          <Stringify data={group.controls.ctrl.value} />
        </button>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe(
      '{"controls":{"ctrl":{"value":""}}}{"ctrl":{"value":""}}{"value":""}""'
    );
    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe(
      '{"controls":{"ctrl":{"value":"test"}}}{"ctrl":{"value":"test"}}{"value":"test"}"test"'
    );
  });

  it('should work with frozen store', async () => {
    const Cmp = component$(() => {
      const store = useStore({ items: [{ num: 0 }] });
      Object.freeze(store);
      return (
        <>
          {store.items.map((item, key) => (
            <div key={key}>{item.num}</div>
          ))}
        </>
      );
    });

    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('0');
  });

  it('should deserialize store without effects', async () => {
    const Cmp = component$(() => {
      const store = useStore({ counter: 0 });
      useVisibleTask$(() => {
        store.counter++;
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

  it('should assign a store property to undefined', async () => {
    (global as any).logs = [] as string[];

    const Cmp = component$(() => {
      const store = useStore<Record<string, any>>({});
      useTask$(() => {
        store.someId;
        (global as any).logs.push('someId' in store);
      });

      return <button onClick$={() => (store['someId'] = undefined)}></button>;
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'button', 'click');
    await flush();
    expect((global as any).logs).toEqual([false, true]);
  });

  it('should trigger effects on property delete', async () => {
    const Cmp = component$(() => {
      const store = useStore<{ delete?: string }>({ delete: 'test' });
      return <div onClick$={() => delete store.delete}>{store.delete}</div>;
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('test');
    await triggerAll(container, 'div', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('');
  });

  it('should update deep nested array of arrays inside object with inner component', async () => {
    const Item = component$(({ item }: any) => {
      return (
        <div id={item.id} onClick$={() => (item.completed = true)}>
          {item.title}
        </div>
      );
    });

    const Cmp = component$(() => {
      const todos = useStore(
        {
          filter: 'all',
          items: [
            { completed: false, title: 'Read Qwik docs', id: '0' },
            { completed: false, title: 'Build HelloWorld', id: '1' },
            { completed: false, title: 'Profit', id: '2' },
          ],
        },
        { deep: true }
      );
      const remaining = useComputed$(
        () => todos.items.filter((item) => item.completed === false).length
      );

      return (
        <div>
          {remaining.value}
          {todos.items.map((item, key) => (
            <Item key={key} item={item} />
          ))}
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe(
      '3Read Qwik docsBuild HelloWorldProfit'
    );
    expect(container.querySelector('div')!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Read Qwik docs');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe('0');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Build HelloWorld');
    expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe('1');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Profit');
    expect(container.querySelectorAll('div')[3]!.getAttribute('id')).toBe('2');

    await trigger(container, 'div[id="0"]', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(4);
    expect(container.querySelector('div')!.textContent).toBe(
      '2Read Qwik docsBuild HelloWorldProfit'
    );
    expect(container.querySelector('div')!.getAttribute('id')).toBe(null);
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Read Qwik docs');
    expect(container.querySelectorAll('div')[1]!.getAttribute('id')).toBe('0');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Build HelloWorld');
    expect(container.querySelectorAll('div')[2]!.getAttribute('id')).toBe('1');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Profit');
    expect(container.querySelectorAll('div')[3]!.getAttribute('id')).toBe('2');
  });
  it('should update deep nested array of arrays inside object', async () => {
    const Cmp = component$(() => {
      const todos = useStore(
        {
          filter: 'all',
          items: [
            { completed: false, title: 'Read Qwik docs', id: '0' },
            { completed: false, title: 'Build HelloWorld', id: '1' },
            { completed: false, title: 'Profit', id: '2' },
          ],
        },
        { deep: true }
      );
      const remaining = useComputed$(
        () => todos.items.filter((item) => item.completed === false).length
      );

      return (
        <div>
          {remaining.value}
          <button onClick$={() => (todos.items[0].completed = true)}></button>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('3');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('div')).toHaveLength(1);
    expect(container.querySelector('div')!.textContent).toBe('2');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('');
  });

  describe('regression', () => {
    it('#5597 - should update value', async () => {
      (globalThis as any).clicks = 0;
      const Issue5597 = component$(() => {
        const count = useSignal(0);
        const store = useStore({ items: [{ num: 0 }] });
        return (
          <>
            <button
              onClick$={() => {
                count.value++;
                store.items = store.items.map((i: { num: number }) => ({ num: i.num + 1 }));
                (globalThis as any).clicks++;
              }}
            >
              Count: {count.value}!
            </button>
            {store.items.map((item, key) => (
              <div key={key}>{item.num}</div>
            ))}
          </>
        );
      });

      const { container, cleanup, flush } = await render(Issue5597, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe(
        'Count: ' + String((globalThis as any).clicks) + '!'
      );
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe(String((globalThis as any).clicks));
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe(
        'Count: ' + String((globalThis as any).clicks) + '!'
      );
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe(String((globalThis as any).clicks));
    });

    it('#5017 - should update child nodes for direct array', async () => {
      const Child = component$<{ columns: string }>(({ columns }) => {
        return <div>Child: {columns}</div>;
      });

      const Parent = component$(() => {
        const state = useStore([{ columns: 'INITIAL' }]);
        return (
          <>
            <button onClick$={() => (state[0] = { columns: 'UPDATE' })}>update!</button>
            <Child columns={state[0].columns} />
            {state.map((block, idx) => {
              return <Child columns={block.columns} key={idx} />;
            })}
          </>
        );
      });

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('update!');
      expect(container.querySelectorAll('div')).toHaveLength(2);
      expect(container.querySelector('div')!.textContent).toBe('Child: INITIAL');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('Child: INITIAL');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('update!');
      expect(container.querySelectorAll('div')).toHaveLength(2);
      expect(container.querySelector('div')!.textContent).toBe('Child: UPDATE');
      expect(container.querySelectorAll('div')[1]!.textContent).toBe('Child: UPDATE');
    });

    it('#5001 - should serialize naked value', async () => {
      const Button = component$<{ unusedValue?: [number]; state: [number] }>(({ state }) => {
        return (
          <div>
            <button onClick$={() => state[0]++}>+1</button>
          </div>
        );
      });
      const Parent = component$<{ nakedState: [number] }>(({ nakedState }) => {
        // STEP 2
        // We wrap the `nakedState` into `state`.
        // This means that Qwik needs to serialize the Proxy for the `nakedState`.
        const state = useStore(nakedState);
        // const signal = useSignal(0);
        return (
          <>
            <Button
              // STEP 3
              // Uncommenting the next line breaks the code. (UI no longer updates)
              // This seems te be because Qwik somehow gets confused between the two
              // objects and assumes that `state` is no longer a proxy hence no
              // subscription
              //
              unusedValue={nakedState}
              state={state}
            />
            Count: <span>{state[0]}</span>
          </>
        );
      });
      const Issue5001 = component$(() => {
        const nakedState: [number] = [0];
        // STEP 1
        // By passing the `nakedState` into a child component, we force
        // Qwik to serialize `nakedState` into `qwik/json`
        return <Parent nakedState={nakedState} />;
      });

      const { container, cleanup, flush } = await render(Issue5001, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('+1');
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('+1');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('0');

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('+1');
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('+1');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('1');
    });
  });
});
