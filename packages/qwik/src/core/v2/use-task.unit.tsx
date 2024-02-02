import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import type { Signal } from '../state/signal';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useTask$, useTaskQrl } from '../use/use-task';
import { delay } from '../util/promises';
import { ErrorProvider, domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

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

      await render(
        <ErrorProvider>
          <Counter />
        </ErrorProvider>,
        { debug }
      );
      expect(ErrorProvider.error).toBe(error);
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

      await render(
        <ErrorProvider>
          <Counter />
        </ErrorProvider>,
        { debug }
      );
      expect(ErrorProvider.error).toBe(error);
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
          count.value += '1';
        });
        useTask$(async () => {
          log.push('2:task');
          await delay(10);
          log.push('2:resolved');
          count.value += '2';
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
          <span>12</span>
        </Component>
      );
    });
    describe('track', () => {
      it('should rerun on track', async () => {
        const Counter = component$(() => {
          const count = useSignal(1);
          const double = useSignal(0);
          useTaskQrl(
            inlinedQrl(
              ({ track }) => {
                const [count, double] = useLexicalScope<[Signal<number>, Signal<number>]>();
                double.value = 2 * track(() => count.value);
              },
              's_task',
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
                's_click',
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
      it.todo('should track signal property');
    });
    describe('cleanup', () => {
      it.todo('should execute cleanup task rerun on track');
      it.todo('should execute cleanup task on unmount');
    });
  });
});