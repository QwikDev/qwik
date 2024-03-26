import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { useSequentialScope } from '../use/use-sequential-scope';
import { rerenderComponent, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

describe('useSequentialScope', () => {
  it('should update value', async () => {
    const MyComp = component$(() => {
      const { set, i, val } = useSequentialScope();
      if (val == null) {
        set('first_value');
      }

      return (
        <button
          onClick$={async (e, t: HTMLElement) => {
            expect(i).toEqual(0);
            await rerenderComponent(t);
          }}
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
