import { describe, expect, it } from 'vitest';
import { component$ } from '@qwik.dev/core';
import { useAsync$, useSignal, useTask$ } from '@qwik.dev/core';
import { testRenderer } from '../test-utils';

const debug = false;

const { name, render } = testRenderer;

describe(`${name}: async signals`, () => {
  it('resolves promise in computed result', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => count.value * 2);
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect(button.textContent).toBe('2');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.textContent).toBe('4');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.textContent).toBe('6');

    cleanup();
  });

  it('computes async result from async result', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => count.value * 2);
      const quadrupleCount = useAsync$(async () => doubleCount.value * 2);
      return <button onClick$={() => count.value++}>{quadrupleCount.value}</button>;
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect(button.textContent).toBe('4');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.textContent).toBe('8');

    cleanup();
  });

  it('resolves delayed promise in computed result', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
        return count.value * 2;
      });
      return <button onClick$={() => count.value++}>{doubleCount.value}</button>;
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect(button.textContent).toBe('2');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.textContent).toBe('4');

    cleanup();
  });

  it('handles undefined as promise result', async () => {
    const Counter = () => {
      const value = useAsync$<string | undefined>(async () => undefined);
      return <div>{value.value}</div>;
    };

    const { container, cleanup, flush } = await render(Counter, { debug });

    await drain(flush);
    expect(container.querySelector('div')!.textContent?.trim()).toBe('');

    cleanup();
  });

  it('renders as attribute', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => count.value * 2);
      return <button data-count={doubleCount.value} onClick$={() => count.value++}></button>;
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect(button.getAttribute('data-count')).toBe('2');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.getAttribute('data-count')).toBe('4');

    cleanup();
  });

  it('shows loading state', async () => {
    (globalThis as any).__asyncResolve = undefined;

    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => {
        const value = count.value;
        if (value === 2) {
          await new Promise<void>((resolve) => {
            (globalThis as any).__asyncResolve = resolve;
          });
        } else {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        return value * 2;
      });
      return (
        <button onClick$={() => count.value++}>
          {doubleCount.loading ? 'loading' : doubleCount.value}
        </button>
      );
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    if (testRenderer.name === 'ssrRender') {
      expect(button.textContent).toBe('2');
    } else {
      expect(button.textContent).toBe('loading');
      await delay(20);
      await drain(flush);
      expect(button.textContent).toBe('2');
    }

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('loading');

    expect(typeof (globalThis as any).__asyncResolve).toBe('function');
    (globalThis as any).__asyncResolve();
    await drain(flush);
    expect(button.textContent).toBe('4');

    cleanup();
    (globalThis as any).__asyncResolve = undefined;
  });

  it('does not show initial value after SSR', async () => {
    const Counter = () => {
      const asyncValue = useAsync$(async () => 42, { initial: 10 });
      return <div>{asyncValue.value}</div>;
    };

    const { container, cleanup, flush } = await render(Counter, { debug });

    await drain(flush);
    expect(container.querySelector('div')!.textContent).toBe('42');

    cleanup();
  });

  it('shows error state', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => {
        const value = count.value;
        if (value > 1) {
          throw new Error('test');
        }
        return value * 2;
      });
      return (
        <button onClick$={() => count.value++}>
          {doubleCount.error ? 'error' : doubleCount.value}
        </button>
      );
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect(button.textContent).toBe('2');

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(button.textContent).toBe('error');

    cleanup();
  });

  it('does not rerun if promise is awaited before', async () => {
    (globalThis as any).__asyncLog = [];

    const Counter = () => {
      const count = useSignal(1);
      const doubleCount = useAsync$(async () => {
        (globalThis as any).__asyncLog.push('async');
        return count.value * 2;
      });

      useTask$(async () => {
        await doubleCount.promise();
        (globalThis as any).__asyncLog.push('task');
        (globalThis as any).__asyncLog.push(doubleCount.value);
      });

      return <div></div>;
    };

    const { cleanup, flush } = await render(Counter, { debug });

    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(['async', 'task', 2]);

    cleanup();
    (globalThis as any).__asyncLog = undefined;
  });

  it('skips computation on SSR for clientOnly and resumes on qidle', async () => {
    const Counter = () => {
      const count = useSignal(1);
      const asyncValue = useAsync$(async () => count.value * 2, {
        clientOnly: true,
        initial: 0,
      });
      return (
        <div>
          {asyncValue.loading ? (
            <div id="loading">loading...</div>
          ) : (
            <div id="value">{asyncValue.value}</div>
          )}
          <button onClick$={() => count.value++}></button>
        </div>
      );
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });

    if (testRenderer.name === 'ssrRender') {
      expect(container.querySelector('#loading')?.textContent).toBe('loading...');
      await qwikLoader?.dispatch(container, 'qidle');
      await drain(flush);
    } else {
      await drain(flush);
    }

    expect(container.querySelector('#value')?.textContent).toBe('2');

    cleanup();
  });

  it('does not compute clientOnly signals without subscribers', async () => {
    (globalThis as any).__asyncComputations = {
      unused: false,
      used: false,
    };

    const Counter = () => {
      const count = useSignal(1);
      useAsync$(
        async () => {
          (globalThis as any).__asyncComputations.unused = true;
          return count.value * 2;
        },
        { clientOnly: true, initial: 0 }
      );
      const asyncValue = useAsync$(
        async () => {
          (globalThis as any).__asyncComputations.used = true;
          return count.value * 3;
        },
        { clientOnly: true, initial: 0 }
      );
      return (
        <div>
          {asyncValue.loading ? (
            <div id="loading">loading...</div>
          ) : (
            <div id="value">{asyncValue.value}</div>
          )}
        </div>
      );
    };

    const { container, cleanup, flush, html } = await render(Counter, { debug });

    if (testRenderer.name === 'ssrRender') {
      expect(html).toContain('loading...');
    }
    await drain(flush);
    expect((globalThis as any).__asyncComputations).toEqual({ unused: false, used: true });
    expect(container.querySelector('#value')?.textContent).toBe('3');

    cleanup();
    (globalThis as any).__asyncComputations = undefined;
  });

  it('throws when reading clientOnly value without initial during SSR', async () => {
    const Counter = () => {
      const asyncValue = useAsync$(async () => 42, { clientOnly: true });
      return <div>{asyncValue.value}</div>;
    };

    if (testRenderer.name === 'ssrRender') {
      await expect(render(Counter, { debug })).rejects.toThrow(
        'Cannot read .value of a clientOnly async signal'
      );
    } else {
      const { container, cleanup, flush } = await render(Counter, { debug });
      await drain(flush);
      expect(container.querySelector('div')?.textContent).toBe('42');
      cleanup();
    }
  });

  it('runs cleanup on re-compute', async () => {
    (globalThis as any).__asyncLog = [];

    const Counter = () => {
      const count = useSignal(1);
      const asyncValue = useAsync$<number>(async ({ cleanup }) => {
        const value = count.value;
        cleanup(() => {
          (globalThis as any).__asyncLog.push('cleanup');
        });
        return value * 2;
      });
      return <button onClick$={() => count.value++}>{asyncValue.value}</button>;
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(
      testRenderer.name === 'ssrRender' ? ['cleanup'] : []
    );

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(['cleanup']);

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(['cleanup', 'cleanup']);

    cleanup();
    (globalThis as any).__asyncLog = undefined;
  });

  it('runs cleanup on destroy', async () => {
    (globalThis as any).__asyncLog = [];

    const Child = component$(() => {
      const asyncValue = useAsync$<number>(async ({ cleanup }) => {
        cleanup(() => {
          (globalThis as any).__asyncLog.push('cleanup');
        });
        return 1;
      });
      return <span>{asyncValue.value}</span>;
    });

    const Counter = () => {
      const toggle = useSignal(true);
      return (
        <div>
          <button onClick$={() => (toggle.value = !toggle.value)}></button>
          {toggle.value && <Child />}
        </div>
      );
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    const button = container.querySelector('button')!;

    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(
      testRenderer.name === 'ssrRender' ? ['cleanup'] : []
    );

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect(container.querySelector('span')).toBeFalsy();
    expect((globalThis as any).__asyncLog).toEqual(['cleanup']);

    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    await qwikLoader?.dispatch(button, 'click');
    await drain(flush);
    expect((globalThis as any).__asyncLog).toEqual(['cleanup', 'cleanup']);

    cleanup();
    (globalThis as any).__asyncLog = undefined;
  });

  it('resumes polling AsyncSignal with qidle on SSR', async () => {
    const Counter = () => {
      const start = Date.now();
      const elapsed = useAsync$(async () => Date.now() - start, { expires: 50 });
      return (
        <div>
          <div id="elapsed">{elapsed.value}</div>
          <button onClick$={() => (elapsed.expires = elapsed.expires ? 0 : 50)}>Toggle</button>
        </div>
      );
    };

    const { container, cleanup, flush, qwikLoader } = await render(Counter, { debug });
    await drain(flush);

    if (testRenderer.name === 'ssrRender') {
      await qwikLoader?.dispatch(container, 'qidle');
      await drain(flush);
    }

    const elapsedBefore = Number(container.querySelector('#elapsed')!.textContent);
    await delay(100);
    await drain(flush);
    const elapsedAfter = Number(container.querySelector('#elapsed')!.textContent);
    expect(elapsedAfter).toBeGreaterThan(elapsedBefore);

    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    await drain(flush);
    const elapsedWhenStopped = Number(container.querySelector('#elapsed')!.textContent);
    await delay(100);
    await drain(flush);
    expect(Number(container.querySelector('#elapsed')!.textContent)).toBe(elapsedWhenStopped);

    cleanup();
  });
});

async function drain(flush: () => Promise<void>): Promise<void> {
  await flush();
  await Promise.resolve();
  await delay(0);
  await flush();
  await Promise.resolve();
  await flush();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
