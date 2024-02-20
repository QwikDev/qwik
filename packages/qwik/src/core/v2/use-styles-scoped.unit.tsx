import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { getScopedStyles } from '../style/scoped-stylesheet';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStylesScoped$ } from '../use/use-styles';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe('useStylesScoped', () => {
    const STYLE = `.container {background-color: red;}`;
    it('should render style', async () => {
      let rawStyleId = '';

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScoped$(STYLE);
        rawStyleId = stylesScopedData.scopeId;
        return <div>Hello world</div>;
      });

      const { vNode, styles } = await render(<StyledComponent />, { debug });
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE, styleId);
      if (render == ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <>
            {/* @ts-ignore-next-line */}
            <style q:style={styleId}>{scopeStyle}</style>
            <div>Hello world</div>
          </>
        );
      } else {
        expect(styles).toEqual({
          [styleId]: scopeStyle,
        });
        expect(vNode).toMatchVDOM(
          <>
            <div>Hello world</div>
          </>
        );
      }
    });
    it('should move style to <head> on rerender', async () => {
      let rawStyleId = '';

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScoped$(STYLE);
        const count = useSignal(0);
        rawStyleId = stylesScopedData.scopeId;
        return (
          <button onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}>
            {count.value}
          </button>
        );
      });

      const { vNode, container } = await render(<StyledComponent />, { debug });
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE, styleId);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button>1</button>
        </>
      );
      console.log(container.document.body.parentElement?.outerHTML);
      const style = container.document.querySelector('style[q\\:style]');
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${scopeStyle}</style>`);
    });
    it('should save styles when JSX deleted', async () => {
      let rawStyleId = '';

      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <StyledComponent />}
          </button>
        );
      });

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScoped$(STYLE);
        rawStyleId = stylesScopedData.scopeId;
        return <div>Hello world</div>;
      });

      const { vNode, container } = await render(<Parent />, { debug });
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE, styleId);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>{''}</button>
        </Component>
      );
      console.log(container.document.body.parentElement?.outerHTML);
      const style = container.document.querySelector('style[q\\:style]');
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${scopeStyle}</style>`);
    });
  });
});
