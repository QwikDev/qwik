import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useOn } from '../use/use-on';
import { useSignal } from '../use/use-signal';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe('useSignal', () => {
    it('should update value', async () => {
      const Counter = component$((props: { initial: number }) => {
        const count = useSignal(props.initial);
        useOn(
          'click',
          inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])
        );
        return <button>Count: {count.value}!</button>;
      });

      const { vNode, container } = await render(<Counter initial={123} />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'123'}!</button>
        </>
      );
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>Count: {'124'}!</button>
        </>
      );
    });
  });
});
