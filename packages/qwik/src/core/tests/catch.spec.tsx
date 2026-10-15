import {
  $,
  Catch,
  component$,
  useComputed$,
  useSignal,
  Slot,
  useTask$,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;

const AsyncFallback = component$(async (props: { label: string; message: string }) => {
  await Promise.resolve();
  return (
    <p id="async-fallback">
      {props.label}: {props.message}
    </p>
  );
});

const Thrower = component$(() => {
  throw new Error('render failed');
  return null;
});

describe(`${name}: Catch`, () => {
  it('catches an application error with plugin metadata', async () => {
    const Broken = component$(() => {
      throw Object.assign(new Error('application failed'), { plugin: 'application' });
      return null;
    });
    const App = component$(() => (
      <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
        <Broken />
      </Catch>
    ));
    const result = await render(App);
    try {
      expect(result.container.querySelector('#fallback')?.textContent).toBe('application failed');
    } finally {
      result.cleanup();
    }
  });

  it.each(['task-sync', 'task-async', 'computed-sync', 'computed-async'] as const)(
    'catches %s cleanup errors when removing a branch',
    async (kind) => {
      const Child = component$<{ kind: string }>(({ kind }) => {
        useTask$(({ cleanup }) => {
          if (kind.startsWith('task')) {
            cleanup(() => {
              if (kind.endsWith('async')) {
                return Promise.reject(new Error('cleanup failed'));
              }
              throw new Error('cleanup failed');
            });
          }
        });
        const value = useComputed$<string>(({ cleanup }) => {
          if (kind.startsWith('computed')) {
            cleanup(() => {
              if (kind.endsWith('async')) {
                return Promise.reject(new Error('cleanup failed'));
              }
              throw new Error('cleanup failed');
            });
          }
          return 'child';
        });
        return <p id="child">{value.value}</p>;
      });
      const App = component$<{ kind: string }>(({ kind }) => {
        const show = useSignal(false);
        return (
          <>
            <button
              id="toggle"
              onClick$={() => {
                show.value = !show.value;
              }}
            >
              toggle
            </button>
            <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
              {show.value ? <Child kind={kind} /> : null}
            </Catch>
          </>
        );
      });
      const result = await render(App, { props: { kind } });
      try {
        await result.qwikLoader?.dispatch(result.container.querySelector('#toggle')!, 'click');
        expect(result.container.querySelector('#child')?.textContent).toBe('child');
        await result.qwikLoader?.dispatch(result.container.querySelector('#toggle')!, 'click');
        expect(result.container.querySelector('#fallback')?.textContent).toBe('cleanup failed');
        expect(result.container.querySelector('#child')).toBeFalsy();
      } finally {
        result.cleanup();
      }
    }
  );

  it.each(['event', 'task'] as const)(
    'keeps shared state when a %s failure replaces its subtree',
    async (mode) => {
      const Content = component$<{ count: Signal<number>; mode: string }>(({ count, mode }) => {
        useTask$(() => {
          if (mode === 'task' && count.value > 0) {
            throw new Error('task failed');
          }
        });
        return (
          <button
            id="fail"
            onClick$={() => {
              count.value++;
              if (mode === 'event') {
                throw new Error('event failed');
              }
            }}
          >
            fail
          </button>
        );
      });
      const App = component$<{ mode: string }>(({ mode }) => {
        const count = useSignal(0);
        return (
          <>
            <Catch
              fallback$={(error) => (
                <button id="fallback" onClick$={() => count.value++}>
                  {error.message}: {count.value}
                </button>
              )}
            >
              <Content count={count} mode={mode} />
            </Catch>
            <output>{count.value}</output>
          </>
        );
      });
      const result = await render(App, { props: { mode } });
      try {
        expect(result.container.querySelector('#fail'), result.container.innerHTML).toBeTruthy();
        await result.qwikLoader?.dispatch(result.container.querySelector('#fail')!, 'click');
        expect(result.container.querySelector('#fallback')?.textContent).toBe(`${mode} failed: 1`);
        expect(result.container.querySelector('#fail')).toBeFalsy();
        await result.qwikLoader?.dispatch(result.container.querySelector('#fallback')!, 'click');
        expect(result.container.querySelector('output')?.textContent).toBe('2');
      } finally {
        result.cleanup();
      }
    }
  );

  it('renders a local QRL fallback with captures and preserved callback arguments', async () => {
    const App = component$(() => {
      const label = useSignal('caught');
      const fallback = $((error: Error) => (
        <AsyncFallback label={label.value} message={error.message} />
      ));
      return (
        <>
          <Catch fallback$={fallback}>
            <Thrower />
          </Catch>
          <section id="callback-output">{fallback(new Error('outside'))}</section>
        </>
      );
    });
    const result = await render(App);
    try {
      expect(result.container.querySelector('#async-fallback')?.textContent).toBe(
        'caught: render failed'
      );
      expect(result.container.querySelector('#callback-output')?.textContent).toBe(
        'caught: outside'
      );
    } finally {
      result.cleanup();
    }
  });

  it('renders an inline fallback containing async content', async () => {
    const App = component$(() => {
      const label = useSignal('caught');
      return (
        <Catch fallback$={(error) => <AsyncFallback label={label.value} message={error.message} />}>
          <Thrower />
        </Catch>
      );
    });
    const result = await render(App);
    try {
      expect(result.container.querySelector('#async-fallback')?.textContent).toBe(
        'caught: render failed'
      );
    } finally {
      result.cleanup();
    }
  });

  it('replaces a failed subtree and resumes an interactive fallback', async () => {
    const Fallback = component$<{ message: string }>(({ message }) => {
      const count = useSignal(0);
      return (
        <button id="fallback" onClick$={() => count.value++}>
          {message}: {count.value}
        </button>
      );
    });
    const App = component$(() => (
      <main>
        <Catch
          fallback$={$((error) => (
            <Fallback message={error.message} />
          ))}
        >
          <span id="discarded">partial</span>
          <Thrower />
        </Catch>
        <p id="sibling">alive</p>
      </main>
    ));
    const result = await render(App);
    try {
      expect(result.container.querySelector('#discarded')).toBeFalsy();
      expect(result.container.querySelector('#sibling')?.textContent).toBe('alive');
      expect(result.container.querySelector('#fallback')?.textContent).toBe('render failed: 0');
      await result.qwikLoader?.dispatch(result.container.querySelector('#fallback')!, 'click');
      expect(result.container.querySelector('#fallback')?.textContent).toBe('render failed: 1');
    } finally {
      result.cleanup();
    }
  });

  it('catches a later scalar render failure after resume', async () => {
    const App = component$(() => {
      const failed = useSignal(false);
      const value = useComputed$(() => {
        if (failed.value) {
          throw new Error('updated failure');
        }
        return 'ready';
      });
      return (
        <main>
          <button id="fail" onClick$={() => (failed.value = true)}>
            fail
          </button>
          <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
            <span id="content">{value.value}</span>
          </Catch>
        </main>
      );
    });
    const result = await render(App);
    try {
      expect(result.container.querySelector('#content')?.textContent).toBe('ready');
      await result.qwikLoader?.dispatch(result.container.querySelector('#fail')!, 'click');
      expect(result.container.querySelector('#content')).toBeFalsy();
      expect(result.container.querySelector('#fallback')?.textContent).toBe('updated failure');
    } finally {
      result.cleanup();
    }
  });

  it('escalates a throwing fallback to the outer boundary', async () => {
    const App = component$(() => (
      <Catch fallback$={(error) => <p id="outer">{error.message}</p>}>
        <Catch
          fallback$={() => {
            throw new Error('fallback failed');
          }}
        >
          <Thrower />
        </Catch>
      </Catch>
    ));
    const result = await render(App);
    try {
      expect(result.container.querySelector('#outer')?.textContent).toBe('fallback failed');
    } finally {
      result.cleanup();
    }
  });

  it('catches the nearest projected boundary and keeps its sibling', async () => {
    const Wrapper = component$(() => (
      <section>
        <Slot />
      </section>
    ));
    const App = component$(() => (
      <Catch fallback$={() => <p id="outer">outer</p>}>
        <p id="alive">alive</p>
        <Wrapper>
          <Catch fallback$={(error) => <p id="inner">{error.message}</p>}>
            <Thrower />
          </Catch>
        </Wrapper>
      </Catch>
    ));
    const result = await render(App);
    try {
      expect(result.container.querySelector('#inner')?.textContent).toBe('render failed');
      expect(result.container.querySelector('#alive')?.textContent).toBe('alive');
      expect(result.container.querySelector('#outer')).toBeFalsy();
    } finally {
      result.cleanup();
    }
  });

  it('catches a later structural render failure', async () => {
    const App = component$(() => {
      const failed = useSignal(false);
      return (
        <main>
          <button id="fail" onClick$={() => (failed.value = true)}>
            fail
          </button>
          <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
            {failed.value ? <Thrower /> : <span id="content">ready</span>}
          </Catch>
        </main>
      );
    });
    const result = await render(App);
    try {
      await result.qwikLoader?.dispatch(result.container.querySelector('#fail')!, 'click');
      expect(result.container.querySelector('#content')).toBeFalsy();
      expect(result.container.querySelector('#fallback')?.textContent).toBe('render failed');
    } finally {
      result.cleanup();
    }
  });

  it('catches an async render rejection', async () => {
    const AsyncThrower = component$(async () => {
      await Promise.resolve();
      throw new Error('async failed');
      return null;
    });
    const App = component$(() => (
      <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
        <span id="discarded">partial</span>
        <AsyncThrower />
      </Catch>
    ));
    const result = await render(App);
    try {
      expect(result.container.querySelector('#discarded')).toBeFalsy();
      expect(result.container.querySelector('#fallback')?.textContent).toBe('async failed');
    } finally {
      result.cleanup();
    }
  });
  it('catches a later collection render failure', async () => {
    const App = component$(() => {
      const rows = useSignal([false]);
      return (
        <main>
          <button id="fail" onClick$={() => (rows.value = [true])}>
            fail
          </button>
          <Catch fallback$={(error) => <p id="fallback">{error.message}</p>}>
            {rows.value.map((failed) => (failed ? <Thrower /> : <span id="content">ready</span>))}
          </Catch>
        </main>
      );
    });
    const result = await render(App);
    try {
      await result.qwikLoader?.dispatch(result.container.querySelector('#fail')!, 'click');
      expect(result.container.querySelector('#content')).toBeFalsy();
      expect(result.container.querySelector('#fallback')?.textContent).toBe('render failed');
    } finally {
      result.cleanup();
    }
  });
});
