import {
  Fragment as Component,
  component$,
  createContextId,
  Fragment,
  Fragment as Projection,
  Fragment as Signal,
  type Signal as SignalType,
  Slot,
  useComputed$,
  useContext,
  useContextProvider,
  useSignal,
  useStore,
  useVisibleTask$,
} from '@qwik.dev/core';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { ErrorProvider } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';

const debug = false; //true;
Error.stackTraceLimit = 100;

export function useDelay(value: string) {
  const ready = useSignal('---');
  useVisibleTask$(() => {
    ready.value = value;
  });
  return ready;
}

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useVisibleTask', ({ render }) => {
  it('should execute visible task', async () => {
    const VisibleCmp = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(() => {
        state.value = 'CSR';
      });
      return <span>{state.value}</span>;
    });

    const { vNode, document } = await render(<VisibleCmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'span', 'qvisible');
    }
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <span>
          <Signal ssr-required>CSR</Signal>
        </span>
      </Component>
    );
  });

  it('should execute visible task with strategy document-ready', async () => {
    const VisibleCmp = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(
        () => {
          state.value = 'CSR';
        },
        {
          strategy: 'document-ready',
        }
      );
      return <span>{state.value}</span>;
    });

    const { vNode, document } = await render(<VisibleCmp />, { debug });
    await trigger(document.body, 'span', ':document:qinit');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <span>
          <Signal ssr-required>CSR</Signal>
        </span>
      </Component>
    );
  });

  it('should execute visible task with strategy document-idle', async () => {
    const VisibleCmp = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(
        () => {
          state.value = 'CSR';
        },
        {
          strategy: 'document-idle',
        }
      );
      return <span>{state.value}</span>;
    });

    const { vNode, document } = await render(<VisibleCmp />, { debug });
    await trigger(document.body, 'span', ':document:qidle');

    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <span>
          <Signal ssr-required>CSR</Signal>
        </span>
      </Component>
    );
  });

  it('should execute async visible task', async () => {
    (globalThis as any).log = [] as string[];
    const VisibleCmp = component$(() => {
      (globalThis as any).log.push('VisibleCmp');
      const state = useSignal('SSR');

      useVisibleTask$(async () => {
        (globalThis as any).log.push('task');
        await delay(10);
        (globalThis as any).log.push('resolved');
        state.value = 'CSR';
      });

      (globalThis as any).log.push('render');
      return <span>{state.value}</span>;
    });
    const { vNode, document } = await render(<VisibleCmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'span', 'qvisible');
    }
    expect((globalThis as any).log).toEqual(['VisibleCmp', 'render', 'task', 'resolved']);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <span>
          <Signal ssr-required>CSR</Signal>
        </span>
      </Component>
    );
    (globalThis as any).log = undefined;
  });

  it('should handle exception', async () => {
    const error = new Error('HANDLE ME');
    const VisibleCmp = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(() => {
        throw error;
      });
      return <span>{state.value}</span>;
    });
    const { document } = await render(
      <ErrorProvider>
        <VisibleCmp />
      </ErrorProvider>,
      { debug }
    );
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'span', 'qvisible');
    }
    expect(ErrorProvider.error).toBe(render === domRender ? error : null);
  });

  it('should handle async exception', async () => {
    const error = new Error('HANDLE ME');
    const VisibleCmp = component$(() => {
      const state = useSignal('SSR');
      useVisibleTask$(async () => {
        await delay(1);
        throw error;
      });
      return <span>{state.value}</span>;
    });

    const { document } = await render(
      <ErrorProvider>
        <VisibleCmp />
      </ErrorProvider>,
      { debug }
    );
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'span', 'qvisible');
    }
    expect(ErrorProvider.error).toBe(render === domRender ? error : null);
  });

  it('should not run next visible task until previous async visible task is finished', async () => {
    (globalThis as any).log = [] as string[];
    const Counter = component$(() => {
      (globalThis as any).log.push('Counter');
      const count = useSignal('');

      useVisibleTask$(async () => {
        (globalThis as any).log.push('1:task');
        await delay(10);
        (globalThis as any).log.push('1:resolved');
        count.value += 'A';
      });

      useVisibleTask$(async () => {
        (globalThis as any).log.push('2:task');
        await delay(10);
        (globalThis as any).log.push('2:resolved');
        count.value += 'B';
      });
      (globalThis as any).log.push('render');
      return <span>{count.value}</span>;
    });

    const { vNode, document } = await render(<Counter />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'span', 'qvisible');
    }
    expect((globalThis as any).log).toEqual([
      'Counter',
      'render',
      '1:task',
      '2:task',
      '1:resolved',
      '2:resolved',
    ]);
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <span>
          <Signal ssr-required>AB</Signal>
        </span>
      </Component>
    );
  });

  it('should trigger in empty components', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      useVisibleTask$(() => {
        signal.value = 'run';
      });
      return <>{signal.value}</>;
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'script', ':document:qinit');
    }
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Signal ssr-required>{'run'}</Signal>
          <script hidden></script>
        </Fragment>
      </Component>
    );
  });

  it('should trigger in empty components array', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      useVisibleTask$(() => {
        signal.value = 'run';
      });
      return [<>{signal.value}</>, <>{signal.value}</>];
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'script', ':document:qinit');
    }
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <Signal ssr-required>{'run'}</Signal>
          <script hidden></script>
        </Fragment>
        <Fragment ssr-required>
          <Signal ssr-required>{'run'}</Signal>
        </Fragment>
      </Component>
    );
  });

  it('should trigger in full empty component', async () => {
    const Cmp = component$(() => {
      const signal = useSignal('empty');
      useVisibleTask$(() => {
        signal.value = 'run';
      });
      return <></>;
    });
    const { vNode, document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'script', ':document:qinit');
    }
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <script hidden></script>
        </Fragment>
      </Component>
    );
  });

  describe(render.name + ': track', () => {
    it('should rerun on track', async () => {
      const Counter = component$(() => {
        const count = useSignal(10);
        const double = useSignal(0);

        useVisibleTask$(({ track }) => {
          double.value = 2 * track(() => count.value);
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

      const { vNode, document } = await render(<Counter />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'20'}</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'22'}</Signal>
          </button>
        </Component>
      );
    });

    it('should track store property', async () => {
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0 });
        useVisibleTask$(({ track }) => {
          const count = track(store, 'count');
          store.double = 2 * count;
        });
        return <button onClick$={() => store.count++}>{store.double}</button>;
      });

      const { vNode, document } = await render(<Counter />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'button', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'2'}</Signal>
          </button>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'4'}</Signal>
          </button>
        </Component>
      );
    });
  });

  it('should add event if only script tag is present', async () => {
    (globalThis as any).counter = 0;
    const Cmp = component$(() => {
      useVisibleTask$(() => {
        (globalThis as any).counter++;
      });
      return <script />;
    });

    const { document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'script', ':document:qinit');
    }

    expect((globalThis as any).counter).toBe(1);

    (globalThis as any).counter = undefined;
  });

  it('should add script tag for visible task if only primitive child is present', async () => {
    (globalThis as any).counter = 0;
    const Cmp = component$(() => {
      useVisibleTask$(() => {
        (globalThis as any).counter++;
      });
      return 123;
    });

    const { document } = await render(<Cmp />, { debug });
    if (render === ssrRenderToDom) {
      await trigger(document.body, 'script[hidden]', ':document:qinit');
    }

    expect((globalThis as any).counter).toBe(1);

    (globalThis as any).counter = undefined;
  });

  it('should merge events if only script tag is present', async () => {
    (globalThis as any).counter = 0;
    const Cmp = component$(() => {
      useVisibleTask$(() => {
        (globalThis as any).counter++;
      });
      return (
        <script
          document:onQInit$={() => {
            (globalThis as any).counter++;
          }}
        />
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'script', ':document:qinit');

    expect((globalThis as any).counter).toBe(
      render === ssrRenderToDom
        ? // visible + inline
          2
        : // TODO: is it correct?
          // visible itself from scheduling it + inline + visible from triggering document:qinit
          3
    );

    (globalThis as any).counter = undefined;
  });

  describe(render.name + ': queue', () => {
    it('should execute dependant visible tasks', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const store = useStore({ count: 1, double: 0, quadruple: 0 });
        useVisibleTask$(({ track }) => {
          (globalThis as any).log.push('quadruple');
          store.quadruple = track(store, 'double') * 2;
        });
        useVisibleTask$(({ track }) => {
          (globalThis as any).log.push('double');
          store.double = track(store, 'count') * 2;
        });
        (globalThis as any).log.push('Counter');
        return (
          <button
            onClick$={() => {
              store.count++;
            }}
          >
            {store.count + '/' + store.double + '/' + store.quadruple}
          </button>
        );
      });

      const { vNode, document } = await render(<Counter />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'button', 'qvisible');
      }
      expect((globalThis as any).log).toEqual([
        'Counter',
        'quadruple',
        'double',
        'quadruple',
        // not called with the optimizer
        // 'Counter',
      ]);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'1/2/4'}</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).log).toEqual([
        'double',
        'quadruple',
        // not called with the optimizer
        // 'Counter',
      ]);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>2/4/8</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
    });
  });

  describe(render.name + ': cleanup', () => {
    it('should execute cleanup visible task rerun on track', async () => {
      (globalThis as any).log = [] as string[];
      const Counter = component$(() => {
        const count = useSignal(0);
        useVisibleTask$(({ track }) => {
          const _count = track(() => count.value);
          (globalThis as any).log.push('visible task: ' + _count);
          return () => (globalThis as any).log.push('cleanup: ' + _count);
        });
        (globalThis as any).log.push('Counter: ' + count.value);
        return (
          <button
            onClick$={() => {
              count.value++;
            }}
          >
            {count.value}
          </button>
        );
      });

      const { vNode, document } = await render(<Counter />, { debug });
      if (render === ssrRenderToDom) {
        await trigger(document.body, 'button', 'qvisible');
      }
      expect((globalThis as any).log).toEqual(['Counter: 0', 'visible task: 0']);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'0'}</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');
      // expect(log).toEqual(['cleanup: 0', 'task: 1', 'Counter: 1']);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Signal ssr-required>{'1'}</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');
      expect((globalThis as any).log).toEqual(['Counter: 2', 'cleanup: 1', 'visible task: 2']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Signal ssr-required>2</Signal>
          </button>
        </Component>
      );
      (globalThis as any).log = undefined;
    });

    it('should execute cleanup visible task on unmount', async () => {
      (globalThis as any).log = [] as string[];
      const Child = component$(() => {
        useVisibleTask$(({ cleanup }) => {
          (globalThis as any).log.push('visible_task:');
          cleanup(() => (globalThis as any).log.push('cleanup:'));
        });
        (globalThis as any).log.push('Child');
        return <span>Child</span>;
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button
            onClick$={() => {
              show.value = !show.value;
            }}
          >
            {show.value ? <Child /> : 'click'}
          </button>
        );
      });

      const { vNode, document } = await render(<Parent />, { debug });
      if (render === ssrRenderToDom) {
        // only if it is SSR do we need to trigger the qvisible event, in CSR visibleTasks run automatically
        await trigger(document.body, 'span', 'qvisible');
      }
      expect((globalThis as any).log).toEqual(['Child', 'visible_task:']);
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <button>
            <Component ssr-required>
              <span>Child</span>
            </Component>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');

      expect((globalThis as any).log).toEqual(['cleanup:']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{'click'}</button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');

      expect((globalThis as any).log).toEqual(['Child', 'visible_task:']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            <Component>
              <span>Child</span>
            </Component>
          </button>
        </Component>
      );
      (globalThis as any).log = [];
      await trigger(document.body, 'button', 'click');

      expect((globalThis as any).log).toEqual(['cleanup:']);
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{'click'}</button>
        </Component>
      );
      (globalThis as any).log = undefined;
    });

    it('should run cleanup with component rerender', async () => {
      const Child = component$((props: { cleanupCounter: SignalType<number> }) => {
        useVisibleTask$(({ cleanup }) => {
          cleanup(() => {
            props.cleanupCounter.value++;
          });
        });
        return <span></span>;
      });

      const Cmp = component$(() => {
        const counter = useSignal<number>(0);
        const cleanupCounter = useSignal<number>(0);
        return (
          <div>
            <button onClick$={() => counter.value++}></button>
            <Child key={counter.value} cleanupCounter={cleanupCounter} />
            {cleanupCounter.value}
          </div>
        );
      });

      const { vNode, container } = await render(<Cmp />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(container.element, 'span', 'qvisible');
      }

      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');
      await trigger(container.element, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <div>
            <button></button>
            <Component ssr-required>
              <span></span>
            </Component>
            <Signal ssr-required>{'6'}</Signal>
          </div>
        </Component>
      );
    });

    it('should handle promises and visible tasks', async () => {
      // vi.useFakeTimers();
      const MyComp = component$(() => {
        const promise = useSignal<Promise<number>>(Promise.resolve(0));

        useVisibleTask$(() => {
          promise.value = promise.value
            .then(() => {
              return delay(10);
            })
            .then(() => {
              return 1;
            });
        });

        useVisibleTask$(() => {
          promise.value = promise.value.then(() => {
            return 2;
          });
        });

        return <p>Should have a number: "{promise.value}"</p>;
      });
      const { vNode, document } = await render(<MyComp />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(document.body, 'p', 'qvisible');
      }
      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <p>
            Should have a number: "
            <Fragment ssr-required>
              <Signal ssr-required>{'2'}</Signal>
            </Fragment>
            "
          </p>
        </Component>
      );
    });
  });

  it('should not add useOn props as slot name', async () => {
    const InnerCmp = component$(() => {
      return <div></div>;
    });

    const Cmp = component$(() => {
      useVisibleTask$(() => {});
      return (
        <div>
          <Slot />
        </div>
      );
    });

    const Parent = component$(() => {
      const show = useSignal(false);
      return (
        <>
          <button onClick$={() => (show.value = true)}></button>
          <Cmp>{show.value && <InnerCmp />}</Cmp>
        </>
      );
    });

    const { vNode, container } = await render(<Parent />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>
              <Projection ssr-required>{render === ssrRenderToDom ? '' : null}</Projection>
            </div>
          </Component>
        </Fragment>
      </Component>
    );
    await trigger(container.document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          <button></button>
          <Component ssr-required>
            <div>
              <Projection ssr-required>
                <Component ssr-required>
                  <div></div>
                </Component>
              </Projection>
            </div>
          </Component>
        </Fragment>
      </Component>
    );
  });

  describe('regression', () => {
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

      const { vNode, document } = await render(<Issue1717 />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(document.body, 'div', 'qvisible');
      }

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <div>
            <p>
              <Signal ssr-required>{'valueA'}</Signal>
            </p>
            <p>
              <Signal ssr-required>{'valueB'}</Signal>
            </p>
          </div>
        </Component>
      );
    });

    it('#4432 - should cleanup child visible task with correct value', async () => {
      const ContextIssue4432 = createContextId<{ url: URL; logs: string }>('issue-4432');

      const Issue4432Child = component$(() => {
        const state = useContext(ContextIssue4432);

        const pathname = useComputed$(() => state.url.pathname);

        useVisibleTask$(({ track, cleanup }) => {
          track(() => pathname.value);

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
            <button onClick$={() => (loc.url = new URL('http://localhost:3000/other'))}>
              Change
            </button>
            <pre>{loc.logs}</pre>
            {loc.url.pathname === '/' && <Issue4432Child />}
          </>
        );
      });

      const { vNode, document } = await render(<Issue4432 />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(document.body, 'p', 'qvisible');
      }

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>Change</button>
            <pre>
              <Signal ssr-required>{'VisibleTask ChildA /\n'}</Signal>
            </pre>
            <Component ssr-required>
              <p>Child A</p>
            </Component>
          </Fragment>
        </Component>
      );

      await trigger(document.body, 'button', 'click');

      expect(vNode).toMatchVDOM(
        <Component ssr-required>
          <Fragment ssr-required>
            <button>Change</button>
            <pre>
              <Signal ssr-required>{'VisibleTask ChildA /\nCleanup ChildA /other\n'}</Signal>
            </pre>
            {''}
          </Fragment>
        </Component>
      );
    });
  });
});
