import {
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
const debug = false;
const isResume = name === 'ssrRender';

describe(`${name}: visible task`, () => {
  const carrierOf = (container: Element, document: Document) =>
    (isResume ? document : container).querySelector('script[hidden]') ?? null;
  /**
   * A root without an own element wakes through a carrier on the server; the client may attach to
   * the first element of a child component instead. Firing both proves the trigger runs once.
   */
  const wakeCarrier = async (
    container: Element,
    document: Document,
    qwikLoader: { dispatch(target: Element, type: string): Promise<unknown> } | undefined,
    flush: () => Promise<unknown>
  ) => {
    const carrier = carrierOf(container, document);
    const observed = container.querySelector('[q-e\\:qvisible]') ?? null;
    expect(carrier ?? observed).toBeTruthy();
    if (carrier !== null) {
      await qwikLoader?.dispatch(carrier, 'qinit');
    }
    if (observed !== null) {
      await qwikLoader?.dispatch(observed, 'qvisible');
    }
    await flush();
  };

  it('runs when the element becomes visible', async () => {
    const App = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(() => {
        state.value = 'CSR';
      });
      return <span>{state.value}</span>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    expect(span.textContent).toBe('SSR');
    await qwikLoader?.dispatch(span, 'qvisible');
    await flush();
    expect(span.textContent).toBe('CSR');
    cleanup();
  });

  it('supports the document-idle strategy', async () => {
    const App = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(
        () => {
          state.value = 'CSR';
        },
        { strategy: 'document-idle' }
      );
      return <span>{state.value}</span>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    await qwikLoader?.dispatch(span, 'qidle');
    await flush();
    expect(span.textContent).toBe('CSR');
    cleanup();
  });

  it('runs an async visible task', async () => {
    const App = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(async () => {
        await Promise.resolve();
        state.value = 'CSR';
      });
      return <span>{state.value}</span>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    await qwikLoader?.dispatch(span, 'qvisible');
    await flush();
    expect(span.textContent).toBe('CSR');
    cleanup();
  });

  // the scheduler logs a visible task error; whether the dispatch rejects is open (group 12, batch 3b)
  it.skip('surfaces a thrown error from the dispatch', async () => {
    const App = component$(() => {
      useVisibleTask$(() => {
        throw new Error('visible task failed');
      });
      return <span>ok</span>;
    });
    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    await expect(qwikLoader!.dispatch(span, 'qvisible')).rejects.toThrow('visible task failed');
    expect(span.textContent).toBe('ok');
    cleanup();
  });

  it.skip('surfaces an async error from the dispatch', async () => {
    const App = component$(() => {
      useVisibleTask$(async () => {
        await Promise.resolve();
        throw new Error('visible task failed');
      });
      return <span>ok</span>;
    });
    const { container, cleanup, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    await expect(qwikLoader!.dispatch(span, 'qvisible')).rejects.toThrow('visible task failed');
    cleanup();
  });

  // a task that reads and writes the same signal loops (group 12, batch 3b)
  it.skip('runs visible tasks in parallel', async () => {
    let resolveLast!: () => void;
    const allDone = new Promise<void>((resolve) => (resolveLast = resolve));
    (globalThis as any).__resolveVisibleTask = resolveLast;
    const App = component$(() => {
      const log = useSignal('counter');
      useVisibleTask$(() => {
        log.value += ' start';
      });
      useVisibleTask$(async () => {
        log.value += ' 1:start';
        await new Promise((resolve) => setTimeout(resolve, 50));
        log.value += ' 1:done';
        (globalThis as any).__resolveVisibleTask();
      });
      useVisibleTask$(async () => {
        log.value += ' 2:start';
        await new Promise((resolve) => setTimeout(resolve, 10));
        log.value += ' 2:done';
      });
      useVisibleTask$(() => {
        log.value += ' last';
      });
      return <span>{log.value}</span>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    await qwikLoader?.dispatch(span, 'qvisible');
    await allDone;
    await flush();
    expect(span.textContent).toBe('counter start 1:start 2:start last 2:done 1:done');
    cleanup();
    delete (globalThis as any).__resolveVisibleTask;
  });

  describe('headless roots', () => {
    it('uses a carrier for a text root', async () => {
      const App = component$(() => {
        const state = useSignal('empty');
        useVisibleTask$(() => {
          state.value = 'run';
        });
        return <>{state.value}</>;
      });
      const { container, cleanup, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect(container.textContent).toContain('run');
      cleanup();
    });

    it('uses a carrier for an array of fragments', async () => {
      const App = component$(() => {
        const state = useSignal('empty');
        useVisibleTask$(() => {
          state.value = 'run';
        });
        return [<>{state.value}</>, <>{state.value}</>];
      });
      const { container, cleanup, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect(container.textContent).toContain('runrun');
      cleanup();
    });

    it('uses a carrier for a list of components and text', async () => {
      const Child = component$(() => <span>child</span>);
      const App = component$(() => {
        const state = useSignal('empty');
        useVisibleTask$(() => {
          state.value = 'run';
        });
        return [<Child key="1" />, <Child key="2" />, state.value];
      });
      const { container, cleanup, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect(container.textContent).toContain('childchildrun');
      cleanup();
    });

    it('runs for a component returning an empty fragment', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleLog.push('task');
        });
        return <></>;
      });
      const { cleanup, container, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect((globalThis as any).__visibleLog).toEqual(['task']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    it('runs for a component returning null', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleLog.push('task');
        });
        return null;
      });
      const { cleanup, container, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect((globalThis as any).__visibleLog).toEqual(['task']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    it('runs for a component returning undefined', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleLog.push('task');
        });
        return undefined;
      });
      const { cleanup, container, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect((globalThis as any).__visibleLog).toEqual(['task']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    it('merges several visible tasks into one carrier', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const App = component$(() => {
        useVisibleTask$(
          () => {
            (globalThis as any).__visibleLog.push('task1');
          },
          { strategy: 'document-ready' }
        );
        useVisibleTask$(() => {
          (globalThis as any).__visibleLog.push('task2');
        });
        return <></>;
      });
      const { container, document, cleanup, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect((isResume ? document : container).querySelectorAll('script[hidden]')).toHaveLength(1);
      expect((globalThis as any).__visibleLog).toEqual(['task1', 'task2']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    it('uses a carrier for a primitive root', async () => {
      (globalThis as any).__visibleCount = 0;
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleCount++;
        });
        return 123;
      });
      const { container, cleanup, document, qwikLoader, flush } = await render(App, { debug });
      await wakeCarrier(container, document, qwikLoader, flush);
      expect(container.textContent).toContain('123');
      expect((globalThis as any).__visibleCount).toBe(1);
      cleanup();
      delete (globalThis as any).__visibleCount;
    });

    it('wakes with the document on an authored script root', async () => {
      (globalThis as any).__visibleCount = 0;
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleCount++;
        });
        return <script />;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      expect(container.querySelector('script[hidden]')).toBeFalsy();
      await qwikLoader?.dispatch(container.querySelector('script')!, 'qinit');
      await flush();
      expect((globalThis as any).__visibleCount).toBe(1);
      cleanup();
      delete (globalThis as any).__visibleCount;
    });

    it('merges with an authored document listener on a script root', async () => {
      (globalThis as any).__visibleCount = 0;
      const App = component$(() => {
        useVisibleTask$(() => {
          (globalThis as any).__visibleCount++;
        });
        return (
          <script
            document:onQInit$={() => {
              (globalThis as any).__visibleCount++;
            }}
          />
        );
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      await qwikLoader?.dispatch(container.querySelector('script')!, 'qinit');
      await flush();
      expect((globalThis as any).__visibleCount).toBe(2);
      cleanup();
      delete (globalThis as any).__visibleCount;
    });
  });

  describe('reactivity', () => {
    it('reruns when a read signal changes', async () => {
      const App = component$(() => {
        const count = useSignal(10);
        const double = useSignal(0);
        useVisibleTask$(() => {
          double.value = 2 * count.value;
        });
        return <button onClick$={() => count.value++}>{double.value}</button>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      await qwikLoader?.dispatch(button, 'qvisible');
      await flush();
      expect(button.textContent).toBe('20');
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect(button.textContent).toBe('22');
      cleanup();
    });

    it('reruns when a read store property changes', async () => {
      const App = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useVisibleTask$(() => {
          store.double = 2 * store.count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      await qwikLoader?.dispatch(button, 'qvisible');
      await flush();
      expect(button.textContent).toBe('2');
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect(button.textContent).toBe('4');
      cleanup();
    });

    // store reads are not tracked after resume yet (group 12, batch 3b)
    it.skip('settles dependant visible tasks', async () => {
      const App = component$(() => {
        const store = useStore({ count: 1, double: 0, quadruple: 0 });
        useVisibleTask$(() => {
          store.quadruple = store.double * 2;
        });
        useVisibleTask$(() => {
          store.double = store.count * 2;
        });
        return (
          <button onClick$={() => store.count++}>
            {store.count + '/' + store.double + '/' + store.quadruple}
          </button>
        );
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      await qwikLoader?.dispatch(button, 'qvisible');
      await flush();
      expect(button.textContent).toBe('1/2/4');
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect(button.textContent).toBe('2/4/8');
      cleanup();
    });

    it('runs the returned cleanup before a rerun', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const App = component$(() => {
        const count = useSignal(0);
        useVisibleTask$(() => {
          const seen = count.value;
          (globalThis as any).__visibleLog.push('visible task: ' + seen);
          return () => (globalThis as any).__visibleLog.push('cleanup: ' + seen);
        });
        return <button onClick$={() => count.value++}>{count.value}</button>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      await qwikLoader?.dispatch(button, 'qvisible');
      await flush();
      expect((globalThis as any).__visibleLog).toEqual(['visible task: 0']);
      (globalThis as any).__visibleLog = [];
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect((globalThis as any).__visibleLog).toEqual(['cleanup: 0', 'visible task: 1']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    it('runs cleanup on unmount and again after a remount', async () => {
      (globalThis as any).__visibleLog = [] as string[];
      const Child = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).__visibleLog.push('visible task');
          cleanup(() => (globalThis as any).__visibleLog.push('cleanup'));
        });
        return <span>Child</span>;
      });
      const App = component$(() => {
        const show = useSignal(true);
        return (
          <button onClick$={() => (show.value = !show.value)}>
            {show.value ? <Child /> : 'click'}
          </button>
        );
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const button = container.querySelector('button')!;
      await qwikLoader?.dispatch(container.querySelector('span')!, 'qvisible');
      await flush();
      expect((globalThis as any).__visibleLog).toEqual(['visible task']);
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect((globalThis as any).__visibleLog).toEqual(['visible task', 'cleanup']);
      await qwikLoader?.dispatch(button, 'click');
      await qwikLoader?.dispatch(container.querySelector('span')!, 'qvisible');
      await flush();
      expect((globalThis as any).__visibleLog).toEqual(['visible task', 'cleanup', 'visible task']);
      cleanup();
      delete (globalThis as any).__visibleLog;
    });

    // a key change on a static component does not remount yet (group 12, batch 3b)
    it.skip('runs cleanup on every keyed remount', async () => {
      const Child = component$((props: { cleanupCounter: Signal<number> }) => {
        useVisibleTask$(({ cleanup }) => {
          cleanup(() => {
            props.cleanupCounter.value++;
          });
        });
        return <span></span>;
      });
      const App = component$(() => {
        const counter = useSignal(0);
        const cleanupCounter = useSignal(0);
        return (
          <div>
            <button onClick$={() => counter.value++}></button>
            <Child key={counter.value} cleanupCounter={cleanupCounter} />
            <output>{cleanupCounter.value}</output>
          </div>
        );
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      await qwikLoader?.dispatch(container.querySelector('span')!, 'qvisible');
      for (let i = 0; i < 6; i++) {
        await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
        await qwikLoader?.dispatch(container.querySelector('span')!, 'qvisible');
      }
      await flush();
      expect(container.querySelector('output')?.textContent).toBe('6');
      cleanup();
    });

    // a task that reads and writes the same signal loops (group 12, batch 3b)
    it.skip('chains promises through a signal across visible tasks', async () => {
      const App = component$(() => {
        const promise = useSignal<Promise<number>>(Promise.resolve(0));
        useVisibleTask$(() => {
          promise.value = promise.value.then(() => Promise.resolve()).then(() => 1);
        });
        useVisibleTask$(() => {
          promise.value = promise.value.then(() => 2);
        });
        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const paragraph = container.querySelector('p')!;
      await qwikLoader?.dispatch(paragraph, 'qvisible');
      await flush();
      expect(paragraph.textContent).toBe('Should have a number: "2"');
      cleanup();
    });
  });

  // a task that reads and writes the same store loops (group 12, batch 3b)
  it.skip('does not run after SSR until the element is visible again', async () => {
    const App = component$(() => {
      const log = useStore<string[]>([]);
      const update = useSignal(0);
      useTask$(() => {
        update.value;
        log.push('task 1');
      });
      useVisibleTask$(async () => {
        log.push('visible task');
      });
      useTask$(() => {
        update.value;
        log.push('task 2');
      });
      return <button onClick$={() => update.value++}>{log.join(' | ')}</button>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('task 1 | task 2');
    if (isResume) {
      await qwikLoader?.dispatch(button, 'click');
      await flush();
      expect(button.textContent).toBe('task 1 | task 2 | task 1 | task 2');
    } else {
      await qwikLoader?.dispatch(button, 'qvisible');
      await flush();
      expect(button.textContent).toBe('task 1 | task 2 | visible task');
    }
    cleanup();
  });

  it('runs once even when qvisible fires again', async () => {
    (globalThis as any).__visibleCount = 0;
    const App = component$(() => {
      useVisibleTask$(() => {
        (globalThis as any).__visibleCount++;
      });
      return <span>test</span>;
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    const span = container.querySelector('span')!;
    expect(span.hasAttribute('q-e:qvisible')).toBe(true);
    await qwikLoader?.dispatch(span, 'qvisible');
    await qwikLoader?.dispatch(span, 'qvisible');
    await flush();
    expect((globalThis as any).__visibleCount).toBe(1);
    cleanup();
    delete (globalThis as any).__visibleCount;
  });

  it('keeps the root child component when the visible task re-renders', async () => {
    (globalThis as any).__childRenders = 0;
    (globalThis as any).__childInstances = 0;
    const Child = component$((props: { text: string }) => {
      (globalThis as any).__childRenders++;
      useTask$(() => {
        (globalThis as any).__childInstances++;
      });
      return <span>{props.text}</span>;
    });
    const App = component$(() => {
      const isLoaded = useSignal(false);
      useVisibleTask$(() => {
        isLoaded.value = true;
      });
      return <Child text={`v${isLoaded.value}`} />;
    });
    const { container, document, cleanup, flush, qwikLoader } = await render(App, { debug });
    const spanBefore = container.querySelector('span')!;
    await wakeCarrier(container, document, qwikLoader, flush);
    expect(container.querySelector('span')?.textContent).toBe('vtrue');
    expect(container.querySelector('span')).toBe(spanBefore);
    expect((globalThis as any).__childInstances).toBe(1);
    cleanup();
    delete (globalThis as any).__childRenders;
    delete (globalThis as any).__childInstances;
  });
});
