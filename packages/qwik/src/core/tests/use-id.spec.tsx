import { component$, componentQrl, inlinedQrl, useId } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';

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
      expect(document.querySelector('#cmp1')?.textContent).toMatch(/^\w{3}cmp0$/);
      expect(document.querySelector('#cmp2')?.textContent).toMatch(/^\w{3}2cm1$/);
    } else {
      expect(document.querySelector('#cmp1')?.textContent).toMatch(/^cmp0$/);
      expect(document.querySelector('#cmp2')?.textContent).toMatch(/^Ccm1$/);
    }
  });
});
