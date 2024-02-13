import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import { useSignal } from '../use/use-signal';
import { useVisibleTask$ } from '../use/use-task';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { trigger } from '../../testing/element-fixture';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';

const debug = true; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  // domRender, //
].forEach((render) => {
  describe(render.name + ': useVisibleTask', () => {
    it('should execute visible task', async () => {
      const Counter = component$(() => {
        const count = useSignal('SSR');
        useVisibleTask$(
          inlinedQrl(
            () => {
              const [count] = useLexicalScope();
              count.value = 'CSR';
              console.log('visibleTask');
            },
            's_visibleTask',
            [count]
          )
        );
        return <span>{count.value}</span>;
      });

      const { vNode, document } = await render(<Counter />, { debug });
      await trigger(document.body, 'span', 'qvisible');
      expect(vNode).toMatchVDOM(
        <Component>
          <span>CSR</span>
        </Component>
      );
    });
  });
});
