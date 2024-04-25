import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { useSequentialScope } from '../use/use-sequential-scope';
import { domRender, rerenderComponent, ssrRenderToDom } from '../../testing/rendering.unit-util';
import '../../testing/vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('useSequentialScope', ({ render }) => {
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

    const { vNode, container } = await render(<MyComp />, { debug });
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <>
        <button>value: {'first_value'}</button>
      </>
    );
  });
});
