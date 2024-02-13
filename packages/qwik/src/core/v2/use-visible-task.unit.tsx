import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useVisibleTaskQrl } from '../use/use-task';
import { ErrorProvider, domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { delay } from '../util/promises';
import type { Signal } from '../state/signal';
import { useStore } from '../use/use-store.public';
import { getTestPlatform } from '../../testing/platform';

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

    it('should execute async visible task', async () => {
      const log: string[] = [];
      const VisibleCmp = componentQrl(inlinedQrl(() => {
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
      }, 's_visible_cmp'));
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
          inlinedQrl(async () => {
            const [count] = useLexicalScope();
            log.push('1:task');
            await delay(10);
            log.push('1:resolved');
            count.value += 'A';
          },
            's_visibleTask1',
            [count]
          ));
        useVisibleTaskQrl(
          inlinedQrl(async () => {
            const [count] = useLexicalScope();
            log.push('2:task');
            await delay(10);
            log.push('2:resolved');
            count.value += 'B';
          },
            's_visibleTask2',
            [count]
          ));
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
      it('should track signal property', async () => {
        const Counter = component$(() => {
          const store = useStore({ count: 1, double: 0 });
          useVisibleTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [s] = useLexicalScope<[typeof store]>();
                s.double = -2 * s.count;
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
  });
});
