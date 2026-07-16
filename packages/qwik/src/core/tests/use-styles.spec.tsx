import {
  Fragment as Component,
  component$,
  Fragment,
  Fragment as Signal,
  Slot,
  useSignal,
  useStyles$,
  useStylesQrl,
} from '@qwik.dev/core';
import { renderToString } from '@qwik.dev/core/server';
import { createDocument, domRender, ssrRenderToDom, trigger } from '@qwik.dev/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform, setPlatform } from '../shared/platform/platform';
import { QStyleSelector } from '../shared/utils/markers';
import { inlinedQrl } from '../shared/qrl/qrl';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { _useHmr } from '../internal';
import { waitForDrain } from '@qwik.dev/core/testing';

const debug = false; //true;
Error.stackTraceLimit = 100;

const STYLE_RED = `.container {background-color: red;}`;
const STYLE_BLUE = `.container {background-color: blue;}`;
const STYLE = `.container{color: blue;}`;

describe.each([
  { render: ssrRenderToDom }, //
  { render: domRender }, //
])('$render.name: useStyles', ({ render }) => {
  afterEach(() => {
    (globalThis as any).rawStyleId = undefined;
    (globalThis as any).rawStyleId1 = undefined;
    (globalThis as any).rawStyleId2 = undefined;
  });

  it('should render style', async () => {
    (globalThis as any).rawStyleId = '';
    const StyledComponent = component$(() => {
      const styleData = useStyles$(STYLE_RED);
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
      const styleData = useStyles$(STYLE_RED);
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
      const styleData = useStyles$(STYLE_RED);
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
      useStyles$(STYLE_RED);
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
      const styleData = useStyles$(STYLE_RED);
      (globalThis as any).rawStyleId1 = styleData.styleId;
      return <div class="container">Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      const styleData = useStyles$(STYLE_BLUE);
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
      useStyles$(STYLE_RED);
      return <div class="container">Hello world 1</div>;
    });
    const StyledComponent2 = component$(() => {
      useStyles$(STYLE_BLUE);
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
  it.skipIf(render !== domRender)('should update style content on HMR re-render', async () => {
    const INITIAL_CSS = `.hmr-test { color: red; }`;
    const UPDATED_CSS = `.hmr-test { color: green; }`;

    // Create a QRL we can mutate to simulate HMR updating the module
    const styleQrl = inlinedQrl(INITIAL_CSS, 'hmrStyleQrl') as QRLInternal<string>;

    const StyledComponent = component$(() => {
      useStylesQrl(styleQrl);
      _useHmr('hmr-styles.tsx');
      return (
        <div class="hmr-test" data-qwik-inspector="hmr-styles.tsx:1:1">
          styled
        </div>
      );
    });

    const { container } = await render(<StyledComponent />, { debug });

    // Verify initial style content
    const styleEl = container.document.querySelector(QStyleSelector) as HTMLStyleElement;
    expect(styleEl).toBeTruthy();
    expect(styleEl.textContent).toBe(INITIAL_CSS);

    // Simulate HMR: update the QRL's resolved value (as Vite would do)
    styleQrl.resolved = UPDATED_CSS;

    // Trigger HMR re-render (component body re-executes with new resolved value)
    const t = Date.now();
    (container.document as any).__hmrT = t; // Simulate Vite's HMR timestamp update
    await trigger(container.element, null, 'd:q-hmr', {
      detail: { files: ['hmr-styles.tsx'], t },
    });
    await new Promise((r) => setTimeout(r, 0));
    await waitForDrain(container);

    // The style element content should have been updated in-place
    expect(styleEl.textContent).toBe(UPDATED_CSS);
  });

  it('should skip style node in front of text node', async () => {
    const InnerCmp = component$(() => {
      return <div>Hello world</div>;
    });

    const Cmp = component$(() => {
      useStyles$(STYLE);
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
    const Wrapper = component$(() => {
      useStyles$(STYLE);
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
