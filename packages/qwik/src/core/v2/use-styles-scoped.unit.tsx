import { createDocument } from '@builder.io/qwik-dom';
import {
  Fragment as Component,
  Fragment,
  Fragment as Projection,
  Fragment as Signal,
} from '@builder.io/qwik/jsx-runtime';
import { afterEach, describe, expect, it } from 'vitest';
import { useStore } from '..';
import { renderToString2 } from '../../server/v2-ssr-render2';
import { trigger } from '../../testing/element-fixture';
import { component$ } from '../component/component.public';
import { getPlatform, setPlatform } from '../platform/platform';
import { inlinedQrl } from '../qrl/qrl';
import { Slot } from '../render/jsx/slot.public';
import { getScopedStyles } from '../style/scoped-stylesheet';
import { useSignal } from '../use/use-signal';
import { useStylesScopedQrl } from '../use/use-styles';
import { QStyleSelector } from '../util/markers';
import { domRender, ssrRenderToDom } from './rendering.unit-util';
import './vdom-diff.unit-util';

const debug = true; //true;
Error.stackTraceLimit = 100;

describe.each([
  { render: ssrRenderToDom }, //
  // { render: domRender }, //
])('$render.name: useStylesScoped', ({ render }) => {
  const STYLE_RED = `.container {background-color: red;}`;
  const STYLE_BLUE = `.container {background-color: blue;}`;

  afterEach(() => {
    (globalThis as any).rawStyleId = undefined;
    (globalThis as any).rawStyleId1 = undefined;
    (globalThis as any).rawStyleId2 = undefined;
    (globalThis as any).rawStyleId3 = undefined;
    (globalThis as any).rawStyleId4 = undefined;
  });

  it('should render style', async () => {
    (globalThis as any).rawStyleId = '';

    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;
      return <div class="container">Hello world</div>;
    });

    const { vNode, getStyles } = await render(<StyledComponent />, { debug });
    const styleId = (globalThis as any).rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE_RED, styleId);
    expect(getStyles()).toEqual({
      [styleId]: scopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <>
        <div class={(globalThis as any).rawStyleId + ' container'}>Hello world</div>
      </>
    );
  });

  it('should render style', async () => {
    (globalThis as any).rawStyleId = '';

    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;

      const store = useStore({
        count: 10,
      });

      return (
        <button class={['container', `count-${store.count}`]} onClick$={() => store.count++}>
          Hello world
        </button>
      );
    });

    const { vNode, getStyles, document } = await render(<StyledComponent />, { debug });
    const styleId = (globalThis as any).rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE_RED, styleId);
    expect(getStyles()).toEqual({
      [styleId]: scopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <>
        <button class={(globalThis as any).rawStyleId + ' container count-10'}>Hello world</button>
      </>
    );
    await trigger(document.body, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button class={(globalThis as any).rawStyleId + ' container count-11'}>Hello world</button>
      </>
    );
  });

  it('should move style to <head> on rerender', async () => {
    (globalThis as any).rawStyleId = '';

    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
      const count = useSignal(0);
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;
      return (
        <button class="container" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });

    const { vNode, container } = await render(<StyledComponent />, { debug });
    const styleId = (globalThis as any).rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE_RED, styleId);
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button class={`${(globalThis as any).rawStyleId} container`}>
          <Signal>1</Signal>
        </button>
      </>
    );
    const style = container.document.querySelector(QStyleSelector);
    expect(style?.outerHTML).toEqual(`<style q:style="${styleId}">${scopeStyle}</style>`);
  });

  it('should save styles when JSX deleted', async () => {
    (globalThis as any).rawStyleId = '';

    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;
      return <div>Hello world</div>;
    });

    const Parent = component$(() => {
      const show = useSignal(true);
      return (
        <div class="parent" onClick$={() => (show.value = false)}>
          {show.value && <StyledComponent />}
        </div>
      );
    });

    const { vNode, container } = await render(<Parent />, { debug });
    const styleId = (globalThis as any).rawStyleId.substring(2);
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
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    const StyledComponent1 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
      return <div class="container">Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
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
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    expect(getStyles()).toEqual({
      [firstStyleId]: firstScopeStyle,
      [secondStyleId]: secondScopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <>
        <div>
          <Component>
            <div class={`${(globalThis as any).rawStyleId1} container`}>Hello world 1</div>
          </Component>
          <Component>
            <div class={`${(globalThis as any).rawStyleId2} container`}>Hello world 2</div>
          </Component>
        </div>
      </>
    );
  });

  it('should save styles for all child components', async () => {
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    const StyledComponent1 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
      return <div class="container">Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
      return <div class="container">Hello world 2</div>;
    });
    const Parent = component$(() => {
      const show = useSignal(true);
      return (
        <div class="parent" onClick$={() => (show.value = false)}>
          {show.value && <StyledComponent1 />}
          <StyledComponent2 />
        </div>
      );
    });
    const { vNode, container } = await render(<Parent />, { debug });
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    await trigger(container.element, 'div.parent', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div class="parent">
          {''}
          <Component>
            <div class={`${(globalThis as any).rawStyleId2} container`}>Hello world 2</div>
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
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    const StyledComponent1 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
      return <div>Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
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
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    expect(firstStyleId).not.toEqual(secondStyleId);
  });

  it('should render styles with multiple useStylesScoped', async () => {
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
      const stylesScopedData2 = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData2.scopeId;
      return <div class="container">Hello world</div>;
    });
    const { vNode, getStyles } = await render(<StyledComponent />, { debug });
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    expect(getStyles()).toEqual({
      [firstStyleId]: firstScopeStyle,
      [secondStyleId]: secondScopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <>
        <div
          class={`${(globalThis as any).rawStyleId1} ${(globalThis as any).rawStyleId2} container`}
        >
          Hello world
        </div>
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
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';

    const Child = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
      return <div class="container">Hello world 2</div>;
    });

    const Parent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
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
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    expect(getStyles()).toEqual({
      [firstStyleId]: firstScopeStyle,
      [secondStyleId]: secondScopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <Component>
        <div class={`${(globalThis as any).rawStyleId1} container`}>
          <Fragment>
            <Component>
              <div class={`${(globalThis as any).rawStyleId2} container`}>Hello world 2</div>
            </Component>
          </Fragment>
        </div>
      </Component>
    );
  });

  it('should render styles for multiple slots', async () => {
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    (globalThis as any).rawStyleId3 = '';

    const ComponentA = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));

      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
      return (
        <div class="containerA">
          <Slot name="one" />
          <Slot name="two" />
        </div>
      );
    });

    const ComponentB = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped3'));

      (globalThis as any).rawStyleId3 = stylesScopedData.scopeId;
      return (
        <div class="containerB">
          <Slot name="three" />
          <Slot name="four" />
        </div>
      );
    });

    const RootStyles = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
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

    const { vNode, getStyles } = await render(<RootStyles />, { debug });

    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    const thirdStyleId = (globalThis as any).rawStyleId3.substring(2);
    const thirdScopeStyle = getScopedStyles(STYLE_RED, thirdStyleId);
    expect(getStyles()).toEqual({
      [firstStyleId]: firstScopeStyle,
      [secondStyleId]: secondScopeStyle,
      [thirdStyleId]: thirdScopeStyle,
    });

    expect(vNode).toMatchVDOM(
      <Component>
        <Component>
          <div class={`${(globalThis as any).rawStyleId3} containerB`}>
            <Projection>
              <Component>
                <div class={`${(globalThis as any).rawStyleId2} containerA`}>
                  <Projection>
                    <div class={(globalThis as any).rawStyleId1} q:slot="one">
                      One
                    </div>
                  </Projection>
                  <Projection>
                    <div class={(globalThis as any).rawStyleId1} q:slot="two">
                      Two
                    </div>
                  </Projection>
                </div>
              </Component>
            </Projection>
            <Projection>
              <div class={(globalThis as any).rawStyleId1} q:slot="four">
                <span class={`${(globalThis as any).rawStyleId1} container`}>Four</span>
              </div>
            </Projection>
          </div>
        </Component>
      </Component>
    );
  });

  it('should render styles for all nested components and elements', async () => {
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    (globalThis as any).rawStyleId3 = '';
    (globalThis as any).rawStyleId4 = '';

    const StyledComponent2 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped2'));
      (globalThis as any).rawStyleId2 = stylesScopedData.scopeId;
      return (
        <div class="container">
          <span>Hello world 2</span>
          <div class="container">Nested 2</div>
        </div>
      );
    });
    const StyledComponent3 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped3'));
      (globalThis as any).rawStyleId3 = stylesScopedData.scopeId;
      return (
        <div class="container">
          Hello world 3
          <Slot />
        </div>
      );
    });
    const StyledComponent4 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_BLUE, 's_stylesScoped4'));
      (globalThis as any).rawStyleId4 = stylesScopedData.scopeId;
      return <div class="container">Hello world 4</div>;
    });

    const StyledComponent1 = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped1'));
      (globalThis as any).rawStyleId1 = stylesScopedData.scopeId;
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

    const Parent = component$(() => {
      return (
        <div class="parent">
          <StyledComponent1 />
        </div>
      );
    });
    const { vNode, getStyles } = await render(<Parent />, { debug });
    const firstStyleId = (globalThis as any).rawStyleId1.substring(2);
    const firstScopeStyle = getScopedStyles(STYLE_RED, firstStyleId);
    const secondStyleId = (globalThis as any).rawStyleId2.substring(2);
    const secondScopeStyle = getScopedStyles(STYLE_BLUE, secondStyleId);
    const thirdStyleId = (globalThis as any).rawStyleId3.substring(2);
    const thirdScopeStyle = getScopedStyles(STYLE_RED, thirdStyleId);
    const fourthStyleId = (globalThis as any).rawStyleId4.substring(2);
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
            <div class={`${(globalThis as any).rawStyleId1} container`}>
              <span class={(globalThis as any).rawStyleId1}>Hello world 1</span>
              <div class={`${(globalThis as any).rawStyleId1} container`}>Nested 1</div>
              <Component>
                <div class={`${(globalThis as any).rawStyleId2} container`}>
                  <span class={(globalThis as any).rawStyleId2}>Hello world 2</span>
                  <div class={`${(globalThis as any).rawStyleId2} container`}>Nested 2</div>
                </div>
              </Component>
              <Component>
                <div class={`${(globalThis as any).rawStyleId3} container`}>
                  Hello world 3
                  <Fragment>
                    <Component>
                      <div class={`${(globalThis as any).rawStyleId4} container`}>
                        Hello world 4
                      </div>
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

  it('should render style scoped id for element without class attribute', async () => {
    (globalThis as any).rawStyleId = '';

    const StyledComponent = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;
      return <div>Hello world</div>;
    });

    const { vNode, getStyles } = await render(<StyledComponent />, { debug });
    const styleId = (globalThis as any).rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE_RED, styleId);
    expect(getStyles()).toEqual({
      [styleId]: scopeStyle,
    });
    expect(vNode).toMatchVDOM(
      <>
        <div class={(globalThis as any).rawStyleId}>Hello world</div>
      </>
    );
  });

  describe('regression', () => {
    it.only('#1945 - should add styles to conditionally rendered slots', async () => {
      (globalThis as any).rawStyleId = '';

      const Child = component$(() => {
        const show = useSignal(false);
        return (
          <>
            <button onClick$={() => (show.value = !show.value)}>toggle slot</button>
            {show.value ? <Slot /> : null}
          </>
        );
      });

      const Parent = component$(() => {
        const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE_RED, 's_stylesScoped'));
        (globalThis as any).rawStyleId = stylesScopedData.scopeId;
        return (
          <Child>
            <span>content</span>
          </Child>
        );
      });

      const { vNode, getStyles, document } = await render(<Parent />, { debug });
      const styleId = (globalThis as any).rawStyleId.substring(2);
      const scopeStyle = getScopedStyles(STYLE_RED, styleId);
      expect(getStyles()).toEqual({
        [styleId]: scopeStyle,
      });
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <Fragment>
              <button>toggle slot</button>
              {''}
            </Fragment>
          </Component>
        </Component>
      );
      await trigger(document.body, 'button', 'click');
      expect(vNode).toMatchVDOM(
        <Component>
          <Component>
            <Fragment>
              <button>toggle slot</button>
              <Projection>
                <span class={(globalThis as any).rawStyleId}>content</span>
              </Projection>
            </Fragment>
          </Component>
        </Component>
      );
    });
  });
});

describe('html wrapper', () => {
  it('should append scoped style to head', async () => {
    const STYLE = `.container{color: blue;}`;
    (globalThis as any).rawStyleId = '';
    const Wrapper = component$(() => {
      const stylesScopedData = useStylesScopedQrl(inlinedQrl(STYLE, 's_styles1'));
      (globalThis as any).rawStyleId = stylesScopedData.scopeId;
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

    const styleId = (globalThis as any).rawStyleId.substring(2);
    const scopeStyle = getScopedStyles(STYLE, styleId);
    const styleElement = document.head.lastChild as HTMLElement;
    expect(styleElement.textContent).toContain(scopeStyle);
  });
});
