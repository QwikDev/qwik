import { component$, componentQrl, inlinedQrl, useId } from '@builder.io/qwik';
import { describe, expect, it } from 'vitest';
import { domRender, ssrRenderToDom } from '../../testing/rendering.unit-util';
import '../../testing/vdom-diff.unit-util';

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
      }, 's_cmp2Hash')
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
    expect(document.querySelector('#cmp1')?.textContent).toMatch(/^\w*-cmpHash-0*$/);
    expect(document.querySelector('#cmp2')?.textContent).toMatch(/^\w*-cmp2Hash-1*$/);
  });
});
