import {
  component$,
  Pending,
  useAsync$,
  untrack,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  Slot,
  type Signal as SignalType,
} from '@qwik.dev/core';
import { describe, expect, it, vi, afterEach, onTestFinished } from 'vitest';
import { testRenderer } from '../test-utils';
import { triggerAll } from './test-hooks';
import { trigger } from '@qwik.dev/core/testing';
import { delay } from '../shared/utils/promises';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: task`, () => {
  it('retries a task that reads a pending async value', async () => {
    const App = component$(() => {
      const seen = useSignal('none');
      const bump = useSignal(0);
      const data = useAsync$((ctx): string | Promise<string> => {
        if (ctx.track(bump) === 0) {
          return 'first';
        }
        return new Promise<string>((resolve) => setTimeout(() => resolve('second'), 20));
      });
      useTask$(() => {
        seen.value = data.value;
      });
      return (
        <button
          onClick$={() => {
            // mirror the route-loader refresh: bump the input and drop the cached value
            bump.value++;
            data.clear();
          }}
        >
          {seen.value}
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('first');

    // the pending read must retry, not reject through the scheduler as an error
    const consoleError = vi.spyOn(console, 'error');
    await qwikLoader?.dispatch(button, 'click');

    await vi.waitFor(() => expect(button.textContent).toBe('second'), { timeout: 5000 });
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();

    cleanup();
  });

  it('task executes async task before initial render settles', async () => {
    const App = component$(() => {
      const value = useSignal('wrong');

      useTask$(
        async () => {
          await Promise.resolve();
          value.value = 'WORKS';
        },
        { deferUpdates: false }
      );

      return <span>{value.value}</span>;
    });

    const { container, cleanup, flush } = await render(App, { debug });
    await flush();

    expect(container.querySelector('span')?.textContent).toBe('WORKS');

    cleanup();
  });

  it('task runs tasks in order and awaits async tasks', async () => {
    (globalThis as any).__taskOrder = [] as string[];

    const App = component$(() => {
      const ready = useSignal('pending');

      useTask$(async () => {
        (globalThis as any).__taskOrder.push('1:start');
        await Promise.resolve();
        (globalThis as any).__taskOrder.push('1:done');
      });

      useTask$(async () => {
        (globalThis as any).__taskOrder.push('2:start');
        await Promise.resolve();
        (globalThis as any).__taskOrder.push('2:done');
        ready.value = 'done';
      });

      return <span>{ready.value}</span>;
    });

    const { container, cleanup, flush } = await render(App, { debug });
    await flush();

    expect((globalThis as any).__taskOrder).toEqual(['1:start', '1:done', '2:start', '2:done']);
    expect(container.querySelector('span')?.textContent).toBe('done');

    delete (globalThis as any).__taskOrder;
    cleanup();
  });

  it('finishes a parent task before child setup', async () => {
    (globalThis as any).__taskOrder = [] as string[];

    const Child = component$(() => {
      (globalThis as any).__taskOrder.push('child:setup');
      return <span>child</span>;
    });
    const App = component$(() => {
      useTask$(async () => {
        (globalThis as any).__taskOrder.push('parent:start');
        await Promise.resolve();
        (globalThis as any).__taskOrder.push('parent:done');
      });
      return <Child />;
    });

    const { cleanup } = await render(App, { debug });

    expect((globalThis as any).__taskOrder).toEqual(['parent:start', 'parent:done', 'child:setup']);

    delete (globalThis as any).__taskOrder;
    cleanup();
  });

  it.runIf(testRenderer.name === 'csrRender')(
    'renders fallback while initial task work is pending',
    async () => {
      const Child = component$(() => {
        useTask$(
          () =>
            new Promise<void>((resolve) => {
              (globalThis as any).__resolveSuspenseTask = resolve;
            })
        );
        return <span id="ready">ready</span>;
      });
      const App = component$(() => (
        <Pending fallback$={(() => <span id="loading">loading</span>) as any}>
          <Child />
        </Pending>
      ));

      const { container, cleanup, flush } = await render(App, { debug });

      expect(container.textContent).toBe('loading');

      // Pending content starts off the flush, so its task may not have registered yet.
      await vi.waitFor(() =>
        expect(typeof (globalThis as any).__resolveSuspenseTask).toBe('function')
      );
      (globalThis as any).__resolveSuspenseTask();
      await flush();
      await vi.waitFor(() => expect(container.textContent).toBe('ready'));

      delete (globalThis as any).__resolveSuspenseTask;
      cleanup();
    }
  );

  it('task tracks signal reads before and after await', async () => {
    const App = component$(() => {
      const before = useSignal(0);
      const after = useSignal(10);
      const label = useSignal('');

      useTask$(async () => {
        const left = before.value;
        await Promise.resolve();
        label.value = `${left}:${after.value}`;
      });

      return (
        <section>
          <button id="before" onClick$={() => before.value++}>
            before
          </button>
          <button id="after" onClick$={() => after.value++}>
            after
          </button>
          <p>{label.value}</p>
        </section>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const before = container.querySelector('#before')!;
    const after = container.querySelector('#after')!;

    expect(container.querySelector('p')?.textContent).toBe('0:10');

    await qwikLoader?.dispatch(before, 'click');
    expect(container.querySelector('p')?.textContent).toBe('1:10');

    await qwikLoader?.dispatch(after, 'click');
    expect(container.querySelector('p')?.textContent).toBe('1:11');

    cleanup();
  });

  it('task runs cleanup before rerun', async () => {
    (globalThis as any).__taskCleanup = [] as string[];

    const App = component$(() => {
      const count = useSignal(0);

      useTask$(() => {
        const value = count.value;
        (globalThis as any).__taskCleanup.push(`task:${value}`);
        return () => {
          (globalThis as any).__taskCleanup.push(`cleanup:${value}`);
        };
      });

      return <button onClick$={() => count.value++}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'click');

    expect((globalThis as any).__taskCleanup).toContain('task:0');
    expect((globalThis as any).__taskCleanup).toContain('task:1');
    expect((globalThis as any).__taskCleanup).toContain('cleanup:1');
    expect((globalThis as any).__taskCleanup.at(-1)).toBe('task:2');

    cleanup();
    delete (globalThis as any).__taskCleanup;
  });

  it('server task cleanups run before the state is serialized', async () => {
    const Child = component$((props: { log: { value: string } }) => {
      useTask$(({ cleanup }) => {
        cleanup(() => {
          props.log.value += 'cleanup';
        });
      });
      return <span>Child</span>;
    });

    const App = component$(() => {
      const log = useSignal('');
      const shown = useSignal('');
      return (
        <button onClick$={() => (shown.value = log.value)}>
          <Child log={log} />
          <b>{shown.value}</b>
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('b')?.textContent).toBe(name === 'ssrRender' ? 'cleanup' : '');

    cleanup();
  });

  it('server computed cleanups run before the state is serialized', async () => {
    const Child = component$((props: { log: { value: string } }) => {
      const doubled = useComputed$<number>(({ cleanup }) => {
        cleanup(() => {
          props.log.value += 'computed';
        });
        return 2;
      });
      return <span>{doubled.value}</span>;
    });

    const App = component$(() => {
      const log = useSignal('');
      const shown = useSignal('');
      return (
        <button onClick$={() => (shown.value = log.value)}>
          <Child log={log} />
          <b>{shown.value}</b>
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    expect(container.querySelector('b')?.textContent).toBe(name === 'ssrRender' ? 'computed' : '');

    cleanup();
  });

  it('a branch swap keeps the previous arm visible task and computed live until the commit', async () => {
    const Arm = component$((props: { name: string; log: { value: string } }) => {
      useVisibleTask$(({ cleanup }) => {
        cleanup(() => {
          props.log.value += `-v${props.name}`;
        });
      });
      const label = useComputed$<string>(({ cleanup }) => {
        cleanup(() => {
          props.log.value += `-c${props.name}`;
        });
        return props.name;
      });
      useTask$(() => {
        props.log.value += `+${props.name}`;
      });
      return <span>{label.value}</span>;
    });

    const App = component$(() => {
      const showA = useSignal(false);
      const log = useSignal('');
      return (
        <button onClick$={() => (showA.value = !showA.value)}>
          {showA.value ? <Arm name="A" log={log} /> : <Arm name="B" log={log} />}
          <b>{log.value}</b>
        </button>
      );
    });

    const { container, cleanup, qwikLoader, flush } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('span')!, 'qvisible');
    await flush();
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    const log = container.querySelector('b')!.textContent!;
    expect(log.indexOf('-vB')).toBeGreaterThan(-1);
    expect(log.indexOf('-cB')).toBeGreaterThan(-1);
    // the shown arm stays live until the next arm replaces it; SSR ran its computed cleanup
    const swap = log.slice(log.indexOf('+A'));
    expect(swap).toContain('-vB');
    expect(swap.includes('-cB')).toBe(name !== 'ssrRender');

    cleanup();
  });

  it('a branch swap runs the previous arm cleanups when the next arm commits', async () => {
    const Arm = component$((props: { name: string; log: { value: string } }) => {
      useTask$(({ cleanup }) => {
        props.log.value += `+${props.name}`;
        cleanup(() => {
          props.log.value += `-${props.name}`;
        });
      });
      return <span>{props.name}</span>;
    });

    const App = component$(() => {
      const showA = useSignal(true);
      const log = useSignal('');
      return (
        <button onClick$={() => (showA.value = !showA.value)}>
          {showA.value ? <Arm name="A" log={log} /> : <Arm name="B" log={log} />}
          <b>{log.value}</b>
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;
    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'click');

    const log = container.querySelector('b')!.textContent!;
    expect(log.slice(log.lastIndexOf('+A'))).toBe('+A-B');

    cleanup();
  });

  it('task runs cleanup on unmount after client activation', async () => {
    const Child = component$((props: { cleanupCount: { value: number } }) => {
      useTask$(({ cleanup }) => {
        cleanup(() => {
          props.cleanupCount.value++;
        });
      });

      return <span>Child</span>;
    });

    const App = component$(() => {
      const show = useSignal(true);
      const cleanupCount = useSignal(0);

      return (
        <button onClick$={() => (show.value = !show.value)}>
          {show.value ? <Child cleanupCount={cleanupCount} /> : 'empty'}
          <b>{cleanupCount.value}</b>
        </button>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'click');

    // resume adds the server cleanup, which ran before the state was serialized
    expect(container.querySelector('b')?.textContent).toBe('2');

    cleanup();
  });

  it('task updates multiple signals after await', async () => {
    const App = component$(() => {
      const count = useSignal(1);
      const items = useSignal<number[]>([]);

      useTask$(async () => {
        await Promise.resolve();
        items.value = [1, 2, 3];
        count.value = 2;
      });

      return (
        <div>
          <span>{count.value}</span>
          <ul>
            {items.value.map((item) => (
              <li key={item}>Item: {item}</li>
            ))}
          </ul>
        </div>
      );
    });

    const { container, cleanup, flush } = await render(App, { debug });
    await flush();

    expect(container.querySelector('span')?.textContent).toBe('2');
    expect(Array.from(container.querySelectorAll('li')).map((li) => li.textContent)).toEqual([
      'Item: 1',
      'Item: 2',
      'Item: 3',
    ]);

    cleanup();
  });

  it('task rerenders component after task mutation', async () => {
    const App = component$(() => {
      const sort = useSignal<'id' | 'size'>('size');
      const rows = [
        { id: 1, size: 4 },
        { id: 2, size: 3 },
        { id: 3, size: 2 },
        { id: 4, size: 1 },
      ];
      const sizes = useSignal('');

      useTask$(() => {
        const key = sort.value;
        sizes.value = [...rows]
          .sort((a, b) => a[key] - b[key])
          .map((row) => row.size)
          .join(' ');
      });

      return (
        <>
          <span>{sizes.value}</span>
          <button onClick$={() => (sort.value = sort.value === 'id' ? 'size' : 'id')}>Sort</button>
        </>
      );
    });

    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;
    const span = container.querySelector('span')!;

    expect(span.textContent).toBe('1 2 3 4');

    await qwikLoader?.dispatch(button, 'click');
    expect(span.textContent).toBe('4 3 2 1');

    await qwikLoader?.dispatch(button, 'click');
    expect(span.textContent).toBe('1 2 3 4');

    cleanup();
  });

  it('useVisibleTask$ supports document-ready strategy', async () => {
    const App = component$(() => {
      const value = useSignal('SSR');

      useVisibleTask$(
        () => {
          value.value = 'CSR';
        },
        { strategy: 'document-ready' }
      );

      return <span>{value.value}</span>;
    });

    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;

    await qwikLoader?.dispatch(span, 'qinit');
    await flush();

    // A visible task loads lazily after the flush (as on main); its writes need their own flush.
    await vi.waitFor(async () => {
      await flush();
      expect(span.textContent).toBe('CSR');
    });

    cleanup();
  });

  it('useVisibleTask$ tracks signal reads after await once active', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const label = useSignal('idle');

      useVisibleTask$(async () => {
        await Promise.resolve();
        label.value = `visible:${count.value}`;
      });

      return <button onClick$={() => count.value++}>{label.value}</button>;
    });

    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'qvisible');
    await flush();
    expect(button.textContent).toBe('visible:0');

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('visible:1');

    cleanup();
  });

  it('visible task runs cleanup on unmount after resume', async () => {
    const Child = component$((props: { cleanupCount: { value: number } }) => {
      useVisibleTask$(({ cleanup }) => {
        cleanup(() => {
          props.cleanupCount.value++;
        });
      });

      return <span id="visible-cleanup-child">Child</span>;
    });

    const App = component$(() => {
      const show = useSignal(true);
      const cleanupCount = useSignal(0);

      return (
        <button onClick$={() => (show.value = !show.value)}>
          {show.value ? <Child cleanupCount={cleanupCount} /> : 'empty'}
          <b>{cleanupCount.value}</b>
        </button>
      );
    });

    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(container.querySelector('#visible-cleanup-child')!, 'qvisible');
    await flush();
    await qwikLoader?.dispatch(button, 'click');
    await flush();

    expect(container.querySelector('b')?.textContent).toBe('1');

    cleanup();
  });

  it('visible task cleanup reads fresh computed values', async () => {
    const Child = component$((props: { state: { url: string; logs: string } }) => {
      const pathname = useComputed$(() => props.state.url);

      useVisibleTask$(({ cleanup }) => {
        void pathname.value;
        cleanup(() => {
          props.state.logs += `cleanup ${pathname.value};`;
        });
      });

      return <p id="fresh-cleanup-child">child</p>;
    });

    const App = component$(() => {
      const state = useStore({ url: '/', logs: '' });

      return (
        <button onClick$={() => (state.url = '/other')}>
          {state.url === '/' && <Child state={state} />}
          <b>{state.logs}</b>
        </button>
      );
    });

    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(container.querySelector('#fresh-cleanup-child')!, 'qvisible');
    await flush();
    await qwikLoader?.dispatch(button, 'click');
    await flush();

    expect(container.querySelector('b')?.textContent).toBe('cleanup /other;');

    cleanup();
  });

  it('task reading a computed for the first time runs once', async () => {
    (globalThis as any).__computedTaskRuns = [] as string[];

    const App = component$(() => {
      const source = useSignal('/');
      const path = useComputed$(() => source.value);

      useVisibleTask$(() => {
        (globalThis as any).__computedTaskRuns.push(path.value);
      });

      return <p>ready</p>;
    });

    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const paragraph = container.querySelector('p')!;

    await qwikLoader?.dispatch(paragraph, 'qvisible');
    await flush();
    await flush();

    expect((globalThis as any).__computedTaskRuns).toEqual(['/']);

    delete (globalThis as any).__computedTaskRuns;
    cleanup();
  });
});

describe(`${name}: useTask`, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should execute task', async () => {
    const Counter = component$(() => {
      const count = useSignal('wrong');
      useTask$(() => {
        count.value = 'WORKS';
      });
      return <span>{count.value}</span>;
    });

    const { container, cleanup } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('WORKS');
  });
  it('should execute async task', async () => {
    (globalThis as any).__mainTestLog = [];
    const Counter = component$(() => {
      (globalThis as any).__mainTestLog.push('Counter');
      const count = useSignal('wrong');
      useTask$(async () => {
        (globalThis as any).__mainTestLog.push('task');
        await delay(10);
        (globalThis as any).__mainTestLog.push('resolved');
        count.value = 'WORKS';
      });
      (globalThis as any).__mainTestLog.push('render');
      return <span>{count.value}</span>;
    });

    const { container, cleanup } = await render(Counter, { debug });
    onTestFinished(cleanup);
    // A client task loads lazily, so the body finishes before the task's first run.
    expect((globalThis as any).__mainTestLog).toEqual(
      name === 'csrRender'
        ? ['Counter', 'render', 'task', 'resolved']
        : ['Counter', 'task', 'render', 'resolved']
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('WORKS');
  });
  it('should not run next task until previous async task is finished', async () => {
    (globalThis as any).__mainTestLog = [];
    const Counter = component$(() => {
      (globalThis as any).__mainTestLog.push('Counter');
      const count = useSignal('');
      useTask$(async () => {
        (globalThis as any).__mainTestLog.push('1:task');
        await delay(10);
        (globalThis as any).__mainTestLog.push('1:resolved');
        count.value += 'A';
      });
      useTask$(async () => {
        (globalThis as any).__mainTestLog.push('2:task');
        await delay(10);
        (globalThis as any).__mainTestLog.push('2:resolved');
        count.value += 'B';
      });
      (globalThis as any).__mainTestLog.push('render');
      return <span>{count.value}</span>;
    });

    const { container, cleanup } = await render(Counter, { debug });
    onTestFinished(cleanup);
    expect((globalThis as any).__mainTestLog).toEqual(
      name === 'csrRender'
        ? ['Counter', 'render', '1:task', '1:resolved', '2:task', '2:resolved']
        : ['Counter', '1:task', 'render', '1:resolved', '2:task', '2:resolved']
    );
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('AB');
  });
  describe('track', () => {
    it('should rerun on track', async () => {
      const Counter = component$(() => {
        const count = useSignal(10);
        const double = useSignal(0);
        useTask$(() => {
          double.value = 2 * count.value;
        });
        return (
          <button
            onClick$={() => {
              count.value++;
            }}
          >
            {double.value}
          </button>
        );
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('20');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('22');
      await flush();
    });
    it('should track store property', async () => {
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useTask$(() => {
          const count = store['count'];
          store.double = 2 * count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('2');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('4');
    });
    it('should track store', async () => {
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useTask$(() => {
          const storeCounter = store;
          store.double = 2 * storeCounter.count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('2');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('4');
    });

    it('should unsubscribe from removed component', async () => {
      (global as any).logs = [] as string[];

      const ToggleChild = component$((props: { name: string; count: number }) => {
        useTask$(() => {
          const count = props.count;
          const logText = `Child of "${untrack(() => props.name)}" (${count})`;
          (global as any).logs.push(logText);
        });

        return (
          <div>
            <h1>Toggle {props.name}</h1>
          </div>
        );
      });

      const Toggle = component$(() => {
        const store = useStore({
          count: 0,
          cond: false,
        });
        return (
          <div>
            <button id="increment" type="button" onClick$={() => store.count++}>
              Root increment
            </button>
            <div>
              {!store.cond ? (
                <ToggleChild name="A" count={store.count} />
              ) : (
                <ToggleChild name="B" count={store.count} />
              )}
              <button type="button" id="toggle" onClick$={() => (store.cond = !store.cond)}>
                Toggle
              </button>
            </div>
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Toggle, { debug });
      onTestFinished(cleanup);

      (global as any).logs = [];
      await trigger(container, '#increment', 'click');
      await flush();
      expect(new Set((global as any).logs)).toEqual(new Set(['Child of "A" (1)']));
      await trigger(container, '#toggle', 'click');
      await flush();
      (global as any).logs = [];
      await trigger(container, '#increment', 'click');
      await flush();
      expect(new Set((global as any).logs)).toEqual(new Set(['Child of "B" (2)']));
      await trigger(container, '#toggle', 'click');
      await flush();
      (global as any).logs = [];
      await trigger(container, '#increment', 'click');
      await flush();
      expect(new Set((global as any).logs)).toEqual(new Set(['Child of "A" (3)']));
    });

    it('should not rerun on track if the value is not a signal', async () => {
      (globalThis as any).counter = 0;
      const OtpBase = component$((props: any) => {
        useTask$(() => {
          props.disabled;
          (globalThis as any).counter++;
        });

        return (
          <div>
            <Slot />
          </div>
        );
      });

      const Cmp = component$(() => {
        const isDisabled = useSignal(false);

        const OtpRoot = (props: any) => {
          return <OtpBase {...props}>{props.children}</OtpBase>;
        };
        return (
          <>
            <OtpRoot disabled={isDisabled.value} />

            <button type="button" onClick$={() => (isDisabled.value = !isDisabled.value)}>
              Disable OTP
            </button>
          </>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).counter).toBe(5);
      (globalThis as any).counter = undefined;
    });
  });
  describe('queue', () => {
    it('should execute dependant tasks', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0, quadruple: 0 });
        // Quadruple runs first, but will run again after double is updated
        useTask$(() => {
          (globalThis as any).log.push('quadruple');
          const trackingValue = store['double'] * 2;
          store.quadruple = trackingValue;
        });
        useTask$(() => {
          (globalThis as any).log.push('double');
          store.double = store['count'] * 2;
        });
        (globalThis as any).log.push('Counter');
        return (
          <button onClick$={() => store.count++}>
            {store.count + '/' + store.double + '/' + store.quadruple}
          </button>
        );
      });

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);
      if (name === 'ssrRender') {
        expect((globalThis as any).log).toEqual(['quadruple', 'double', 'quadruple', 'Counter']);
      } else {
        expect((globalThis as any).log).toEqual(['Counter', 'quadruple', 'double', 'quadruple']);
      }
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('1/2/4');
      (globalThis as any).log.length = 0;
      await triggerAll(container, 'button', 'click');
      await flush();

      expect((globalThis as any).log).toEqual(['double', 'quadruple']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('2/4/8');
    });
  });
  describe('cleanup', () => {
    it('should execute cleanup task rerun on track', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const count = useSignal(0);
        useTask$(() => {
          const _count = count.value;
          (globalThis as any).log.push('task: ' + _count);
          return () => (globalThis as any).log.push('cleanup: ' + _count);
        });

        return <button onClick$={() => count.value++}>{count.value}</button>;
      });
      const isCSR = name === 'csrRender';

      const { container, cleanup, flush } = await render(Counter, { debug });
      onTestFinished(cleanup);

      expect((globalThis as any).log).toEqual(isCSR ? ['task: 0'] : ['task: 0', 'cleanup: 0']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('0');
      (globalThis as any).log.length = 0;
      await triggerAll(container, 'button', 'click');
      await flush();

      expect((globalThis as any).log).toEqual(isCSR ? ['cleanup: 0', 'task: 1'] : ['task: 1']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('1');
      (globalThis as any).log.length = 0;
      await triggerAll(container, 'button', 'click');
      await flush();

      expect((globalThis as any).log).toEqual(['cleanup: 1', 'task: 2']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('2');
    });
    it('should execute cleanup task on unmount', async () => {
      (globalThis as any).log = [] as string[];
      const Child = component$(() => {
        useTask$(({ cleanup }) => {
          (globalThis as any).log.push('task:');
          cleanup(() => (globalThis as any).log.push('cleanup:'));
        });
        (globalThis as any).log.push('Child');
        return <span>Child</span>;
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            {show.value ? <Child /> : null}
          </button>
        );
      });
      const isCSR = name === 'csrRender';

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);

      expect((globalThis as any).log).toEqual(
        isCSR ? ['Child', 'task:'] : ['task:', 'Child', 'cleanup:']
      );
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Child');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('Child');
      (globalThis as any).log = [];
      await triggerAll(container, 'button', 'click');
      await flush();

      expect((globalThis as any).log).toEqual(isCSR ? ['cleanup:'] : []);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('span')).toHaveLength(0);
      (globalThis as any).log = [];
      await triggerAll(container, 'button', 'click');
      await flush();

      // A loaded task runs in setup; after resume the client loads it on this first mount.
      expect((globalThis as any).log).toEqual(isCSR ? ['task:', 'Child'] : ['Child', 'task:']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Child');
      expect(container.querySelectorAll('span')).toHaveLength(1);
      expect(container.querySelector('span')!.textContent).toBe('Child');
      (globalThis as any).log = [];
      await triggerAll(container, 'button', 'click');
      await flush();

      expect((globalThis as any).log).toEqual(['cleanup:']);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('');
      expect(container.querySelectorAll('span')).toHaveLength(0);
      (globalThis as any).log = undefined;
    });
    it('should handle promises and tasks', async () => {
      (global as any).log = [] as string[];
      const MyComp = component$(() => {
        const promise = useSignal<Promise<number>>();
        (global as any).log.push('render');

        // Tasks should run one after the other, awaiting returned promises.
        // Here we "sideload" a promise via the signal
        useTask$(() => {
          promise.value = Promise.resolve(0)
            .then(() => {
              (global as any).log.push('inside.1');
              return delay(10);
            })
            .then(() => {
              (global as any).log.push('1b');
              return 1;
            });
          (global as any).log.push('1a');
        });

        useTask$(async () => {
          (global as any).log.push('2a');
          await delay(10);
          (global as any).log.push('2b');
        });

        useTask$(() => {
          promise.value = promise.value!.then(() => {
            (global as any).log.push('3b');
            return 3;
          });
          (global as any).log.push('3a');
        });

        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { container, cleanup } = await render(MyComp, { debug });
      onTestFinished(cleanup);
      const log: string[] = (global as any).log;
      if (name === 'csrRender') {
        // Each client task loads before it runs, so only the per-task order is fixed.
        expect([...log].sort()).toEqual(['1a', '1b', '2a', '2b', '3a', '3b', 'inside.1', 'render']);
        const at = (entry: string) => log.indexOf(entry);
        expect(at('render')).toBe(0);
        expect(at('1a')).toBeLessThan(at('2a'));
        expect(at('2b')).toBeLessThan(at('3a'));
        expect(at('3a')).toBeLessThan(at('3b'));
      } else {
        expect(log).toEqual([
          // 1st render
          'render',
          // task 1 returns sync and sideloads promise
          '1a',
          // task 2 runs sync after that and returns a promise
          '2a',
          // async microtasks run, task 1 queues a delay
          'inside.1',
          '2b',
          // task 3 runs sync and attaches to the promise
          '3a',
          // microtasks run
          '1b',
          '3b',
        ]);
      }
      // The DOM should have the final value of the sideloaded promise
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('Should have a number: "3"');
    });
  });

  it('should update signal in async task', async () => {
    const Cmp = component$(() => {
      const basicData = useSignal(1);
      const arrData = useSignal<number[]>([]);
      useTask$(async () => {
        await delay(100);
        arrData.value = [1, 2, 3];
        basicData.value++;
      });
      return (
        <div>
          <span>{basicData.value}</span>
          <div>
            {arrData.value.map((item) => (
              <div>Item: {item}</div>
            ))}
          </div>
        </div>
      );
    });
    const { container, cleanup } = await render(Cmp, { debug });
    onTestFinished(cleanup);

    expect(container.querySelectorAll('div')).toHaveLength(5);
    expect(container.querySelector('div')!.textContent).toBe('2Item: 1Item: 2Item: 3');
    expect(container.querySelectorAll('div')[1]!.textContent).toBe('Item: 1Item: 2Item: 3');
    expect(container.querySelectorAll('div')[2]!.textContent).toBe('Item: 1');
    expect(container.querySelectorAll('div')[3]!.textContent).toBe('Item: 2');
    expect(container.querySelectorAll('div')[4]!.textContent).toBe('Item: 3');
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  describe('deferUpdates', () => {
    it.each([
      { title: 'should execute task and block render until finish', deferUpdates: true },
      { title: 'should execute task and not block render until finish', deferUpdates: false },
    ])('$title', async ({ deferUpdates }) => {
      const Counter = component$((props: { deferUpdates: boolean }) => {
        const count = useSignal(0);
        const text = useSignal('val1');
        useTask$(
          async () => {
            const current = count.value;
            if (current === 0) {
              return;
            }
            const pending = new Promise<void>((resolve) => {
              (globalThis as any).__mainTaskRelease = resolve;
            });
            if (!props.deferUpdates) {
              text.value = `val${current + 1}`;
            }
            (globalThis as any).__mainTaskPending = current;
            await pending;
            if (props.deferUpdates) {
              text.value = `val${current + 1}`;
            }
          },
          { deferUpdates: props.deferUpdates }
        );
        return <button onClick$={() => count.value++}>{text.value}</button>;
      });
      const { container, cleanup, flush } = await render(Counter, { props: { deferUpdates } });
      onTestFinished(() => {
        (globalThis as any).__mainTaskRelease?.();
        cleanup();
        delete (globalThis as any).__mainTaskRelease;
        delete (globalThis as any).__mainTaskPending;
      });
      const button = container.querySelector('button')!;
      expect(button.textContent).toBe('val1');
      for (let count = 1; count <= 2; count++) {
        const clicked = trigger(container, button, 'click');
        await vi.waitFor(() => expect((globalThis as any).__mainTaskPending).toBe(count));
        expect(button.textContent).toBe(`val${count + (deferUpdates ? 0 : 1)}`);
        (globalThis as any).__mainTaskRelease();
        await clicked;
        await flush();
        expect(button.textContent).toBe(`val${count + 1}`);
      }
    });
  });

  describe('regression', () => {
    it('#5782', async () => {
      const Child = component$(({ sig }: { sig: SignalType<SignalType<number>> }) => {
        const counter = useSignal(0);
        useTask$(() => {
          sig.value;
          sig.value = counter;
        });
        return <p>{counter.value}</p>;
      });

      const Issue5782 = component$(() => {
        const counterDefault = useSignal(0);
        const sig = useSignal(counterDefault);
        const showChild = useSignal(false);
        return (
          <>
            <button id="decrease" onClick$={() => sig.value.value--}>
              --
            </button>
            {sig.value.value}
            <button id="increase" onClick$={() => sig.value.value++}>
              ++
            </button>
            <button id="toggle" onClick$={() => (showChild.value = !showChild.value)}>
              Toggle
            </button>
            {showChild.value && <Child sig={sig} />}
          </>
        );
      });

      const { container, cleanup, flush } = await render(Issue5782, { debug });
      onTestFinished(cleanup);

      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(0);

      await trigger(container, '#toggle', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('0');

      await trigger(container, '#increase', 'click');
      await flush();
      await trigger(container, '#increase', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('2');
      await trigger(container, '#decrease', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('1');

      await trigger(container, '#toggle', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(0);

      await trigger(container, '#toggle', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(3);
      expect(container.querySelector('button')!.textContent).toBe('--');
      expect(container.querySelector('button')!.getAttribute('id')).toBe('decrease');
      expect(container.querySelectorAll('button')[1]!.textContent).toBe('++');
      expect(container.querySelectorAll('button')[1]!.getAttribute('id')).toBe('increase');
      expect(container.querySelectorAll('button')[2]!.textContent).toBe('Toggle');
      expect(container.querySelectorAll('button')[2]!.getAttribute('id')).toBe('toggle');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('0');
    });

    it('#4332', async () => {
      const Child = component$((props: { val: string }) => {
        useTask$(() => {
          props.val;
        });
        return <>{props.val}</>;
      });

      const Parent = component$(() => {
        const sig = useSignal<{ data: string } | undefined>({ data: 'abcd' });

        return (
          <>
            <button onClick$={() => (sig.value = sig.value ? undefined : { data: 'abcd' })}>
              Toggle
            </button>
            {sig.value && <Child val={sig.value.data} />}
          </>
        );
      });
      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Toggle');
    });
  });

  it('should rerender component after task', async () => {
    const Cmp = component$(() => {
      const sort = useSignal<'id' | 'size'>('size');
      const table = useSignal([
        { id: 1, size: 4 },
        { id: 2, size: 3 },
        { id: 3, size: 2 },
        { id: 4, size: 1 },
        { id: 5, size: 7 },
        { id: 6, size: 8 },
        { id: 7, size: 9 },
      ]);

      useTask$(() => {
        const key = sort.value;
        table.value = table.value.sort((a, b) => a[key] - b[key]).slice();
      });

      return (
        <>
          <span>{table.value.map((row) => row.size).join(' ')}</span>
          <button onClick$={() => (sort.value = sort.value === 'id' ? 'size' : 'id')}>Sort</button>
        </>
      );
    });
    const { container, cleanup, flush } = await render(Cmp, { debug });
    onTestFinished(cleanup);
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('1 2 3 4 7 8 9');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Sort');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('4 3 2 1 7 8 9');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Sort');

    await triggerAll(container, 'button', 'click');
    await flush();
    expect(container.querySelectorAll('span')).toHaveLength(1);
    expect(container.querySelector('span')!.textContent).toBe('1 2 3 4 7 8 9');
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('button')!.textContent).toBe('Sort');
  });
});
