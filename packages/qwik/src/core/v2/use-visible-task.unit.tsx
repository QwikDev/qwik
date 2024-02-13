import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { Fragment as Component } from '../render/jsx/jsx-runtime';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useVisibleTaskQrl } from '../use/use-task';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

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
  });
});
