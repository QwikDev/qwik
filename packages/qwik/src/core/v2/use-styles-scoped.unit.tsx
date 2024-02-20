import { describe, expect, it } from 'vitest';
import { component$ } from '../component/component.public';
import { _IMMUTABLE, _fnSignal } from '../internal';
import { _jsxC } from '../render/jsx/jsx-runtime';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { useStylesScoped$ } from '../use/use-styles';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe('useStylesScoped', () => {
    it('should append style', async () => {
      let styleId = '';

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScoped$(`
            .container {
                background-color: red;
            }
        `);
        styleId = stylesScopedData.scopeId;
        return <div class="container">Hello world</div>;
      });

      const { vNode } = await render(<StyledComponent />, { debug });
      expect(vNode).toMatchVDOM(
        <>
          {/* TODO: q:style */}
          {/* @ts-ignore-next-line */}
          <style q:style={styleId.substring(2)}>{`
            .container.${styleId} {
                background-color: red;
            }
        `}</style>
          <div class="container">Hello world</div>
        </>
      );
    });
  });
});
