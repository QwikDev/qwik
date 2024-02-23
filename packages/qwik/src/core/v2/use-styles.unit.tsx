import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { useStyles$ } from '../use/use-styles';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe.only('useStyles', () => {
    it('should apply the style', async () => {
      const TestComponent = component$(() => {
        useStyles$(`.my-text { color: red; }`);
        return <span class="my-text">Some text</span>;
      });

      const { vNode } = await render(<TestComponent />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          <span class="my-text">Some text</span>
        </>
      );
    });
  });
});
