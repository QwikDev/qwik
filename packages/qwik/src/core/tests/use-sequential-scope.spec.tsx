import { describe, expect, it } from 'vitest';
import { trigger, domRender, ssrRenderToDom } from '@builder.io/qwik/testing';
import { rerenderComponent } from '../../testing/rendering.unit-util';
import { componentQrl, inlinedQrl } from '@builder.io/qwik';
import { useSequentialScope } from '../use/use-sequential-scope';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('useSequentialScope', ({ render }) => {
  it('should update value', async () => {
    const MyComp = componentQrl(
      inlinedQrl(() => {
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
      }, 'MyComp')
    );

    const { vNode, container } = await render(<MyComp />, { debug });
    await trigger(container.element, 'button', 'click');

    expect(vNode).toMatchVDOM(
      <>
        <button>value: {'first_value'}</button>
      </>
    );
  });
});
