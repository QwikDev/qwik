import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component, Fragment } from '../render/jsx/jsx-runtime';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useVisibleTaskQrl } from '../use/use-task';
import { ErrorProvider, domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { delay } from '../util/promises';
import type { Signal } from '../state/signal';
import { useStore } from '../use/use-store.public';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useVisibleTask', () => {
    it('should execute visible task', async () => {
      const VisibleCmp = componentQrl(
        inlinedQrl(() => {
          const state = useSignal('SSR');
          useVisibleTaskQrl(
            inlinedQrl(
              () => {
                const [s] = useLexicalScope();
                s.value = 'CSR';
              },
              's_visibleTask',
              [state]
            )
          );
          return <span>{state.value}</span>;
        }, 's_visible_cmp')
      );

      const { vNode, document } = await render(<VisibleCmp />, { debug });
      await trigger(document.body, 'span', 'qvisible');
      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });

    it('should execute visible task with strategy document-ready', async () => {
      const VisibleCmp = componentQrl(
        inlinedQrl(() => {
          const state = useSignal('SSR');
          useVisibleTaskQrl(
            inlinedQrl(
              () => {
                const [s] = useLexicalScope();
                s.value = 'CSR';
              },
              's_visibleTask',
              [state]
            ),
            {
              strategy: 'document-ready',
            }
          );
          return <span>{state.value}</span>;
        }, 's_visible_cmp')
      );

      const { vNode, document } = await render(<VisibleCmp />, { debug });
      await trigger(document.body, 'span', ':document:qinit');
      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });

    it('should execute visible task with strategy document-idle', async () => {
      const VisibleCmp = componentQrl(
        inlinedQrl(() => {
          const state = useSignal('SSR');
          useVisibleTaskQrl(
            inlinedQrl(
              () => {
                const [s] = useLexicalScope();
                s.value = 'CSR';
              },
              's_visibleTask',
              [state]
            ),
            {
              strategy: 'document-idle',
            }
          );
          return <span>{state.value}</span>;
        }, 's_visible_cmp')
      );

      const { vNode, document } = await render(<VisibleCmp />, { debug });
      await trigger(document.body, 'span', ':document:qidle');

      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });

    it('should execute async visible task', async () => {
      const log: string[] = [];
      const VisibleCmp = componentQrl(
        inlinedQrl(() => {
          log.push('VisibleCmp');
          const state = useSignal('SSR');
          useVisibleTaskQrl(
            inlinedQrl(
              async () => {
                const [state] = useLexicalScope();
                log.push('task');
                await delay(10);
                log.push('resolved');
                state.value = 'CSR';
              },
              's_visibleTask',
              [state]
            )
          );
          log.push('render');
          return <span>{state.value}</span>;
        }, 's_visible_cmp')
      );
      const { vNode, document } = await render(<VisibleCmp />, { debug });
      await trigger(document.body, 'span', 'qvisible');
      expect(log).toEqual(['VisibleCmp', 'render', 'task', 'resolved', 'VisibleCmp', 'render']);
      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });

    it('should handle exception', async () => {
      const error = new Error('HANDLE ME');
      const VisibleCmp = component$(() => {
        const state = useSignal('SSR');
        useVisibleTaskQrl(
          inlinedQrl(
            () => {
              throw error;
            },
            's_visibleTask',
            []
          )
        );
        return <span>{state.value}</span>;
      });
      const { document } = await render(
        <ErrorProvider>
          <VisibleCmp />
        </ErrorProvider>,
        { debug }
      );
      await trigger(document.body, 'span', 'qvisible');
      expect(ErrorProvider.error).toBe(render === domRender ? error : null);
    });

    it('should handle async exception', async () => {
      const error = new Error('HANDLE ME');
      const VisibleCmp = component$(() => {
        const state = useSignal('SSR');
        useVisibleTaskQrl(
          inlinedQrl(
            async () => {
              await delay(1);
              throw error;
            },
            's_visibleTask',
            []
          )
        );
        return <span>{state.value}</span>;
      });

      const { document } = await render(
        <ErrorProvider>
          <VisibleCmp />
        </ErrorProvider>,
        { debug }
      );
      await trigger(document.body, 'span', 'qvisible');
      expect(ErrorProvider.error).toBe(render === domRender ? error : null);
    });

    it('should not run next visible task until previous async visible task is finished', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        log.push('Counter');
        const count = useSignal('');

        useVisibleTaskQrl(
          inlinedQrl(
            async () => {
              const [count] = useLexicalScope();
              log.push('1:task');
              await delay(10);
              log.push('1:resolved');
              count.value += 'A';
            },
            's_visibleTask1',
            [count]
          )
        );

        useVisibleTaskQrl(
          inlinedQrl(
            async () => {
              const [count] = useLexicalScope();
              log.push('2:task');
              await delay(10);
              log.push('2:resolved');
              count.value += 'B';
            },
            's_visibleTask2',
            [count]
          )
        );
        log.push('render');
        return <span>{count.value}</span>;
      });

      const { vNode, document } = await render(<Counter />, { debug });
      await trigger(document.body, 'span', 'qvisible');
      expect(log).toEqual([
        'Counter',
        'render',
        '1:task',
        '1:resolved',
        '2:task',
        '2:resolved',
        'Counter',
        'render',
      ]);
      expect(vNode).toMatchVDOM(
        <Component>
          <span>AB</span>
        </Component>
      );
    });

    describe(render.name + ': track', () => {
      it('should rerun on track', async () => {
        const Counter = component$(() => {
          const count = useSignal(10);
          const double = useSignal(0);

          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [count, double] = useLexicalScope<[Signal<number>, Signal<number>]>();
                double.value = 2 * track(count);
              },
              's_visibleTask1',
              [count, double]
            )
          );
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const [count] = useLexicalScope<[Signal<number>]>();
                  count.value++;
                },
                's_click1',
                [count]
              )}
            >
              {double.value}
            </button>
          );
        });

        const { vNode, document } = await render(<Counter />, { debug });
        await trigger(document.body, 'button', 'qvisible');
        expect(vNode).toMatchVDOM(
          <Component>
            <button>20</button>
          </Component>
        );
        await trigger(document.body, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <button>22</button>
          </Component>
        );
      });

      it('should track store property', async () => {
        const Counter = component$(() => {
          const store = useStore({ count: 1, double: 0 });
          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [s] = useLexicalScope<[typeof store]>();
                const count = track(s, 'count');
                s.double = 2 * count;
              },
              's_visibleTask2',
              [store]
            )
          );
          return (
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].count++, 's_c', [store])}>
              {store.double}
            </button>
          );
        });

        const { vNode, document } = await render(<Counter />, { debug });
        await trigger(document.body, 'button', 'qvisible');
        expect(vNode).toMatchVDOM(
          <Component>
            <button>2</button>
          </Component>
        );
        await trigger(document.body, 'button', 'click');
        expect(vNode).toMatchVDOM(
          <Component>
            <button>4</button>
          </Component>
        );
      });
    });

    describe(render.name + ': queue', () => {
      const log: string[] = [];
      it('should execute dependant visible tasks', async () => {
        const Counter = component$(() => {
          const store = useStore({ count: 1, double: 0, quadruple: 0 });
          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                log.push('quadruple');
                const [s] = useLexicalScope<[typeof store]>();
                s.quadruple = track(s, 'double') * 2;
              },
              's_visible_task_quadruple',
              [store]
            )
          );
          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                log.push('double');
                const [s] = useLexicalScope<[typeof store]>();
                s.double = track(s, 'count') * 2;
              },
              's_visible_task_double',
              [store]
            )
          );
          log.push('Counter');
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const store = useLexicalScope()[0];
                  store.count++;
                },
                's_c',
                [store]
              )}
            >
              {store.count + '/' + store.double + '/' + store.quadruple}
            </button>
          );
        });

        const { vNode, document } = await render(<Counter />, { debug });
        await trigger(document.body, 'button', 'qvisible');
        expect(log).toEqual(['Counter', 'quadruple', 'double', 'quadruple', 'Counter']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>1/2/4</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        expect(log).toEqual(['double', 'quadruple', 'Counter']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>2/4/8</button>
          </Component>
        );
      });
    });

    describe(render.name + ': cleanup', () => {
      it('should execute cleanup visible task rerun on track', async () => {
        const log: string[] = [];
        const Counter = component$(() => {
          const count = useSignal(0);
          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [c] = useLexicalScope<[typeof count]>();
                const _count = track(() => c.value);
                log.push('task: ' + _count);
                return () => log.push('cleanup: ' + _count);
              },
              's_visible_task',
              [count]
            )
          );
          log.push('Counter: ' + count.value);
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const [signal] = useLexicalScope();
                  signal.value++;
                },
                's_c',
                [count]
              )}
            >
              {count.value}
            </button>
          );
        });

        const { vNode, document } = await render(<Counter />, { debug });
        await trigger(document.body, 'button', 'qvisible');
        expect(log).toEqual(['Counter: 0', 'task: 0']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>0</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // expect(log).toEqual(['cleanup: 0', 'task: 1', 'Counter: 1']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>1</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        expect(log).toEqual(['cleanup: 1', 'task: 2', 'Counter: 2']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>2</button>
          </Component>
        );
      });

      it('should execute cleanup visible task on unmount', async () => {
        let log: string[] = [];
        const Child = component$(() => {
          useVisibleTaskQrl(
            inlinedQrl(({ cleanup }) => {
              log.push('task:');
              cleanup(() => log.push('cleanup:'));
            }, 's_visible_task')
          );
          log.push('Child');
          return <span>Child</span>;
        });
        const Parent = component$(() => {
          const show = useSignal(true);
          return (
            <button
              onClick$={inlinedQrl(
                () => {
                  const [show] = useLexicalScope();
                  show.value = !show.value;
                },
                's_toggle',
                [show]
              )}
            >
              {show.value ? <Child /> : 'click'}
            </button>
          );
        });

        const { vNode, document } = await render(<Parent />, { debug });
        await trigger(document.body, 'span', 'qvisible');
        expect(log).toEqual(['Child', 'task:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              <Component>
                <span>Child</span>
              </Component>
            </button>
          </Component>
        );
        log = [];
        await trigger(document.body, 'button', 'click');

        expect(log).toEqual(['cleanup:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>{'click'}</button>
          </Component>
        );
        log = [];
        await trigger(document.body, 'button', 'click');
        await trigger(document.body, 'span', 'qvisible');

        expect(log).toEqual(['Child', 'task:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              <Component>
                <span>Child</span>
              </Component>
            </button>
          </Component>
        );
        log = [];
        await trigger(document.body, 'button', 'click');

        expect(log).toEqual(['cleanup:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>{'click'}</button>
          </Component>
        );
        log = [];
        await trigger(document.body, 'button', 'click');
      });

      it('should handle promises and tasks', async () => {
        const log: string[] = [];
        const MyComp = component$(() => {
          log.push('render');
          const promise = useSignal<Promise<number>>();

          // Tasks should run one after the other, awaiting returned promises.
          // Here we "sideload" a promise via the signal
          useVisibleTaskQrl(
            inlinedQrl(
              () => {
                const [promise] = useLexicalScope<[Signal<Promise<number>>]>();
                promise.value = Promise.resolve(0)
                  .then(() => {
                    log.push('inside.1');
                    return delay(10);
                  })
                  .then(() => {
                    log.push('1b');
                    return 1;
                  });
                log.push('1a');
              },
              's_visible_task1',
              [promise]
            )
          );

          useVisibleTaskQrl(
            inlinedQrl(
              async () => {
                log.push('2a');
                await delay(10);
                log.push('2b');
              },
              's_visible_task2',
              []
            )
          );

          useVisibleTaskQrl(
            inlinedQrl(
              () => {
                const [promise] = useLexicalScope<[Signal<Promise<number>>]>();
                promise.value = promise.value!.then(() => {
                  log.push('3b');
                  return 3;
                });
                log.push('3a');
              },
              's_visible_task3',
              [promise]
            )
          );

          return <p>Should have a number: "{promise.value}"</p>;
        });
        const { vNode, document } = await render(<MyComp />, { debug });
        await trigger(document.body, 'p', 'qvisible');
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
          // re-render because of signal change in task 1
          'render',
          // microtasks run
          '1b',
          '3b',
        ]);
        // The DOM should have the final value of the sideloaded promise
        expect(vNode).toMatchVDOM(
          <Component>
            <p>
              Should have a number: "<Fragment>3</Fragment>"
            </p>
          </Component>
        );
      });
    });
  });
});
