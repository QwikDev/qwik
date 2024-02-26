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

  it('should rerender components correctly', async () => {
    const Component1 = componentQrl(
      inlinedQrl(() => {
        const signal1 = useSignal(1);
        return (
          <div>
            <span>Component 1</span>
            {signal1.value}
          </div>
        );
      }, 's_cmp1')
    );
    const Component2 = componentQrl(
      inlinedQrl(() => {
        const signal2 = useSignal(2);
        return (
          <div>
            <span>Component 2</span>
            {signal2.value}
          </div>
        );
      }, 's_cmp2')
    );
    const Parent = componentQrl(
      inlinedQrl(() => {
        const show = useSignal(true);
        return (
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <Component1 />}
            <Component2 />
          </button>
        );
      }, 's_parent')
    );
    const { vNode, container } = await ssrRenderToDom(<Parent />, { debug: true });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button>
          {''}
          <Fragment>
            <div>
              <span>Component 2</span>2
            </div>
          </Fragment>
        </button>
      </>
    );
  });
});
