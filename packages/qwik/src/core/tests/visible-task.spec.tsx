import {
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Signal,
  createContextId,
  Slot,
  useComputed$,
  useContext,
  useContextProvider,
} from '@qwik.dev/core';
import { describe, expect, it, afterEach, onTestFinished, vi } from 'vitest';
import { testRenderer } from '../test-utils';
import { trigger } from '@qwik.dev/core/testing';
import { triggerAll, useDelay } from './test-hooks';

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

  it('sees the text its child components rendered', async () => {
    const Child = component$((props: { counters: { count: number } }) => {
      return <i>{`count ${props.counters.count}`}</i>;
    });
    const App = component$(() => {
      const counters = useStore({ count: 0 });
      const seen = useSignal('');
      const ref = useSignal<Element>();
      useVisibleTask$(
        () => {
          seen.value = ref.value!.querySelector('i')!.textContent!;
        },
        { strategy: 'document-ready' }
      );
      return (
        <div ref={ref}>
          <Child counters={counters} />
          <b>{seen.value}</b>
        </div>
      );
    });
    const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
    if (isResume) {
      await qwikLoader?.dispatch(container.querySelector('script[hidden]') ?? container, 'qinit');
    }
    await flush();
    // A visible task loads lazily after the flush (as on main); its writes need their own flush.
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('b')!.textContent).toBe('count 0');
    });
    cleanup();
  });

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

  it('watches a component for visibility when its task loads before it renders', async () => {
    const Child = component$(() => {
      useTask$(() => {});
      useVisibleTask$(() => {});
      return <span id="child">child</span>;
    });
    const App = component$(() => {
      const show = useSignal(false);
      return (
        <div>
          <button onClick$={() => (show.value = true)} />
          {show.value && <Child />}
        </div>
      );
    });
    const { container, cleanup, flush } = await render(App, { debug });
    await trigger(container, 'button', 'click');
    await vi.waitFor(async () => {
      await flush();
      expect(container.querySelector('#child')?.getAttribute('q:observed')).toBe('true');
    });
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
    await vi.waitFor(async () => {
      await flush();
      expect(span.textContent).toBe('CSR');
    });
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
  it('surfaces a thrown error from the dispatch', async () => {
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

  it('surfaces an async error from the dispatch', async () => {
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
  it('runs visible tasks in parallel', async () => {
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
    // Resumed chunks load in any order, so only the async completions prove the parallel start.
    const entries = span.textContent!.split(' ');
    expect(entries.sort()).toEqual([
      '1:done',
      '1:start',
      '2:done',
      '2:start',
      'counter',
      'last',
      'start',
    ]);
    expect(span.textContent!.indexOf('2:done')).toBeLessThan(span.textContent!.indexOf('1:done'));
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
      expect((globalThis as any).__visibleLog.toSorted()).toEqual(['task1', 'task2']);
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
    it('settles dependant visible tasks', async () => {
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
    it('runs cleanup on every remount through branch arms', async () => {
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
            {counter.value % 2 === 0 ? (
              <Child cleanupCounter={cleanupCounter} />
            ) : (
              <Child cleanupCounter={cleanupCounter} />
            )}
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
    it('chains promises through a signal across visible tasks', async () => {
      const App = component$(() => {
        const promise = useSignal<Promise<number>>(Promise.resolve(0));
        // Each task runs when its own chunk lands, so the result must not depend on their order.
        useVisibleTask$(() => {
          promise.value = promise.value.then((value) => Promise.resolve(value)).then((n) => n + 1);
        });
        useVisibleTask$(() => {
          promise.value = promise.value.then((n) => n + 2);
        });
        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { container, cleanup, flush, qwikLoader } = await render(App, { debug });
      const paragraph = container.querySelector('p')!;
      await qwikLoader?.dispatch(paragraph, 'qvisible');
      await flush();
      expect(paragraph.textContent).toBe('Should have a number: "3"');
      cleanup();
    });
  });
  it('does not run after SSR until the element is visible again', async () => {
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

describe(`${name}: useVisibleTask`, () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe(render.name + ': cleanup', () => {
    it('should run visible task once when invalidated by a signal and a ref it mounts', async () => {
      (globalThis as any).log = [] as string[];
      const Cmp = component$(() => {
        const show = useSignal(false);
        const el = useSignal<HTMLElement>();
        useVisibleTask$(() => {
          show.value;
          el.value;
          (globalThis as any).log.push(`visible task: ${show.value} ${!!el.value}`);
          return () => (globalThis as any).log.push('cleanup');
        });
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}>toggle</button>
            {show.value && <div ref={el}>shown</div>}
          </>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      await triggerAll(container, 'button', 'qvisible');
      await flush();
      expect((globalThis as any).log).toEqual(['visible task: false false']);
      (globalThis as any).log = [];
      await triggerAll(container, 'button', 'click');
      await flush();
      expect((globalThis as any).log).toEqual(['cleanup', 'visible task: true true']);
    });

    it('#9203 - should run visible task cleanups for nested components', async () => {
      (globalThis as any).log = [] as string[];
      const Grandchild = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).log.push('Grandchild mounted');
          cleanup(() => (globalThis as any).log.push('Grandchild cleanup'));
        });
        return <p id="grandchild">Grandchild</p>;
      });
      const Child = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).log.push('Child mounted');
          cleanup(() => (globalThis as any).log.push('Child cleanup'));
        });
        return (
          <div id="child">
            <p>Child</p>
            <Grandchild />
          </div>
        );
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <main>
            <button
              onClick$={() => {
                show.value = false;
              }}
            >
              Remove
            </button>
            {show.value && <Child />}
          </main>
        );
      });

      const { container, cleanup, flush } = await render(Parent, { debug });
      onTestFinished(cleanup);
      await trigger(container, '#child', 'qvisible');
      await flush();
      await trigger(container, '#grandchild', 'qvisible');
      await flush();
      expect((globalThis as any).log).toEqual(['Child mounted', 'Grandchild mounted']);

      await triggerAll(container, 'button', 'click');
      await flush();
      expect(container.querySelectorAll('#child').length).toBe(0);
      expect((globalThis as any).log.slice(0, 2)).toEqual(['Child mounted', 'Grandchild mounted']);
      expect((globalThis as any).log.slice(2).sort()).toEqual([
        'Child cleanup',
        'Grandchild cleanup',
      ]);
    });
  });

  describe('regression', () => {
    it('updates child content across a child-to-array branch', async () => {
      (globalThis as any).childRenderCounter = 0;
      (globalThis as any).childInstanceCounter = 0;
      const Child = component$<{ text: string }>((props) => {
        (globalThis as any).childRenderCounter++;
        useTask$(() => {
          (globalThis as any).childInstanceCounter++;
        });
        return <span>{props.text}</span>;
      });

      const Cmp = component$(() => {
        const isLoaded = useSignal(false);
        useVisibleTask$(() => {
          isLoaded.value = true;
        });
        const text = useComputed$(() => `v${isLoaded.value}`);
        const child = <Child text={text.value} />;
        return isLoaded.value ? [child] : child;
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      await trigger(container, container, 'd:qinit');
      await triggerAll(container, '[q-e\\:qvisible]', 'qvisible');
      await flush();

      expect(container.querySelector('span')?.textContent).toBe('vtrue');
      expect((globalThis as any).childRenderCounter).toBe(2);
      expect((globalThis as any).childInstanceCounter).toBe(2);
      expect(container.querySelectorAll('span')).toHaveLength(1);
      (globalThis as any).childRenderCounter = undefined;
      (globalThis as any).childInstanceCounter = undefined;
    });

    it('should keep every headless component instance when the list is reordered', async () => {
      (globalThis as any).childRenderCounter = 0;
      (globalThis as any).childInstanceCounter = 0;
      const Child = component$<{ label: string }>((props) => {
        (globalThis as any).childRenderCounter++;
        useTask$(() => {
          (globalThis as any).childInstanceCounter++;
        });
        return <span>{props.label}</span>;
      });

      const Headless = component$<{ name: string; index: number }>((props) => {
        useVisibleTask$(() => {});
        return <Child label={`${props.name}${props.index}`} />;
      });

      const Cmp = component$(() => {
        const names = useSignal(['a', 'b', 'c']);
        return (
          <div>
            <button onClick$={() => (names.value = [...names.value].reverse())}>reverse</button>
            {names.value.map((name, index) => (
              <Headless key={name} name={name} index={index} />
            ))}
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      await trigger(container, container, 'd:qinit');
      await triggerAll(container, '[q-e\\:qvisible]', 'qvisible');
      await flush();
      const spansBeforeReorder = Array.from(container.querySelectorAll('span'));
      expect(spansBeforeReorder.map((span) => span.textContent)).toEqual(['a0', 'b1', 'c2']);
      expect((globalThis as any).childRenderCounter).toBe(3);
      expect((globalThis as any).childInstanceCounter).toBe(3);

      await triggerAll(container, 'button', 'click');
      await flush();

      const spansAfterReorder = Array.from(container.querySelectorAll('span'));
      expect(spansAfterReorder.map((span) => span.textContent)).toEqual(['c0', 'b1', 'a2']);
      expect(spansAfterReorder[0]).toBe(spansBeforeReorder[2]);
      expect(spansAfterReorder[1]).toBe(spansBeforeReorder[1]);
      expect(spansAfterReorder[2]).toBe(spansBeforeReorder[0]);
      expect((globalThis as any).childRenderCounter).toBe(3);
      expect((globalThis as any).childInstanceCounter).toBe(3);
      // one placeholder per instance, they do not share or steal each other's

      (globalThis as any).childRenderCounter = undefined;
      (globalThis as any).childInstanceCounter = undefined;
    });

    it('#1717 - custom hooks should work', async () => {
      const Issue1717 = component$(() => {
        const val1 = useDelay('valueA');
        const val2 = useDelay('valueB');
        return (
          <div>
            <p>{val1.value}</p>
            <p>{val2.value}</p>
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Issue1717, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'div', 'qvisible');
      await flush();

      expect(container.querySelectorAll('div')).toHaveLength(1);
      expect(container.querySelector('div')!.textContent).toBe('valueAvalueB');
      expect(container.querySelectorAll('p')).toHaveLength(2);
      expect(container.querySelector('p')!.textContent).toBe('valueA');
      expect(container.querySelectorAll('p')[1]!.textContent).toBe('valueB');
    });

    it('#4432 - should cleanup child visible task with correct value', async () => {
      const ContextIssue4432 = createContextId<{ url: URL; logs: string }>('issue-4432');

      const Issue4432Child = component$(() => {
        const state = useContext(ContextIssue4432);

        const pathname = useComputed$(() => state.url.pathname);

        useVisibleTask$(({ cleanup }) => {
          pathname.value;

          // This should only run on page load for path '/'
          state.logs += `VisibleTask ChildA ${pathname.value}\n`;

          // This should only run when leaving the page
          cleanup(() => {
            state.logs += `Cleanup ChildA ${pathname.value}\n`;
          });
        });

        return <p>Child A</p>;
      });

      const Issue4432 = component$(() => {
        const loc = useStore({
          url: new URL('http://localhost:3000/'),
          logs: '',
        });
        useContextProvider(ContextIssue4432, loc);

        return (
          <>
            <button
              onClick$={() => {
                loc.url = new URL('http://localhost:3000/other');
              }}
            >
              Change
            </button>
            <pre>{loc.logs}</pre>
            {loc.url.pathname === '/' && <Issue4432Child />}
          </>
        );
      });

      const { container, cleanup, flush } = await render(Issue4432, { debug });
      onTestFinished(cleanup);

      await triggerAll(container, 'p', 'qvisible');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Change');
      expect(container.querySelectorAll('pre')).toHaveLength(1);
      expect(container.querySelector('pre')!.textContent).toBe('VisibleTask ChildA /\n');
      expect(container.querySelectorAll('p')).toHaveLength(1);
      expect(container.querySelector('p')!.textContent).toBe('Child A');

      await triggerAll(container, 'button', 'click');
      await flush();

      expect(container.querySelectorAll('button')).toHaveLength(1);
      expect(container.querySelector('button')!.textContent).toBe('Change');
      expect(container.querySelectorAll('pre')).toHaveLength(1);
      expect(container.querySelector('pre')!.textContent).toBe(
        'VisibleTask ChildA /\nCleanup ChildA /other\n'
      );
      expect(container.querySelectorAll('p')).toHaveLength(0);
    });

    it('#8309 -should run visible cleanup on unmount', async () => {
      (globalThis as any).log = [] as string[];
      const Foo = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).log.push('entry /foo');
          cleanup(() => {
            (globalThis as any).log.push('cleanup /foo');
          });
          return () => {
            (globalThis as any).log.push('return /foo');
          };
        });

        return (
          <div>
            <p>You are in /foo</p>
          </div>
        );
      });

      const Layout = component$(() => {
        return <Slot />;
      });

      const Main = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).log.push('entry /');
          cleanup(() => {
            (globalThis as any).log.push('cleanup /');
          });
          return () => {
            (globalThis as any).log.push('return /');
          };
        });

        return (
          <div>
            <p>You are in /</p>
          </div>
        );
      });

      const Cmp = component$(() => {
        const toggle = useSignal(true);
        return (
          <div>
            <h1>Hello from Qwik!</h1>
            <button
              onClick$={() => {
                toggle.value = !toggle.value;
              }}
            >
              toggle
            </button>
            {toggle.value ? (
              <Main />
            ) : (
              <Layout>
                <Foo />
              </Layout>
            )}
          </div>
        );
      });

      const { container, cleanup, flush } = await render(Cmp, { debug });
      onTestFinished(cleanup);
      await triggerAll(container, 'div', 'qvisible');
      await flush();
      expect((globalThis as any).log).toEqual(['entry /']);
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'div', 'qvisible');
      await flush();
      expect((globalThis as any).log).toEqual(['entry /', 'cleanup /', 'return /', 'entry /foo']);
      await triggerAll(container, 'button', 'click');
      await flush();
      await triggerAll(container, 'div', 'qvisible');
      await flush();
      expect((globalThis as any).log).toEqual([
        'entry /',
        'cleanup /',
        'return /',
        'entry /foo',
        'cleanup /foo',
        'return /foo',
        'entry /',
      ]);
    });
  });
  it('should await returned async cleanup before rerun', async () => {
    (globalThis as any).log = [] as string[];
    const Counter = component$(() => {
      const count = useSignal(0);
      useVisibleTask$(() => {
        const current = count.value;
        (globalThis as any).log.push(`task:${current}`);
        return async () => {
          (globalThis as any).log.push(`cleanup:${current}:start`);
          if (current === 0) {
            await new Promise<void>((resolve) => {
              (globalThis as any).__releaseVisibleCleanup = resolve;
            });
          }
          (globalThis as any).log.push(`cleanup:${current}:end`);
        };
      });
      return <button onClick$={() => count.value++}>{count.value}</button>;
    });
    const { container, cleanup, flush } = await render(Counter, { debug });
    onTestFinished(cleanup);
    await triggerAll(container, 'button', 'qvisible');
    expect((globalThis as any).log).toEqual(['task:0']);
    const clicked = triggerAll(container, 'button', 'click');
    await vi.waitFor(() =>
      expect((globalThis as any).__releaseVisibleCleanup).toBeTypeOf('function')
    );
    expect((globalThis as any).log).toEqual(['task:0', 'cleanup:0:start']);
    (globalThis as any).__releaseVisibleCleanup();
    delete (globalThis as any).__releaseVisibleCleanup;
    await clicked;
    await flush();
    await vi.waitFor(() => {
      expect((globalThis as any).log).toEqual([
        'task:0',
        'cleanup:0:start',
        'cleanup:0:end',
        'task:1',
      ]);
    });
  });
});
