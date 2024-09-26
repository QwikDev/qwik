import { component$, useSignal, useVisibleTask$, Fragment as Component } from '@builder.io/qwik';
import { domRender, ssrRenderToDom, trigger } from '@builder.io/qwik/testing';
import { describe, expect, it } from 'vitest';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: ref', ({ render }) => {
  describe('useVisibleTask$', () => {
    it('should handle ref prop', async () => {
      const Cmp = component$(() => {
        const v = useSignal<Element>();
        useVisibleTask$(() => {
          v.value!.textContent = 'Abcd';
        });
        return <p ref={v}>Hello Qwik</p>;
      });

      const { document } = await render(<Cmp />, { debug });

      if (render === ssrRenderToDom) {
        await trigger(document.body, 'p', 'qvisible');
      }

      await expect(document.querySelector('p')).toMatchDOM(<p>Abcd</p>);
    });
  });

  it('should execute function', async () => {
    (global as any).logs = [] as string[];
    const Cmp = component$(() => {
      return (
        <div
          ref={(element) => {
            (global as any).logs.push('ref function', element);
          }}
        ></div>
      );
    });

    const { vNode } = await render(<Cmp />, { debug });

    expect(vNode).toMatchVDOM(
      <Component>
        <div></div>
      </Component>
    );

    expect((global as any).logs[0]).toEqual('ref function');
    expect((global as any).logs[1]).toBeDefined();
    (global as any).logs = undefined;
  });
});
