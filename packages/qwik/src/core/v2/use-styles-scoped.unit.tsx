import {
  Fragment as Component,
  Fragment,
  Fragment as Projection,
} from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { inlinedQrl } from '../qrl/qrl';
import { getScopedStyles } from '../style/scoped-stylesheet';
import { useLexicalScope } from '../use/use-lexical-scope.public';
import { useSignal } from '../use/use-signal';
import { useStylesScopedQrl } from '../use/use-styles';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';
import { QStyleSelector } from '../util/markers';
import { Slot } from '../render/jsx/slot.public';
import { createDocument } from '@builder.io/qwik-dom';
import { getPlatform, setPlatform } from '../platform/platform';
import { renderToString2 } from '../../server/v2-ssr-render2';

const debug = false; //true;
Error.stackTraceLimit = 100;

[
  ssrRenderToDom, //
  domRender, //
].forEach((render) => {
  describe(render.name + ': useStylesScoped', () => {
    const STYLE_RED = `.container {background-color: red;}`;
    const STYLE_BLUE = `.container {background-color: blue;}`;

    it('should render style', async () => {
      let rawStyleId = '';

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
        rawStyleId = stylesScopedData.scopeId;
        return <div class="container">Hello world</div>;
      });

      const { vNode, getStyles } = await render(<StyledComponent />, { debug });
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE_RED, styleId);
      expect(getStyles()).toEqual({
        [styleId]: scopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <>
          <div class={rawStyleId + ' container'}>Hello world</div>
        </>
      );
    });

    it('should move style to <head> on rerender', async () => {
      let rawStyleId = '';

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
        const count = useSignal(0);
        rawStyleId = stylesScopedData.scopeId;
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
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE_RED, styleId);
      await trigger(container.element, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <>
          <button class={`${rawStyleId} container`}>1</button>
        </>
      );
      const style = container.document.querySelector(QStyleSelector);
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${scopeStyle}</style>`);
    });

    it('should save styles when JSX deleted', async () => {
      let rawStyleId = '';

      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <div
            class="parent"
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <StyledComponent />}
          </div>
        );
      });

      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
        rawStyleId = stylesScopedData.scopeId;
        return <div>Hello world</div>;
      });

      const { vNode, container } = await render(<Parent />, { debug });
      const styleId = rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE_RED, styleId);
      await trigger(container.element, 'div.parent', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">{''}</div>
        </Component>
      );
      const style = container.document.querySelector(QStyleSelector);
      expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${scopeStyle}</style>`);
    });

    it('style node should contain q:style attribute', async () => {
      const StyledComponent = component$(() => {
        useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
        return <div>Hello world</div>;
      });
      const { container } = await render(<StyledComponent />, { debug });
      const allStyles = container.document.querySelectorAll('style');
      const qStyles = container.document.querySelectorAll(QStyleSelector);
      expect(allStyles.length).toBe(qStyles.length);
    });

    it('should render styles for multiple components', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      const StyledComponent1 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData.scopeId;
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
      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      expect(getStyles()).toEqual({
        [firstStyleId]: firstScopeStyle,
        [secondStyleId]: secondScopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <>
          <div>
            <Component>
              <div class={`${rawStyleId1} container`}>Hello world 1</div>
            </Component>
            <Component>
              <div class={`${rawStyleId2} container`}>Hello world 2</div>
            </Component>
          </div>
        </>
      );
    });

    it('should save styles for all child components', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      const StyledComponent1 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return <div class="container">Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData.scopeId;
        return <div class="container">Hello world 2</div>;
      });
      const Parent = component$(() => {
        const show = useSignal(true);
        return (
          <div
            class="parent"
            onClick$={inlinedQrl(() => (useLexicalScope()[0].value = false), 's_onClick', [show])}
          >
            {show.value && <StyledComponent1 />}
            <StyledComponent2 />
          </div>
        );
      });
      const { vNode, container } = await render(<Parent />, { debug });
      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      await trigger(container.element, 'div.parent', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            {''}
            <Component>
              <div class={`${rawStyleId2} container`}>Hello world 2</div>
            </Component>
          </div>
        </Component>
      );
      const qStyles = container.document.querySelectorAll(QStyleSelector);
      expect(qStyles).toHaveLength(2);
      expect(Array.from(qStyles).map((style) => style.outerHTML)).toEqual(
        expect.arrayContaining([
          `<style q:style="${firstStyleId}">${firstScopeStyle}</style>`,
          `<style q:style="${secondStyleId}">${secondScopeStyle}</style>`,
        ])
      );
    });

    it('should generate different styleIds for components', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      const StyledComponent1 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return <div>Hello world 1</div>;
      });
      const StyledComponent2 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData.scopeId;
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
      const firstStyleId = rawStyleId1.substring(2);
      const secondStyleId = rawStyleId2.substring(2);
      expect(firstStyleId).not.toEqual(secondStyleId);
    });

    it('should render styles with multiple useStylesScoped', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      const StyledComponent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        const stylesScopedData2 = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData2.scopeId;
        return <div class="container">Hello world</div>;
      });
      const { vNode, getStyles } = await render(<StyledComponent />, { debug });
      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      expect(getStyles()).toEqual({
        [firstStyleId]: firstScopeStyle,
        [secondStyleId]: secondScopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <>
          <div class={`${rawStyleId1} ${rawStyleId2} container`}>Hello world</div>
        </>
      );
    });

    it('should generate only one style for the same components', async () => {
      const StyledComponent1 = component$(() => {
        useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_styles', []));
        return <div>Hello world 1</div>;
      });
      const Parent = component$(() => {
        return (
          <>
            <StyledComponent1 />
            <StyledComponent1 />
          </>
        );
      });
      const { container } = await render(<Parent />, { debug });
      const qStyles = container.document.querySelectorAll(QStyleSelector);
      expect(qStyles).toHaveLength(1);
    });

    it('should render styles for component inside slot', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';

      const Child = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData.scopeId;
        return <div class="container">Hello world 2</div>;
      });

      const Parent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return (
          <div class="container">
            <Slot />
          </div>
        );
      });

      const { vNode, getStyles } = await render(
        <Parent>
          <Child />
        </Parent>,
        { debug }
      );
      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      expect(getStyles()).toEqual({
        [firstStyleId]: firstScopeStyle,
        [secondStyleId]: secondScopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <div class={`${rawStyleId1} container`}>
            <Fragment>
              <Component>
                <div class={`${rawStyleId2} container`}>Hello world 2</div>
              </Component>
            </Fragment>
          </div>
        </Component>
      );
    });

    it('should render styles for multiple slots', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      let rawStyleId3 = '';
      const RootStyles = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return (
          <ComponentB>
            <ComponentA q:slot="three">
              <div q:slot="one">One</div>
              <div q:slot="two">Two</div>
            </ComponentA>
            <div q:slot="four">
              <span class="container">Four</span>
            </div>
          </ComponentB>
        );
      });

      const ComponentA = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));

        rawStyleId2 = stylesScopedData.scopeId;
        return (
          <div class="containerA">
            <Slot name="one" />
            <Slot name="two" />
          </div>
        );
      });

      const ComponentB = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped3'));

        rawStyleId3 = stylesScopedData.scopeId;
        return (
          <div class="containerB">
            <Slot name="three" />
            <Slot name="four" />
          </div>
        );
      });

      const { vNode, getStyles } = await render(<RootStyles />, { debug });

      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      const thirdStyleId = rawStyleId3.substring(2);
      const thirdScopeStyle = getScopedStyles(STYLE_RED, thirdStyleId);
      expect(getStyles()).toEqual({
        [firstStyleId]: firstScopeStyle,
        [secondStyleId]: secondScopeStyle,
        [thirdStyleId]: thirdScopeStyle,
      });

      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <div class={`${rawStyleId3} containerB`}>
              <Projection>
                <Component>
                  <div class={`${rawStyleId2} containerA`}>
                    <Projection>
                      <div q:slot="one">One</div>
                    </Projection>
                    <Projection>
                      <div q:slot="two">Two</div>
                    </Projection>
                  </div>
                </Component>
              </Projection>
              <Projection>
                <div q:slot="four">
                  <span class={`${rawStyleId1} container`}>Four</span>
                </div>
              </Projection>
            </div>
          </Component>
        </Component>
      );
    });

    it('should render styles for all nested components and elements', async () => {
      let rawStyleId1 = '';
      let rawStyleId2 = '';
      let rawStyleId3 = '';
      let rawStyleId4 = '';

      const StyledComponent1 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
        rawStyleId1 = stylesScopedData.scopeId;
        return (
          <div class="container">
            <span>Hello world 1</span>
            <div class="container">Nested 1</div>
            <StyledComponent2 />
            <StyledComponent3>
              <StyledComponent4 />
            </StyledComponent3>
          </div>
        );
      });
      const StyledComponent2 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
        rawStyleId2 = stylesScopedData.scopeId;
        return (
          <div class="container">
            <span>Hello world 2</span>
            <div class="container">Nested 2</div>
          </div>
        );
      });
      const StyledComponent3 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped3'));
        rawStyleId3 = stylesScopedData.scopeId;
        return (
          <div class="container">
            Hello world 3
            <Slot />
          </div>
        );
      });
      const StyledComponent4 = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped4'));
        rawStyleId4 = stylesScopedData.scopeId;
        return <div class="container">Hello world 4</div>;
      });

      const Parent = component$(() => {
        return (
          <div class="parent">
            <StyledComponent1 />
          </div>
        );
      });
      const { vNode, getStyles } = await render(<Parent />, { debug });
      const firstStyleId = rawStyleId1.substring(2);
      const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
      const secondStyleId = rawStyleId2.substring(2);
      const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
      const thirdStyleId = rawStyleId3.substring(2);
      const thirdScopeStyle = getScopedStyles(STYLE_RED, thirdStyleId);
      const fourthStyleId = rawStyleId4.substring(2);
      const fourthScopeStyle = getScopedStyles(STYLE_BLUE, fourthStyleId);
      expect(getStyles()).toEqual({
        [firstStyleId]: firstScopeStyle,
        [secondStyleId]: secondScopeStyle,
        [thirdStyleId]: thirdScopeStyle,
        [fourthStyleId]: fourthScopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <div class="parent">
            <Component>
              <div class={`${rawStyleId1} container`}>
                <span>Hello world 1</span>
                <div class={`${rawStyleId1} container`}>Nested 1</div>
                <Component>
                  <div class={`${rawStyleId2} container`}>
                    <span>Hello world 2</span>
                    <div class={`${rawStyleId2} container`}>Nested 2</div>
                  </div>
                </Component>
                <Component>
                  <div class={`${rawStyleId3} container`}>
                    Hello world 3
                    <Fragment>
                      <Component>
                        <div class={`${rawStyleId4} container`}>Hello world 4</div>
                      </Component>
                    </Fragment>
                  </div>
                </Component>
              </div>
            </Component>
          </div>
        </Component>
      );
    });
  });
});

describe('html wrapper', () => {
  it('should append scoped style to head', async () => {
    const STYLE = `.container{color: blue;}`;
    let rawStyleId = '';
    const Wrapper = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE, 's_styles1'));
      rawStyleId = stylesScopedData.scopeId;
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

    const styleId = rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE, styleId);
    const styleElement = document.head.lastChild as HTMLElement;
    expect(styleElement.textContent).toContain(scopeStyle);
  });
});
