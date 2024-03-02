import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$, componentQrl } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSequentialScope } from '../use/use-sequential-scope';
import { rerenderComponent, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { useSignal } from '../use/use-signal';
import { Fragment } from '@builder.io/qwik/jsx-runtime';

describe('useSequentialScope', () => {
  it('should update value', async () => {
    const MyComp = component$(() => {
      const { set, i, val } = useSequentialScope();
      if (val == null) {
        set('first_value');
      }

      return (
        <button
          onClick$={inlinedQrl(
            async (e, t: HTMLElement) => {
              const [i] = useLexicalScope();
              expect(i).toEqual(0);
              await rerenderComponent(t);
            },
            's_onClick',
            [i]
          )}
        >
          value: {val as string | null}
        </button>
      );
    });

    const { vNode, container } = await ssrRenderToDom(<MyComp />, { debug: false });
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <>
        <button>value: {'first_value'}</button>
      </>
    );
  });
});
