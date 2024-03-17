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
import { renderToString2 } from '../../server/v2-ssr-render2';
import { Slot } from '../render/jsx/slot.public';
import { getPlatform, setPlatform } from '../platform/platform';
import { createDocument } from '@builder.io/qwik-dom';

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
      const StyledComponent = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
        return <div class="container">Hello world</div>;
      });

      const { vNode, getStyles } = await render(<StyledComponent />, { debug });
      expect(getStyles()).toEqual({
        '': STYLE_RED,
      });
      expect(vNode).toMatchVDOM(
        <>
          <div class={'container'}>Hello world</div>
        </>
      );
    });

    it('should move style to <head> on rerender', async () => {
      const StyledComponent = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
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
      expect(style?.outerHTML).toEqual(`<style q:style="">${STYLE_RED}</style>`);
    });

    it('should save styles when JSX deleted', async () => {
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
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
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
      expect(style?.outerHTML).toEqual(`<style q:style="">${STYLE_RED}</style>`);
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
      const StyledComponent1 = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_BLUE, 's_styles2'));
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
      const { vNode, getStyles } = await render(<Parent />, { debug });

      expect(getStyles()).toEqual({
        '': [STYLE_RED, STYLE_BLUE],
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
    });

    it('should save styles for all child components', async () => {
      const StyledComponent1 = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        useStylesQrl(inlinedQrl(STYLE_BLUE, 's_styles2'));
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
    });
  });
});

describe('html wrapper', () => {
  it('should append style to head', async () => {
    const STYLE = `.container{color: blue;}`;
    const Wrapper = component$(() => {
      useStylesQrl(inlinedQrl(STYLE, 's_styles1'));
      return <Slot />;
    });
    let document = createDocument();
    const platform = getPlatform();
    try {
      const result = await renderToString2(
        <Wrapper>
          <head>
            <script></script>
          </head>
          <body>
            <div>content</div>
          </body>
        </Wrapper>
      );
      document = createDocument(result.html);
    } finally {
      setPlatform(platform);
    }
    const styleElement = document.head.lastChild as HTMLElement;
    expect(styleElement.textContent).toContain(STYLE);
  });
});
