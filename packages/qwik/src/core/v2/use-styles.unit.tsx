import { Fragment as Component } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStylesQrl } from '../use/use-styles';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { QStyleSelector } from '../util/markers';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useStyles', () => {
    const STYLE_RED = `.container {background-color: red;}`;
    const STYLE_BLUE = `.container {background-color: blue;}`;

    it('should render style', async () => {
      let styleId = '';
      const StyledComponent = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
        styleId = styleData.styleId;
        return <div class="container">Hello world</div>;
      });

      const { vNode, styles } = await render(<StyledComponent />, { debug });
      if (render == ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <>
            {/* @ts-ignore-next-line */}
            <style q:style={styleId}>{STYLE_RED}</style>
            <div class="container">Hello world</div>
          </>
        );
      } else {
        expect(styles).toEqual({
          [styleId]: STYLE_RED,
        });
        expect(vNode).toMatchVDOM(
          <>
            <div class={'container'}>Hello world</div>
          </>
        );
      }
    });

    it('should move style to <head> on rerender', async () => {
      let styleId = '';
      const StyledComponent = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
        styleId = styleData.styleId;
        const count = useSignal(0);
        return (
          <button
            class="container"
            onClick$={inlinedQrl(() => useLexicalScope()[0].value++, 's_onClick', [count])}
          >
            {count.value}
          </button>
        );
      });

      const { vNode, container } = await render(<StyledComponent />, { debug });
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button class="container">1</button>
        </>
      );
      const style = container.document.querySelector(QStyleSelector);
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${STYLE_RED}</style>`);
    });

    it('should save styles when JSX deleted', async () => {
      let styleId = '';
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button
            class="parent"
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <StyledComponent />}
          </button>
        );
      });

      const StyledComponent = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
        styleId = styleData.styleId;
        return <div>Hello world</div>;
      });

      const { vNode, container } = await render(<Parent />, { debug });
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button class="parent">{''}</button>
        </Component>
      );
      const style = container.document.querySelector(QStyleSelector);
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${STYLE_RED}</style>`);
    });

    it('style node should contain q:style attribute', async () => {
      const StyledComponent = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
        return <div>Hello world</div>;
      });
      const { container } = await render(<StyledComponent />, { debug });
      const allStyles = container.document.querySelectorAll('style');
      const qStyles = container.document.querySelectorAll(QStyleSelector);
      expect(allStyles.length).toBe(qStyles.length);
    });

    it('should render styles for multiple components', async () => {
      let styleId1 = '';
      let styleId2 = '';
      const StyledComponent1 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
        styleId1 = styleData.styleId;
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_BLUE, 's_styles2'));
        styleId2 = styleData.styleId;
        return <div class="container">Hello world 2</div>;
      });
      const Parent = component$(() => {
        return (
          <div>
            <StyledComponent1 />
            <StyledComponent2 />
          </div>
        );
      });
      const { vNode, styles } = await render(<Parent />, { debug });
      if (render == ssrRenderToDom) {
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <Component>
                {/* @ts-ignore-next-line */}
                <style q:style={styleId1}>{STYLE_RED}</style>
                <div class="container">Hello world 1</div>
              </Component>
              <Component>
                {/* @ts-ignore-next-line */}
                <style q:style={styleId2}>{STYLE_BLUE}</style>
                <div class="container">Hello world 2</div>
              </Component>
            </div>
          </>
        );
      } else {
        expect(styles).toEqual({
          [styleId1]: STYLE_RED,
          [styleId2]: STYLE_BLUE,
        });
        expect(vNode).toMatchVDOM(
          <>
            <div>
              <Component>
                <div class="container">Hello world 1</div>
              </Component>
              <Component>
                <div class="container">Hello world 2</div>
              </Component>
            </div>
          </>
        );
      }
    });

    it('should save styles for all child components', async () => {
      let styleId1 = '';
      let styleId2 = '';
      const StyledComponent1 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
        styleId1 = styleData.styleId;
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_BLUE, 's_styles2'));
        styleId2 = styleData.styleId;
        return <div class="container">Hello world 2</div>;
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <button
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <StyledComponent1 />}
            <StyledComponent2 />
          </button>
        );
      });
      const { vNode, container } = await render(<Parent />, { debug });
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <button>
            {''}
            <Component>
              <div class="container">Hello world 2</div>
            </Component>
          </button>
        </Component>
      );
      const qStyles = container.document.querySelectorAll(QStyleSelector);
      expect(qStyles).toHaveLength(2);
      expect(Array.from(qStyles).map((style) => style.outerHTML)).toEqual(
        expect.arrayContaining([
          `<style q:style="${styleId1}">${STYLE_RED}</style>`,
          `<style q:style="${styleId2}">${STYLE_BLUE}</style>`,
        ])
      );
    });

    it('should generate different styleIds for components', async () => {
      let styleId1 = '';
      let styleId2 = '';
      const StyledComponent1 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
        styleId1 = styleData.styleId;
        return <div>Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles2'));
        styleId2 = styleData.styleId;
        return <div>Hello world 2</div>;
      });
      const Parent = component$(() => {
        return (
          <>
            <StyledComponent1 />
            <StyledComponent2 />
          </>
        );
      });
      await render(<Parent />, { debug });
      expect(styleId1).not.toEqual(styleId2);
    });
  });
});
