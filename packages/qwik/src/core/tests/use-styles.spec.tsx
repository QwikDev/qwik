import {
  Fragment as Component,
  component$,
  Fragment,
  inlinedQrl,
  Fragment as Signal,
  Slot,
  useSignal,
  useStylesQrl,
} from '@qwik.dev/core';
import { renderToString } from '@qwik.dev/core/server';
import { createDocument, domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlatform, setPlatform } from '../shared/platform/platform';
import { QStyleSelector } from '../shared/utils/markers';

const debug = false; //true;
Error.stackTraceLimit = 100;

vi.hoisted(() => {
  vi.stubGlobal('QWIK_LOADER_DEFAULT_MINIFIED', 'min');
  vi.stubGlobal('QWIK_LOADER_DEFAULT_DEBUG', 'debug');
});

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useStyles', ({ render }) => {
  afterEach(() => {
    (globalThis as any).rawStyleId = undefined;
    (globalThis as any).rawStyleId1 = undefined;
    (globalThis as any).rawStyleId2 = undefined;
  });

  const STYLE_RED = `.container {background-color: red;}`;
  const STYLE_BLUE = `.container {background-color: blue;}`;

  it('should render style', async () => {
    (globalThis as any).rawStyleId = '';
    const StyledComponent = component$(() => {
      const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
      (globalThis as any).rawStyleId = styleData.styleId;
      return <div class="container">Hello world</div>;
    });

    const { vNode, getStyles } = await render(<StyledComponent />, { debug });
    expect(getStyles()).toEqual({
      [(globalThis as any).rawStyleId]: STYLE_RED,
    });
    expect(vNode).toMatchVDOM(
      <>
        <div class={'container'}>Hello world</div>
      </>
    );
  });

  it('should move style to <head> on rerender', async () => {
    (globalThis as any).rawStyleId = '';
    const StyledComponent = component$(() => {
      const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
      (globalThis as any).rawStyleId = styleData.styleId;
      const count = useSignal(0);
      return (
        <button class="container" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });

    const { vNode, container } = await render(<StyledComponent />, { debug });
    await trigger(container.element, 'button', 'click');
    expect(vNode).toMatchVDOM(
      <>
        <button class="container">
          <Signal ssr-required>1</Signal>
        </button>
      </>
    );
    const style = container.document.querySelector(QStyleSelector);
    const attrs = { 'q:style': (globalThis as any).rawStyleId };
    await expect(style).toMatchDOM(<style {...attrs}>{STYLE_RED}</style>);
  });

  it('should save styles when JSX deleted', async () => {
    (globalThis as any).rawStyleId = '';
    const StyledComponent = component$(() => {
      const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles'));
      (globalThis as any).rawStyleId = styleData.styleId;
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
    await trigger(container.element, 'div.parent', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div class="parent">{''}</div>
      </Component>
    );
    const style = container.document.querySelector(QStyleSelector);
    const attrs = { 'q:style': (globalThis as any).rawStyleId };
    await expect(style).toMatchDOM(<style {...attrs}>{STYLE_RED}</style>);
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
    (globalThis as any).rawStyleId1 = '';
    (globalThis as any).rawStyleId2 = '';
    const StyledComponent1 = component$(() => {
      const styleData = useStylesQrl(inlinedQrl(STYLE_RED, 's_styles1'));
      (globalThis as any).rawStyleId1 = styleData.styleId;
      return <div class="container">Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      const styleData = useStylesQrl(inlinedQrl(STYLE_BLUE, 's_styles2'));
      (globalThis as any).rawStyleId2 = styleData.styleId;
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
      [(globalThis as any).rawStyleId1]: STYLE_RED,
      [(globalThis as any).rawStyleId2]: STYLE_BLUE,
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
        <div class="parent" onClick$={() => (show.value = false)}>
          {show.value && <StyledComponent1 />}
          <StyledComponent2 />
        </div>
      );
    });
    const { vNode, container } = await render(<Parent />, { debug });
    await trigger(container.element, 'div.parent', 'click');
    expect(vNode).toMatchVDOM(
      <Component>
        <div class="parent">
          {''}
          <Component>
            <div class="container">Hello world 2</div>
          </Component>
        </div>
      </Component>
    );
    const qStyles = container.document.querySelectorAll(QStyleSelector);
    expect(qStyles).toHaveLength(2);
  });
  it('should skip style node in front of text node', async () => {
    const InnerCmp = component$(() => {
      return <div>Hello world</div>;
    });

    const STYLE = `.container{color: blue;}`;
    const Cmp = component$(() => {
      useStylesQrl(inlinedQrl(STYLE, 's_styles1'));
      const groupSig = useSignal('1');
      return (
        <>
          Some text:{'  '}
          <button onClick$={() => (groupSig.value = '2')}>click</button>
          {/* Enforce Cmp component materialization, because of dynamic content */}
          {groupSig.value === '2' && <InnerCmp />}
        </>
      );
    });
    const { vNode } = await render(<Cmp />, { debug });
    expect(vNode).toMatchVDOM(
      <Component ssr-required>
        <Fragment ssr-required>
          {'Some text:'}
          {'  '}
          <button>click</button>
        </Fragment>
      </Component>
    );
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
      const result = await renderToString(
        <Wrapper>
          <head>
            <script></script>
          </head>
          <body>
            <div>content</div>
          </body>
        </Wrapper>
      );
      document = createDocument({ html: result.html });
    } finally {
      setPlatform(platform);
    }
    const styleElement = document.head.lastChild as HTMLElement;
    expect(styleElement.textContent).toContain(STYLE);
  });
});
