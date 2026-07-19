import { component$, Slot } from '@qwik.dev/core';
import { useSignal, useStyles$ } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { QStyle, QStyleSelector } from '../shared/utils/markers';
import { ssrRender, testRenderer } from '../test-utils';

const debug = false;
const STYLE_RED = `.container { color: red; }`;
const STYLE_BLUE = `.container { color: blue; }`;
const STYLE = `.container{color: blue;}`;

const { name, render } = testRenderer;

describe(`${name}: useStyles$`, () => {
  it('appends a global style once and leaves element classes unchanged', async () => {
    const App = component$(() => {
      useStyles$(STYLE_RED);
      return <div class="container">Hello</div>;
    });

    const { document, container, cleanup } = await render(App, { debug });
    const styles = document.querySelectorAll(QStyleSelector);
    const div = container.querySelector('div')!;

    expect(styles).toHaveLength(1);
    expect(styles[0].getAttribute(QStyle)).toBeTruthy();
    expect(styles[0].textContent).toBe(STYLE_RED);
    expect(div.className).toBe('container');
    cleanup();
  });

  it('dedupes the same component style in one document', async () => {
    const Styled = component$(() => {
      useStyles$(STYLE_RED);
      return <span class="container">Item</span>;
    });
    const App = component$(() => (
      <div>
        <Styled />
        <Styled />
      </div>
    ));

    const { document, cleanup } = await render(App, { debug });
    const styles = document.querySelectorAll(QStyleSelector);

    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(STYLE_RED);
    cleanup();
  });

  it('keeps the style after a signal update', async () => {
    const App = component$(() => {
      useStyles$(STYLE_RED);
      const count = useSignal(0);
      return (
        <button class="container" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');

    const styles = document.querySelectorAll(QStyleSelector);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(STYLE_RED);
    expect(container.querySelector('button')!.className).toBe('container');
    cleanup();
  });

  it('keeps the style after the styled JSX is removed', async () => {
    const Styled = component$(() => {
      useStyles$(STYLE_RED);
      return <div>Hello</div>;
    });
    const App = component$(() => {
      const show = useSignal(true);
      return (
        <div class="parent" onClick$={() => (show.value = false)}>
          {show.value && <Styled />}
        </div>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('.parent')!, 'click');

    const styles = document.querySelectorAll(QStyleSelector);
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toBe(STYLE_RED);
    expect(container.querySelector('.parent')!.textContent).toBe('');
    cleanup();
  });

  it('adds q:style to every style node', async () => {
    const App = component$(() => {
      useStyles$(STYLE_RED);
      return <div>Hello</div>;
    });

    const { document, cleanup } = await render(App, { debug });

    expect(document.querySelectorAll('style')).toHaveLength(
      document.querySelectorAll(QStyleSelector).length
    );
    cleanup();
  });

  it('renders styles for multiple components', async () => {
    const Red = component$(() => {
      useStyles$(STYLE_RED);
      return <div class="container">Red</div>;
    });
    const Blue = component$(() => {
      useStyles$(STYLE_BLUE);
      return <div class="container">Blue</div>;
    });
    const App = component$(() => (
      <div>
        <Red />
        <Blue />
      </div>
    ));

    const { document, container, cleanup } = await render(App, { debug });
    const styles = Array.from(
      document.querySelectorAll(QStyleSelector),
      (style) => style.textContent
    );

    expect(styles).toEqual(expect.arrayContaining([STYLE_RED, STYLE_BLUE]));
    expect(container.querySelectorAll('.container')).toHaveLength(2);
    cleanup();
  });

  it('keeps all child component styles after one child is removed', async () => {
    const Red = component$(() => {
      useStyles$(STYLE_RED);
      return <div class="container">Red</div>;
    });
    const Blue = component$(() => {
      useStyles$(STYLE_BLUE);
      return <div class="container">Blue</div>;
    });
    const App = component$(() => {
      const show = useSignal(true);
      return (
        <div class="parent" onClick$={() => (show.value = false)}>
          {show.value && <Red />}
          <Blue />
        </div>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(App, { debug });
    await qwikLoader?.dispatch(container.querySelector('.parent')!, 'click');
    const styles = Array.from(
      document.querySelectorAll(QStyleSelector),
      (style) => style.textContent
    );

    expect(styles).toEqual(expect.arrayContaining([STYLE_RED, STYLE_BLUE]));
    expect(container.querySelector('.parent')!.textContent).toBe('Blue');
    cleanup();
  });

  it('does not render style nodes before text output', async () => {
    const InnerCmp = component$(() => {
      return <div>Hello world</div>;
    });

    const App = component$(() => {
      useStyles$(STYLE);
      const groupSig = useSignal('1');
      return (
        <>
          Some text:{'  '}
          <button onClick$={() => (groupSig.value = '2')}>click</button>
          {groupSig.value === '2' && <InnerCmp />}
        </>
      );
    });

    const { document, container, cleanup } = await render(App, { debug });

    expect(document.querySelectorAll(QStyleSelector)).toHaveLength(1);
    expect(container.textContent).toMatch(/^Some text: {2}click/);
    cleanup();
  });
});

it.runIf(testRenderer.render === ssrRender)(
  'ssrRender: appends style to head when rendering document sections',
  async () => {
    const Wrapper = component$(() => {
      useStyles$(STYLE);
      return <Slot />;
    });
    const App = component$(() => (
      <Wrapper>
        <head>
          <script></script>
        </head>
        <body>
          <div>content</div>
        </body>
      </Wrapper>
    ));

    const { document, cleanup } = await ssrRender(App, { debug });

    expect(document.head.querySelector(QStyleSelector)?.textContent).toBe(STYLE);
    cleanup();
  }
);
