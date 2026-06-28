import { $, component$ } from '@qwik.dev/core';
import { createOn, createOnDocument, createOnWindow, createSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe.each([
  { name: 'ssrRender', render: ssrRender },
  { name: 'csrRender', render: csrRender },
])('$name: createOn', ({ render }) => {
  it('attaches element events to the first rendered element', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    expect(button.textContent).toBe('0');
    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('updates for passive option', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        'click',
        $(() => {
          count.value++;
        }),
        { passive: true }
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('1');

    cleanup();
  });

  it('supports multiple event names', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        ['click', 'focus'],
        $(() => {
          count.value++;
        })
      );

      return <button>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'focus');
    expect(button.textContent).toBe('2');

    cleanup();
  });

  it('supports capture option', async () => {
    (globalThis as any).__vdomlessCreateOnLogs = [];

    const App = component$(() => {
      createOn(
        'click',
        $(() => {
          (globalThis as any).__vdomlessCreateOnLogs.push('parent capture');
        }),
        { capture: true }
      );

      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).__vdomlessCreateOnLogs.push('button bubble');
            }}
          />
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__vdomlessCreateOnLogs).toEqual(['parent capture', 'button bubble']);

    cleanup();
    delete (globalThis as any).__vdomlessCreateOnLogs;
  });

  it('merges handlers and modifiers for the same event', async () => {
    (globalThis as any).__vdomlessCreateOnLogs = [];

    const App = component$(() => {
      createOn(
        'click',
        $(() => {
          (globalThis as any).__vdomlessCreateOnLogs.push('first');
        }),
        { capture: true }
      );
      createOn(
        'click',
        $(() => {
          (globalThis as any).__vdomlessCreateOnLogs.push('second');
        }),
        { preventdefault: true, stoppropagation: true }
      );

      return (
        <div>
          <button
            onClick$={() => {
              (globalThis as any).__vdomlessCreateOnLogs.push('button bubble');
            }}
          />
        </div>
      );
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const div = container.querySelector('div')!;

    expect(div.hasAttribute('capture:click')).toBe(true);
    expect(div.hasAttribute('preventdefault:click')).toBe(true);
    expect(div.hasAttribute('stoppropagation:click')).toBe(true);

    const event = await qwikLoader?.dispatch(container.querySelector('button')!, 'click');
    expect((globalThis as any).__vdomlessCreateOnLogs).toEqual(['first', 'second']);
    expect(event?.defaultPrevented).toBe(true);
    expect(event?.cancelBubble).toBe(true);

    cleanup();
    delete (globalThis as any).__vdomlessCreateOnLogs;
  });

  it('merges with JSX listeners for the same element event', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button onClick$={() => (count.value += 2)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    expect(button.textContent).toBe('3');

    cleanup();
  });

  it('updates with mixed listeners', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        'click',
        $(() => {
          count.value++;
        })
      );

      return <button onFocus$={() => (count.value += 2)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'focus');
    expect(button.textContent).toBe('3');

    cleanup();
  });

  describe('createOnDocument', () => {
    it('updates value', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOnDocument(
          'click',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'd:click');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('updates value with multiple events', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOnDocument(
          'click',
          $(() => {
            count.value++;
          })
        );
        createOnDocument(
          'focus',
          $(() => {
            count.value += 2;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'd:click');
      await qwikLoader?.dispatch(button, 'focus');
      expect(button.textContent).toBe('3');

      cleanup();
    });

    it('supports DOMContentLoaded event', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOnDocument(
          'DOMContentLoaded',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'DOMContentLoaded');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('supports modifiers on hidden script carriers', async () => {
      const App = component$(() => {
        createOnDocument(
          'click',
          $(() => {}),
          { preventdefault: true }
        );

        return <>headless</>;
      });

      const { container, cleanup } = await render(<App />, { debug });
      const script = container.querySelector('script[hidden]')!;

      expect(script.hasAttribute('preventdefault:click')).toBe(true);

      cleanup();
    });
  });

  describe('createOnWindow', () => {
    it('updates value', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOnWindow(
          'click',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'w:click');
      expect(button.textContent).toBe('1');

      cleanup();
    });

    it('supports modifiers on hidden script carriers', async () => {
      const App = component$(() => {
        createOnWindow(
          'resize',
          $(() => {}),
          { stoppropagation: true }
        );

        return <>headless</>;
      });

      const { container, cleanup } = await render(<App />, { debug });
      const script = container.querySelector('script[hidden]')!;

      expect(script.hasAttribute('stoppropagation:resize')).toBe(true);

      cleanup();
    });

    it('merges with JSX listeners for the same window event', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOnWindow(
          'dblclick',
          $(() => {
            count.value++;
          })
        );

        return <button window:onDblClick$={() => count.value++}>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'w:dblclick');
      expect(button.textContent).toBe('2');

      cleanup();
    });
  });

  describe('custom events', () => {
    it('updates for createOn custom event', async () => {
      const App = component$(() => {
        const count = createSignal(0);

        createOn(
          'SomeCustomEvent',
          $(() => {
            count.value++;
          })
        );

        return <button>{count.value}</button>;
      });

      const { container, cleanup, qwikLoader } = await render(<App />, { debug });
      const button = container.querySelector('button')!;

      await qwikLoader?.dispatch(button, 'SomeCustomEvent');
      expect(button.textContent).toBe('1');

      cleanup();
    });
  });

  it('updates with element, document, window, and JSX listeners together', async () => {
    const App = component$(() => {
      const count = createSignal(0);

      createOn(
        'click',
        $(() => {
          count.value++;
        })
      );
      createOnWindow(
        'focus',
        $(() => {
          count.value += 2;
        })
      );
      createOnDocument(
        'blur',
        $(() => {
          count.value += 3;
        })
      );

      return <button onResize$={() => (count.value += 4)}>{count.value}</button>;
    });

    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const button = container.querySelector('button')!;

    await qwikLoader?.dispatch(button, 'click');
    await qwikLoader?.dispatch(button, 'w:focus');
    await qwikLoader?.dispatch(button, 'd:blur');
    await qwikLoader?.dispatch(button, 'resize');
    expect(button.textContent).toBe('10');

    cleanup();
  });

  it('does not add a hidden script carrier for headless element events', async () => {
    const App = component$(() => {
      createOn(
        'click',
        $(() => {})
      );

      return <>headless</>;
    });

    const { container, cleanup } = await render(<App />, { debug });

    expect(container.querySelector('script[hidden]')).toBeFalsy();

    cleanup();
  });

  it('uses a hidden script carrier for headless document events', async () => {
    const App = component$(() => {
      createOnDocument(
        'qinit',
        $(() => {
          (globalThis as any).__vdomlessCreateOnDocument =
            ((globalThis as any).__vdomlessCreateOnDocument ?? 0) + 1;
        })
      );

      return <>headless</>;
    });

    (globalThis as any).__vdomlessCreateOnDocument = 0;
    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const script = container.querySelector('script[hidden]')!;

    expect(container.innerHTML).toContain('headless');
    expect(script).not.toBeNull();
    await qwikLoader?.dispatch(script, 'qinit');
    expect((globalThis as any).__vdomlessCreateOnDocument).toBe(1);

    cleanup();
    delete (globalThis as any).__vdomlessCreateOnDocument;
  });

  it('executes multiple headless document and window events from one carrier', async () => {
    const App = component$(() => {
      createOnDocument(
        'click',
        $(() => {
          (globalThis as any).__vdomlessCreateOnGlobal++;
        })
      );
      createOnWindow(
        'resize',
        $(() => {
          (globalThis as any).__vdomlessCreateOnGlobal++;
        })
      );

      return <>headless</>;
    });

    (globalThis as any).__vdomlessCreateOnGlobal = 0;
    const { container, cleanup, qwikLoader } = await render(<App />, { debug });
    const script = container.querySelector('script[hidden]')!;

    expect(script.hasAttribute('q-d:click')).toBe(true);
    expect(script.hasAttribute('q-w:resize')).toBe(true);

    await qwikLoader?.dispatch(script, 'click');
    await qwikLoader?.dispatch(script, 'w:resize');
    expect((globalThis as any).__vdomlessCreateOnGlobal).toBe(2);

    cleanup();
    delete (globalThis as any).__vdomlessCreateOnGlobal;
  });
});
