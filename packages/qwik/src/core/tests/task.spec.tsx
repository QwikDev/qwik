import { component$ } from '@qwik.dev/core';
import { useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: task', ({ name, render }) => {
  it('task executes async task before initial render settles', async () => {
    if (name !== 'ssrRender') {
      return;
    }

    const App = component$(() => {
      const value = useSignal('wrong');

      useTask$(async () => {
        await Promise.resolve();
        value.value = 'WORKS';
      });

      return <span>{value.value}</span>;
    });

    const { container, cleanup, flush } = await render(App, { debug });
    await flush();

    expect(container.querySelector('span')?.textContent).toBe('WORKS');

    cleanup();
  });

  it('task runs tasks in order and awaits async tasks', async () => {
    if (name !== 'ssrRender') {
      return;
    }

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
});
