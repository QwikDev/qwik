import { describe, expect, it } from 'vitest';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import { useSignal } from '../use/use-signal';
import { useTask$ } from '../use/use-task';
import { delay } from '../util/promises';
import { ErrorProvider, domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false;
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
    it.todo('should handle async exceptions');
    it.todo('should not run next task until previous async task is finished');
    it.todo('should execute cleanup task');
    it.todo('should rerun on track');
  });
});