import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment, Fragment as Component } from '../render/jsx/jsx-runtime';
import type { Signal } from '../state/signal';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStore } from '../use/use-store.public';
import { useTask$, useTaskQrl } from '../use/use-task';
import { delay } from '../util/promises';
import { ErrorProvider, domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { getTestPlatform } from '../../testing/platform';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useTask', () => {
    it('should execute task', async () => {
      const Counter = component$(() => {
        const count = useSignal('wrong');
        useTask$(() => {
          count.value = 'WORKS';
        });
        return <span>{count.value}</span>;
      });

      const { vNode } = await render(<Counter />, { debug });
      expect(vNode).toMatchVDOM(
        <Component>
          <span>WORKS</span>
        </Component>
      );
    });
    it('should execute async task', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        log.push('Counter');
        const count = useSignal('wrong');
        useTask$(async () => {
          log.push('task');
          await delay(10);
          log.push('resolved');
          count.value = 'WORKS';
        });
        log.push('render');
        return <span>{count.value}</span>;
      });

      const { vNode } = await render(<Counter />, { debug });
      expect(log).toEqual(['Counter', 'task', 'resolved', 'Counter', 'render']);
      expect(vNode).toMatchVDOM(
        <Component>
          <span>WORKS</span>
        </Component>
      );
    });
    it('should handle exceptions', async () => {
      const error = new Error('HANDLE ME');
      const Counter = componentQrl(
        inlinedQrl(() => {
          useTask$(() => {
            throw error;
          });
          return <span>OK</span>;
        }, 's_counter')
      );

      try {
        await render(
          <ErrorProvider>
            <Counter />
          </ErrorProvider>,
          { debug }
        );
        expect(ErrorProvider.error).toBe(render === domRender ? error : null);
      } catch (e) {
        expect(render).toBe(ssrRenderToDom);
        expect(e).toBe(error);
      }
    });
    it('should handle async exceptions', async () => {
      const error = new Error('HANDLE ME');
      const Counter = componentQrl(
        inlinedQrl(() => {
          useTask$(async () => {
            await delay(1);
            throw error;
          });
          return <span>OK</span>;
        }, 's_counter')
      );

      try {
        await render(
          <ErrorProvider>
            <Counter />
          </ErrorProvider>,
          { debug }
        );
        expect(ErrorProvider.error).toBe(render === domRender ? error : null);
      } catch (e) {
        expect(render).toBe(ssrRenderToDom);
        expect(e).toBe(error);
      }
    });
    it('should not run next task until previous async task is finished', async () => {
      const log: string[] = [];
      const Counter = component$(() => {
        log.push('Counter');
        const count = useSignal('');
        useTask$(async () => {
          log.push('1:task');
          await delay(10);
          log.push('1:resolved');
          count.value += 'A';
        });
        useTask$(async () => {
          log.push('2:task');
          await delay(10);
          log.push('2:resolved');
          count.value += 'B';
        });
        log.push('render');
        return <span>{count.value}</span>;
      });

      const { vNode } = await render(<Counter />, { debug });
      expect(log).toEqual([
        'Counter',
        '1:task',
        '1:resolved',
        'Counter',
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
    describe('track', () => {
      it('should rerun on track', async () => {
        const Counter = component$(() => {
          const count = useSignal(10);
          const double = useSignal(0);
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [count, double] = useLexicalScope<[Signal<number>, Signal<number>]>();
                double.value = 2 * track(() => count.value);
              },
              's_task1',
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
        await getTestPlatform().flush();
      });
      it('should track store property', async () => {
        const Counter = component$(() => {
          const store = useStore({ count: 1, double: 0 });
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [s] = useLexicalScope<[typeof store]>();
                const count = track(s, 'count');
                s.double = 2 * count;
              },
              's_task2',
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
    describe('queue', () => {
      const log: string[] = [];
      it('should execute dependant tasks', async () => {
        const Counter = component$(() => {
          const store = useStore({ count: 1, double: 0, quadruple: 0 });
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                log.push('quadruple');
                const [s] = useLexicalScope<[typeof store]>();
                s.quadruple = track(s, 'double') * 2;
              },
              's_task_quadruple',
              [store]
            )
          );
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                log.push('double');
                const [s] = useLexicalScope<[typeof store]>();
                s.double = track(s, 'count') * 2;
              },
              's_task_double',
              [store]
            )
          );
          log.push('Counter');
          // console.log('Counter', store.count, store.double, store.quadruple);
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
        // console.log('log', log);
        expect(log).toEqual(['quadruple', 'double', 'Counter', 'quadruple', 'Counter']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>1/2/4</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // console.log('log', log);
        expect(log).toEqual(['double', 'quadruple', 'Counter']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>2/4/8</button>
          </Component>
        );
      });
    });
    describe('cleanup', () => {
      it('should execute cleanup task rerun on track', async () => {
        const log: string[] = [];
        const Counter = component$(() => {
          const count = useSignal(0);
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [c] = useLexicalScope<[typeof count]>();
                const _count = track(() => c.value);
                log.push('task: ' + _count);
                return () => log.push('cleanup: ' + _count);
              },
              's_task',
              [count]
            )
          );
          log.push('Counter: ' + count.value);
          return (
            <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_c', [count])}>
              {count.value}
            </button>
          );
        });
        const isCSR = render === domRender;

        const { vNode, document } = await render(<Counter />, { debug });
        // console.log('log', log);
        expect(log).toEqual(
          isCSR ? ['task: 0', 'Counter: 0'] : ['task: 0', 'Counter: 0', 'cleanup: 0']
        );
        expect(vNode).toMatchVDOM(
          <Component>
            <button>0</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // console.log('log', log);
        expect(log).toEqual(
          isCSR ? ['cleanup: 0', 'task: 1', 'Counter: 1'] : ['task: 1', 'Counter: 1']
        );
        expect(vNode).toMatchVDOM(
          <Component>
            <button>1</button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // console.log('log', log);
        expect(log).toEqual(['cleanup: 1', 'task: 2', 'Counter: 2']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>2</button>
          </Component>
        );
      });
      it('should execute cleanup task on unmount', async () => {
        const log: string[] = [];
        const Child = component$(() => {
          useTaskQrl(
            inlinedQrl(({ cleanup }) => {
              log.push('task:');
              cleanup(() => log.push('cleanup:'));
            }, 's_task')
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
              {show.value ? <Child /> : null}
            </button>
          );
        });
        const isCSR = render === domRender;

        const { vNode, document } = await render(<Parent />, { debug });
        // console.log('log', log);
        expect(log).toEqual(isCSR ? ['task:', 'Child'] : ['task:', 'Child', 'cleanup:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              <Component>
                <span>Child</span>
              </Component>
            </button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // console.log('log', log);
        expect(log).toEqual(isCSR ? ['cleanup:'] : []);
        expect(vNode).toMatchVDOM(
          <Component>
            <button></button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');

        expect(log).toEqual(['task:', 'Child']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button>
              <Component>
                <span>Child</span>
              </Component>
            </button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
        // console.log('log', log);
        expect(log).toEqual(['cleanup:']);
        expect(vNode).toMatchVDOM(
          <Component>
            <button></button>
          </Component>
        );
        log.length = 0;
        await trigger(document.body, 'button', 'click');
      });
      it('should handle promises and tasks', async () => {
        const log: string[] = [];
        const MyComp = component$(() => {
          log.push('render');
          const promise = useSignal<Promise<number>>();

          // Tasks should run one after the other, awaiting returned promises.
          // Here we "sideload" a promise via the signal
          useTask$(() => {
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
          });

          useTask$(async () => {
            log.push('2a');
            await delay(10);
            log.push('2b');
          });

          useTask$(() => {
            promise.value = promise.value!.then(() => {
              log.push('3b');
              return 3;
            });
            log.push('3a');
          });

          return <p>Should have a number: "{promise.value}"</p>;
        });
        const { vNode } = await render(<MyComp />, { debug });
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
          // render waited until task 2 finished
          // re-render because of signal change in task 1
          'render',
          // task 3 runs sync and attaches to the promise
          '3a',
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

 describe('regression', () => {
    it('#5782', async () => {
      // TODO: not finished!
      const Issue5782 = component$(() => {
        const counterDefault = useSignal(0);
        const sig = useSignal(counterDefault);
        const showChild = useSignal(false);
        return (
          <>
            <button
              id="decrease"
              onClick$={inlinedQrl(
                () => {
                  const [sig] = useLexicalScope();
                  sig.value.value--;
                },
                's_decrease',
                [sig]
              )}
            >
              --
            </button>
            {sig.value.value}
            <button
              id="increase"
              onClick$={inlinedQrl(
                () => {
                  const [sig] = useLexicalScope();
                  sig.value.value++;
                },
                's_increase',
                [sig]
              )}
            >
              ++
            </button>
            <button
              id="toggle"
              onClick$={inlinedQrl(
                () => {
                  const [showChild] = useLexicalScope();
                  showChild.value = !showChild.value;
                },
                's_toggle',
                [showChild]
              )}
            >
              Toggle
            </button>
            {showChild.value && <Child sig={sig} />}
          </>
        );
      });

      const Child = component$(({ sig }: { sig: Signal<Signal<number>> }) => {
        const counter = useSignal(0);
        useTask$(({ track }) => {
          track(sig);
          sig.value = counter;
        });
        return <p>{counter.value}</p>;
      });

      const { vNode, document } = await render(<Issue5782 />, { debug });

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            {'0'}
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            {''}
          </Fragment>
        </Component>
      );

      await trigger(document.body, '#toggle', 'click');

      expect(vNode).toMatchVDOM(
        <Component>
          <Fragment>
            <button id="decrease">--</button>
            {'0'}
            <button id="increase">++</button>
            <button id="toggle">Toggle</button>
            <Component>
              <p>0</p>
            </Component>
          </Fragment>
        </Component>
      );
    });
  });
});
