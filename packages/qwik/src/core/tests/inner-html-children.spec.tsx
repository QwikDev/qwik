import { component$, useSignal, useTask$, useVisibleTask$, type Component } from '@qwik.dev/core';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { testRenderer } from '../test-utils';

const { name, render } = testRenderer;
const isResume = name === 'ssrRender';

// Lazily loaded task segments reach the log through the global, not a module import.
const ran: string[] = ((globalThis as { __innerHtmlRan?: string[] }).__innerHtmlRan = []);

const Dropped = component$(() => {
  useTask$(() => {
    (globalThis as { __innerHtmlRan?: string[] }).__innerHtmlRan!.push('task');
  });
  useVisibleTask$(
    () => {
      (globalThis as { __innerHtmlRan?: string[] }).__innerHtmlRan!.push('visible task');
    },
    { strategy: 'document-ready' }
  );
  return <b>dropped</b>;
});

async function renderApp(App: Component) {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  onTestFinished(() => {
    error.mockRestore();
    warn.mockRestore();
  });
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
  const host = result.container.querySelector('#host')!;
  return { ...result, host, click, error, warn };
}

describe(`${name}: dangerouslySetInnerHTML with children`, () => {
  beforeEach(() => {
    ran.length = 0;
  });

  it('renders only the innerHTML and runs nothing from the children', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      return (
        <section>
          <p id="host" dangerouslySetInnerHTML="<i>html</i>">
            <span onClick$={() => count.value++}>{count.value}</span>
            <Dropped />
          </p>
          <button id="more" onClick$={() => count.value++}>
            more
          </button>
        </section>
      );
    });
    const { host, click, error } = await renderApp(App);
    expect(host.innerHTML).toBe('<i>html</i>');
    await click('#more');
    expect(host.innerHTML).toBe('<i>html</i>');
    expect(ran).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });

  it('renders exactly the innerHTML a spread carries', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const attrs = useSignal<Record<string, string>>({ dangerouslySetInnerHTML: '<i>html</i>' });
      return (
        <section>
          <p id="host" {...attrs.value}>
            <span onClick$={() => count.value++}>{count.value}</span>
            <Dropped />
          </p>
          <button id="more" onClick$={() => count.value++}>
            more
          </button>
        </section>
      );
    });
    const { host, click, error, warn } = await renderApp(App);
    expect(host.innerHTML).toBe('<i>html</i>');
    // Only client rendering can tell the children apart from the server's innerHTML.
    expect(warn).toHaveBeenCalledTimes(isResume ? 0 : 1);
    // A replaced child's subscription stays quiet on a later write.
    await click('#more');
    expect(host.innerHTML).toBe('<i>html</i>');
    expect(error).not.toHaveBeenCalled();
  });

  it('gives the innerHTML when a spread starts carrying it after the first render', async () => {
    const App = component$(() => {
      const count = useSignal(0);
      const attrs = useSignal<Record<string, string>>({ title: 'plain' });
      return (
        <section>
          <p id="host" {...attrs.value}>
            <span>{count.value}</span>
            <Dropped />
          </p>
          <button id="more" onClick$={() => count.value++}>
            more
          </button>
          <button
            id="html"
            onClick$={() => (attrs.value = { dangerouslySetInnerHTML: '<i>html</i>' })}
          >
            html
          </button>
        </section>
      );
    });
    const { host, click, error, warn } = await renderApp(App);
    expect(host.textContent).toBe('0dropped');
    expect(warn).not.toHaveBeenCalled();
    await click('#html');
    expect(host.innerHTML).toBe('<i>html</i>');
    // A server-rendered element may hold the server's innerHTML, so only the client one warns.
    expect(warn).toHaveBeenCalledTimes(isResume ? 0 : 1);
    await click('#more');
    expect(host.innerHTML).toBe('<i>html</i>');
    expect(error).not.toHaveBeenCalled();
  });

  // Only the compiler sees authored children; the server output cannot tell them from innerHTML.
  it.runIf(!isResume)(
    'warns when a spread innerHTML replaces client-rendered children',
    async () => {
      const App = component$(() => {
        const attrs = useSignal<Record<string, string>>({ title: 'plain' });
        return (
          <section>
            <p id="host" {...attrs.value}>
              <span>child</span>
            </p>
            <button
              id="html"
              onClick$={() => (attrs.value = { dangerouslySetInnerHTML: '<i>html</i>' })}
            >
              html
            </button>
          </section>
        );
      });
      const { host, click, warn } = await renderApp(App);
      expect(warn).not.toHaveBeenCalled();
      await click('#html');
      expect(host.innerHTML).toBe('<i>html</i>');
      expect(warn).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        '<p> renders its dangerouslySetInnerHTML, so its children are ignored.'
      );
    }
  );
});
