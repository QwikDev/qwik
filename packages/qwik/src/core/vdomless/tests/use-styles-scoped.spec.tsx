import { component$, Slot, useStylesScoped$ } from '@qwik.dev/core';
import { createAsync$, useSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { QStyle, QStyleSelector } from '../../shared/utils/markers';
import { getScopedStyles } from '../../shared/utils/scoped-stylesheet';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;
const STYLE_RED = `.container { color: red; }`;
const STYLE_BLUE = `.container { color: blue; }`;
const STYLE_CHILD = `.child { color: green; }`;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: useStylesScoped$', ({ render }) => {
  it('appends scoped style and prefixes static classes', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div class="container">Hello</div>;
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const style = document.querySelector(QStyleSelector)!;
    const styleId = style.getAttribute(QStyle)!;
    const scopeId = `⚡️${styleId}`;
    const div = container.querySelector('div')!;

    expect(style.textContent).toBe(getScopedStyles(STYLE_RED, styleId));
    expect(div.className).toBe(`${scopeId} container`);
    cleanup();
  });

  it('keeps scoped class when object class updates', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      const active = useSignal(false);
      return (
        <button
          class={{ container: true, active: active.value }}
          onClick$={() => (active.value = true)}
        >
          Toggle
        </button>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    const styleId = document.querySelector(QStyleSelector)!.getAttribute(QStyle)!;
    const scopeId = `⚡️${styleId}`;
    const button = container.querySelector('button')!;

    expect(button.className).toBe(`${scopeId} container`);
    await qwikLoader?.dispatch(button, 'click');
    expect(button.className).toBe(`${scopeId} container active`);
    cleanup();
  });

  it('keeps scoped class when array class updates', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      const count = useSignal(10);
      return (
        <button class={['container', `count-${count.value}`]} onClick$={() => count.value++}>
          Hello
        </button>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    const styleId = document.querySelector(QStyleSelector)!.getAttribute(QStyle)!;
    const scopeId = `⚡️${styleId}`;
    const button = container.querySelector('button')!;

    expect(button.className).toBe(`${scopeId} container count-10`);
    await qwikLoader?.dispatch(button, 'click');
    expect(button.className).toBe(`${scopeId} container count-11`);
    cleanup();
  });

  it('keeps scoped style in head after a signal update', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      const count = useSignal(0);
      return (
        <button class="container" onClick$={() => count.value++}>
          {count.value}
        </button>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;
    await qwikLoader?.dispatch(button, 'click');
    const style = document.querySelector(QStyleSelector)!;
    const styleId = style.getAttribute(QStyle)!;

    expect(style.textContent).toBe(getScopedStyles(STYLE_RED, styleId));
    expect(button.className).toBe(`⚡️${styleId} container`);
    expect(button.textContent).toBe('1');
    cleanup();
  });

  it('adds multiple scoped classes before user classes', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      useStylesScoped$(STYLE_BLUE);
      return <div class="container">Hello</div>;
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const styleIds = Array.from(document.querySelectorAll(QStyleSelector), (style) =>
      style.getAttribute(QStyle)
    );

    expect(styleIds).toHaveLength(2);
    expect(container.querySelector('div')!.className).toBe(
      `⚡️${styleIds[0]} ⚡️${styleIds[1]} container`
    );
    cleanup();
  });

  it('keeps projected children scoped to the component that authored them', async () => {
    const Frame = component$(() => {
      useStylesScoped$(STYLE_CHILD);
      return (
        <section id="frame" class="child">
          <Slot />
        </section>
      );
    });
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <Frame>
          <span id="projected" class="container">
            Projected
          </span>
        </Frame>
      );
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const styles = Array.from(document.querySelectorAll(QStyleSelector));
    const frameStyle = styles.find((style) => style.textContent?.includes('.child'))!;
    const appStyle = styles.find((style) => style.textContent?.includes('.container'))!;
    const frameScope = `⚡️${frameStyle.getAttribute(QStyle)}`;
    const appScope = `⚡️${appStyle.getAttribute(QStyle)}`;

    expect(container.querySelector('#frame')!.className).toBe(`${frameScope} child`);
    expect(container.querySelector('#projected')!.className).toBe(`${appScope} container`);
    cleanup();
  });

  it('keeps component scoped classes inside slot content', async () => {
    const Child = component$(() => {
      useStylesScoped$(STYLE_BLUE);
      return (
        <div id="child" class="container">
          Child
        </div>
      );
    });
    const Parent = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <div id="parent" class="container">
          <Slot />
        </div>
      );
    });
    const App = component$(() => (
      <Parent>
        <Child />
      </Parent>
    ));

    const { document, container, cleanup } = await render(<App />, { debug });
    const styles = Array.from(document.querySelectorAll(QStyleSelector));
    const parentStyle = styles.find((style) => style.textContent?.includes('red'))!;
    const childStyle = styles.find((style) => style.textContent?.includes('blue'))!;

    expect(container.querySelector('#parent')!.className).toBe(
      `⚡️${parentStyle.getAttribute(QStyle)} container`
    );
    expect(container.querySelector('#child')!.className).toBe(
      `⚡️${childStyle.getAttribute(QStyle)} container`
    );
    cleanup();
  });

  it('keeps authored scoped classes through multiple named slots', async () => {
    const ComponentA = component$(() => {
      useStylesScoped$(STYLE_BLUE);
      return (
        <div id="a" class="containerA">
          <Slot name="one" />
          <Slot name="two" />
        </div>
      );
    });
    const ComponentB = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <div id="b" class="containerB">
          <Slot name="three" />
          <Slot name="four" />
        </div>
      );
    });
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <ComponentB>
          <ComponentA q:slot="three">
            <div id="one" q:slot="one">
              One
            </div>
            <div id="two" q:slot="two">
              Two
            </div>
          </ComponentA>
          <div id="four" q:slot="four">
            <span id="four-span" class="container">
              Four
            </span>
          </div>
        </ComponentB>
      );
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const styles = document.querySelectorAll(QStyleSelector);
    const appScope = container.querySelector('#four')!.className;

    expect(styles).toHaveLength(3);
    expect(container.querySelector('#a')!.className).toMatch(/^⚡️.+ containerA$/);
    expect(container.querySelector('#b')!.className).toMatch(/^⚡️.+ containerB$/);
    expect(container.querySelector('#one')!.className).toBe(appScope);
    expect(container.querySelector('#two')!.className).toBe(appScope);
    expect(container.querySelector('#four-span')!.className).toBe(`${appScope} container`);
    cleanup();
  });

  it('keeps scoped style after the styled JSX is removed', async () => {
    const Styled = component$(() => {
      useStylesScoped$(STYLE_RED);
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

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    await qwikLoader?.dispatch(container.querySelector('.parent')!, 'click');
    const style = document.querySelector(QStyleSelector)!;
    const styleId = style.getAttribute(QStyle)!;

    expect(style.textContent).toBe(getScopedStyles(STYLE_RED, styleId));
    expect(container.querySelector('.parent')!.textContent).toBe('');
    cleanup();
  });

  it('adds q:style to every scoped style node', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div>Hello</div>;
    });

    const { document, cleanup } = await render(<App />, { debug });

    expect(document.querySelectorAll('style')).toHaveLength(
      document.querySelectorAll(QStyleSelector).length
    );
    cleanup();
  });

  it('renders scoped styles for multiple components', async () => {
    const Red = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div class="container">Red</div>;
    });
    const Blue = component$(() => {
      useStylesScoped$(STYLE_BLUE);
      return <div class="container">Blue</div>;
    });
    const App = component$(() => (
      <div>
        <Red />
        <Blue />
      </div>
    ));

    const { document, container, cleanup } = await render(<App />, { debug });
    const styles = Array.from(document.querySelectorAll(QStyleSelector));
    const redStyle = styles.find((style) => style.textContent?.includes('red'))!;
    const blueStyle = styles.find((style) => style.textContent?.includes('blue'))!;

    expect(styles).toHaveLength(2);
    expect(container.querySelectorAll('.container')[0].className).toBe(
      `⚡️${redStyle.getAttribute(QStyle)} container`
    );
    expect(container.querySelectorAll('.container')[1].className).toBe(
      `⚡️${blueStyle.getAttribute(QStyle)} container`
    );
    cleanup();
  });

  it('keeps all child scoped styles after one child is removed', async () => {
    const Red = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div class="container">Red</div>;
    });
    const Blue = component$(() => {
      useStylesScoped$(STYLE_BLUE);
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

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    await qwikLoader?.dispatch(container.querySelector('.parent')!, 'click');
    const styles = document.querySelectorAll(QStyleSelector);

    expect(styles).toHaveLength(2);
    expect(container.querySelector('.parent')!.textContent).toBe('Blue');
    cleanup();
  });

  it('generates different scoped style ids for different components', async () => {
    const First = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div>First</div>;
    });
    const Second = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div>Second</div>;
    });
    const App = component$(() => (
      <>
        <First />
        <Second />
      </>
    ));

    const { document, cleanup } = await render(<App />, { debug });
    const styleIds = Array.from(document.querySelectorAll(QStyleSelector), (style) =>
      style.getAttribute(QStyle)
    );

    expect(styleIds).toHaveLength(2);
    expect(styleIds[0]).not.toBe(styleIds[1]);
    cleanup();
  });

  it('dedupes scoped style for the same component', async () => {
    const Styled = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div>Hello</div>;
    });

    const { document, cleanup } = await render(
      <>
        <Styled />
        <Styled />
      </>,
      { debug }
    );

    expect(document.querySelectorAll(QStyleSelector)).toHaveLength(1);
    cleanup();
  });

  it('adds scoped class to elements without a class attribute', async () => {
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return <div>Hello</div>;
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const styleId = document.querySelector(QStyleSelector)!.getAttribute(QStyle)!;

    expect(container.querySelector('div')!.className).toBe(`⚡️${styleId}`);
    cleanup();
  });

  it('scopes nested component elements independently', async () => {
    const Child = component$(() => {
      useStylesScoped$(STYLE_BLUE);
      return (
        <div id="child" class="container">
          <span id="child-span">Child</span>
        </div>
      );
    });
    const Parent = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <div id="parent" class="container">
          <span id="parent-span">Parent</span>
          <Child />
        </div>
      );
    });

    const { document, container, cleanup } = await render(<Parent />, { debug });
    const styles = Array.from(document.querySelectorAll(QStyleSelector));
    const parentStyle = styles.find((style) => style.textContent?.includes('red'))!;
    const childStyle = styles.find((style) => style.textContent?.includes('blue'))!;
    const parentScope = `⚡️${parentStyle.getAttribute(QStyle)}`;
    const childScope = `⚡️${childStyle.getAttribute(QStyle)}`;

    expect(container.querySelector('#parent')!.className).toBe(`${parentScope} container`);
    expect(container.querySelector('#parent-span')!.className).toBe(parentScope);
    expect(container.querySelector('#child')!.className).toBe(`${childScope} container`);
    expect(container.querySelector('#child-span')!.className).toBe(childScope);
    cleanup();
  });

  it('awaits async component output before applying scoped class', async () => {
    const App = component$(() => {
      const value = createAsync$(async () => 'ready');
      useStylesScoped$(`.red { color: red; }`);
      return <div class="red">{value.value}</div>;
    });

    const { document, container, cleanup } = await render(<App />, { debug });
    const styleId = document.querySelector(QStyleSelector)!.getAttribute(QStyle)!;

    expect(container.querySelector('div')!.className).toBe(`⚡️${styleId} red`);
    expect(container.querySelector('div')!.textContent).toBe('ready');
    cleanup();
  });

  it('keeps projected scoped classes when toggling a slot', async () => {
    const Child = component$(() => {
      useStylesScoped$(STYLE_BLUE);
      const show = useSignal(false);
      return (
        <section>
          <button onClick$={() => (show.value = !show.value)}>toggle slot</button>
          {show.value && <Slot />}
        </section>
      );
    });
    const App = component$(() => {
      useStylesScoped$(STYLE_RED);
      return (
        <Child>
          <span id="content">content</span>
        </Child>
      );
    });

    const { document, container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;
    const styles = Array.from(document.querySelectorAll(QStyleSelector));
    const appStyle = styles.find((style) => style.textContent?.includes('red'))!;
    const childStyle = styles.find((style) => style.textContent?.includes('blue'))!;
    const appScope = `⚡️${appStyle.getAttribute(QStyle)}`;
    const childScope = `⚡️${childStyle.getAttribute(QStyle)}`;

    expect(button.className).toBe(childScope);
    expect(container.querySelector('#content')).toBeFalsy();
    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#content')!.className).toBe(appScope);
    await qwikLoader?.dispatch(button, 'click');
    expect(container.querySelector('#content')).toBeFalsy();
    cleanup();
  });
});

it('ssrRender: appends scoped style to head when rendering document sections', async () => {
  const Wrapper = component$(() => {
    useStylesScoped$(STYLE_RED);
    return <Slot />;
  });

  const { document, cleanup } = await ssrRender(
    <Wrapper>
      <head>
        <script></script>
      </head>
      <body>
        <div>content</div>
      </body>
    </Wrapper>,
    { debug }
  );
  const style = document.head.querySelector(QStyleSelector)!;
  const styleId = style.getAttribute(QStyle)!;

  expect(style.textContent).toBe(getScopedStyles(STYLE_RED, styleId));
  cleanup();
});
