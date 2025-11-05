import { component$, componentQrl, inlinedQrl, useId, useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';

const debug = false; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useId', ({ render }) => {
  it('should generate id', async () => {
    const Cmp = componentQrl(
      inlinedQrl(() => {
        const id = useId();
        return <div id="cmp1">{id}</div>;
      }, 's_cmpHash')
    );
    const Cmp2 = componentQrl(
      inlinedQrl(() => {
        const id = useId();
        return <div id="cmp2">{id}</div>;
      }, 's_2cmpHash')
    );

    const Parent = component$(() => {
      return (
        <>
          <Cmp />
          <Cmp2 />
        </>
      );
    });

    const { document } = await render(<Parent />, { debug });
    if (render === ssrRenderToDom) {
      expect(document.querySelector('#cmp1')?.textContent).toMatch(/^\w{3}cmp255s$/);
      expect(document.querySelector('#cmp2')?.textContent).toMatch(/^\w{3}2cm255t$/);
    } else {
      expect(document.querySelector('#cmp1')?.textContent).toMatch(/^cmp0$/);
      expect(document.querySelector('#cmp2')?.textContent).toMatch(/^Ccm1$/);
    }
  });

  it('should generate different ids for csr and ssr', async () => {
    const Checkbox = component$((props: { label: string }) => {
      const id = useId();
      return (
        <div>
          <input type="checkbox" id={id} />
          <label for={id}>{props.label}</label>
        </div>
      );
    });

    const Cmp = component$(() => {
      const enabled = useSignal(false);

      return (
        <div>
          <h1>useId Example</h1>
          <Checkbox label="Item 1" />
          <button
            onClick$={() => {
              enabled.value = !enabled.value;
            }}
          ></button>

          {enabled.value && <Checkbox label="Subitem 1" />}
        </div>
      );
    });

    const { document } = await render(<Cmp />, { debug });
    await trigger(document.body, 'button', 'click');
    const inputs = document.querySelectorAll('input');
    expect(inputs.length).toBe(2);
    expect(inputs[0].id).not.toBe(inputs[1].id);
  });
});
