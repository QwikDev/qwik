import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { ssrRenderToDom } from './render.unit';
import './vdom-diff.unit';

describe('useSignal', () => {
  it('should update value', async () => {
    const Counter = component$((props: { initial: number }) => {
      const count = useSignal(props.initial);
      return (
        <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
          Count: {count.value}!
        </button>
      );
    });

    const { vNode, container } = await ssrRenderToDom(<Counter initial={123} />, { debug: false });
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
