import { component$, Suspense } from '@qwik.dev/core';
import {
  useAsync$,
  useComputed$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
} from '@qwik.dev/core';
import { describe, expect, it, vi } from 'vitest';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: task`, () => {
  it('retries a task that reads a pending async value', async () => {
    const App = component$(() => {
      const seen = useSignal('none');
      const bump = useSignal(0);
      const data = useAsync$(
        (ctx) => {
          if (ctx.track(bump) === 0) {
            return 'first';
          }
          return new Promise<string>((resolve) => setTimeout(() => resolve('second'), 20));
        },
        { allowStale: false }
      );
      useTask$(() => {
        seen.value = data.value;
      });
      return (
        <button
          onClick$={() => {
            // mirror the route-loader refresh: bump the input and drop the cached value
            bump.value++;
            data.invalidate(true);
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
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(button.textContent).toBe('second');
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
        <Suspense fallback$={(() => <span id="loading">loading</span>) as any}>
          <Child />
        </Suspense>
      ));

      const { container, cleanup, flush } = await render(App, { debug });

      expect(container.textContent).toBe('loading');

      // Suspense content starts off the flush, so its task may not have registered yet.
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

    expect(container.querySelector('b')?.textContent).toBe(name === 'csrRender' ? '2' : '1');

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

    expect(span.textContent).toBe('CSR');

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
