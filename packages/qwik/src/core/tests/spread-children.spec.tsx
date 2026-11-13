import {
  $,
  component$,
  Slot,
  useOn,
  useSignal,
  useStylesScoped$,
  useTask$,
  untrack,
  useVisibleTask$,
  type Component,
  type PropsOf,
  type Signal,
} from '@qwik.dev/core';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
const isResume = name === 'ssrRender';

// Lazily loaded segments reach the log through the global, not a module import.
const log: string[] = ((globalThis as { __spreadLog?: string[] }).__spreadLog = []);

async function renderApp(App: Component) {
  log.length = 0;
  const result = await render(App);
  onTestFinished(result.cleanup);
  if (isResume) {
    await result.qwikLoader?.dispatch(
      result.container.querySelector('script[hidden]') ?? result.container,
      'qinit'
    );
  }
  await result.flush();
  const click = async (selector: string) => {
    await result.qwikLoader!.dispatch(result.container.querySelector(selector)!, 'click');
    await result.flush();
  };
  return { ...result, click };
}

const Card = component$(() => <i>card</i>);

// Declared at module level: a visible task inside a test-local component breaks the spec transform.
const Link = component$((props: PropsOf<'a'>) => {
  useOn(
    'click',
    $(() => {
      (globalThis as { __spreadLog?: string[] }).__spreadLog!.push('useOn');
    })
  );
  useVisibleTask$(
    () => {
      (globalThis as { __spreadLog?: string[] }).__spreadLog!.push('visible task');
    },
    { strategy: 'document-ready' }
  );
  return (
    <a {...props}>
      <Slot />
    </a>
  );
});

const RefReader = component$((props: { element: Signal<Element | undefined> }) => {
  const seen = useSignal('');
  useTask$(() => {
    seen.value = untrack(() => props.element.value) === undefined ? 'unset' : 'set';
  });
  return <span id="seen">{seen.value}</span>;
});

// Scoped styles in a component declared inside a test break the spec transform today.
const ScopedButton = component$(() => {
  useStylesScoped$('.on { color: red }');
  const count = useSignal(0);
  const attrs = {
    class: 'on',
    style: { color: 'blue' },
    onClick$: $(() => {
      (globalThis as { __spreadLog?: string[] }).__spreadLog!.push('spread');
    }),
  };
  return (
    <button
      id="host"
      {...attrs}
      onClick$={() => {
        (globalThis as { __spreadLog?: string[] }).__spreadLog!.push('own');
        count.value++;
      }}
    >
      <b>{count.value}</b>
    </button>
  );
});

describe(`${name}: spread props on an element with children`, () => {
  // A server-rendered element never runs the client props-effect order.
  it.runIf(!isResume)('calls a spread function ref once the children are wired', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const attrs = {
        ref: $((element: Element) => {
          (globalThis as { __spreadLog?: string[] }).__spreadLog!.push(element.textContent ?? '');
        }),
      };
      return (
        <p id="host" {...attrs}>
          <b>{count.value}</b>
          <Card />
        </p>
      );
    });
    await renderApp(App);
    await vi.waitFor(() => expect(log).toEqual(['0card']));
  });

  it('fills a spread signal ref with the rendered element', async () => {
    const App = component$(() => {
      const element = useSignal<Element>();
      const seen = useSignal('');
      return (
        <section>
          <p id="host" {...{ ref: element }}>
            <Card />
          </p>
          <button id="read" onClick$={() => (seen.value = element.value?.textContent ?? '')}>
            {seen.value}
          </button>
        </section>
      );
    });
    const { container, click } = await renderApp(App);
    await click('#read');
    expect(container.querySelector('#read')!.textContent).toBe('card');
  });

  it('lets a child task see the spread ref, as on the server', async () => {
    const App = component$(() => {
      const element = useSignal<Element>();
      return (
        <p id="host" {...{ ref: element }}>
          <RefReader element={element} />
        </p>
      );
    });
    const { container } = await renderApp(App);
    expect(container.querySelector('#seen')!.textContent).toBe('set');
  });

  it('keeps class, scoped style and the last spread handler next to wired children', async () => {
    const { container, click } = await renderApp(ScopedButton);
    const host = container.querySelector('#host')!;
    expect(host.className).toMatch(/^⚡️\S+ on$/);
    expect(host.getAttribute('style')).toBe('color:blue');
    await click('#host');
    expect(log).toEqual(['own']);
    expect(host.textContent).toBe('1');
  });

  it('runs a spread handler and useOn on a component that projects through a spread', async () => {
    const App = component$(() => (
      <Link
        id="host"
        href="#x"
        onClick$={() => {
          (globalThis as { __spreadLog?: string[] }).__spreadLog!.push('click');
        }}
      >
        go <Card />
      </Link>
    ));
    const { container, click } = await renderApp(App);
    const host = container.querySelector('#host')!;
    expect(host.getAttribute('href')).toBe('#x');
    expect(host.textContent).toBe('go card');
    await vi.waitFor(() => expect(log).toEqual(['visible task']));
    await click('#host');
    expect(log).toEqual(['visible task', 'click', 'useOn']);
  });

  it('keeps the svg namespace for children of a spread svg', async () => {
    const App = component$(() => {
      const d = useSignal('M0 0');
      return (
        <svg id="host" {...{ viewBox: '0 0 10 10' }} onClick$={() => (d.value = 'M1 1')}>
          <path d={d.value} />
        </svg>
      );
    });
    const { container, click } = await renderApp(App);
    const path = container.querySelector('path')!;
    expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(container.querySelector('#host')!.getAttribute('viewBox')).toBe('0 0 10 10');
    await click('#host');
    expect(path.getAttribute('d')).toBe('M1 1');
  });

  it('keeps server-rendered children when a resumed spread changes without innerHTML', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <p id="host" {...{ title: `t${count.value}` }} onClick$={() => count.value++}>
          <b>{count.value}</b>
          <Card />
        </p>
      );
    });
    const { container, click } = await renderApp(App);
    const host = container.querySelector('#host')!;
    const bold = host.querySelector('b');
    await click('#host');
    expect(host.getAttribute('title')).toBe('t1');
    expect(host.querySelector('b')).toBe(bold);
    expect(host.textContent).toBe('1card');
  });
});
