import { component$ } from '@qwik.dev/core';
import { createSignal } from '@qwik.dev/core/spark';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe('ssrRender: qwikloader', () => {
  it('should emit qwikloader and event registrations for event handlers', async () => {
    const ScriptsLoaderAttrs = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { container, html, cleanup } = await ssrRender(<ScriptsLoaderAttrs />, { debug });

    expect(container.querySelector('button')?.getAttribute('q-e:click')).toBeTruthy();
    expect(html).toContain('id="qwikloader"');
    expect(html).toContain('(window._qwikEv||(window._qwikEv=[])).push("e:click")');

    cleanup();
  });

  it('should keep event registrations when qwikloader is disabled', async () => {
    const ScriptsLoaderDisabled = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { html, cleanup, qwikLoader } = await ssrRender(<ScriptsLoaderDisabled />, {
      debug,
      qwikLoader: 'never',
    });

    expect(html).not.toContain('id="qwikloader"');
    expect(html).toContain('(window._qwikEv||(window._qwikEv=[])).push("e:click")');
    expect(qwikLoader).toBeUndefined();

    cleanup();
  });

  it('should run a lazy event handler through qwikloader', async () => {
    const ScriptsLoaderClick = () => {
      return (
        <button
          onClick$={(event) => {
            (globalThis as any).__vdomlessQwikLoaderClicks =
              ((globalThis as any).__vdomlessQwikLoaderClicks ?? 0) + 1;
            (globalThis as any).__vdomlessQwikLoaderEventType = event.type;
            (globalThis as any).__vdomlessQwikLoaderClientX = (event as any).clientX;
          }}
        >
          Click
        </button>
      );
    };

    (globalThis as any).__vdomlessQwikLoaderClicks = 0;
    (globalThis as any).__vdomlessQwikLoaderEventType = undefined;
    (globalThis as any).__vdomlessQwikLoaderClientX = undefined;
    const { container, cleanup, qwikLoader } = await ssrRender(<ScriptsLoaderClick />, { debug });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();

    await qwikLoader!.dispatch(button!, 'click', { clientX: 7 });

    expect((globalThis as any).__vdomlessQwikLoaderClicks).toBe(1);
    expect((globalThis as any).__vdomlessQwikLoaderEventType).toBe('click');
    expect((globalThis as any).__vdomlessQwikLoaderClientX).toBe(7);

    cleanup();
    delete (globalThis as any).__vdomlessQwikLoaderClicks;
    delete (globalThis as any).__vdomlessQwikLoaderEventType;
    delete (globalThis as any).__vdomlessQwikLoaderClientX;
  });

  it('should run a lazy event handler with captured state through qwikloader', async () => {
    const ScriptsLoaderCapturedClick = () => {
      const count = createSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await ssrRender(<ScriptsLoaderCapturedClick />, {
      debug,
    });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();
    expect(button!.textContent).toBe('0');

    await qwikLoader!.dispatch(button!, 'click');

    expect(button!.textContent).toBe('1');

    cleanup();
  });

  it('should queue quick captured clicks through qwikloader', async () => {
    const ScriptsLoaderCapturedClick = () => {
      const count = createSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await ssrRender(<ScriptsLoaderCapturedClick />, {
      debug,
    });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();

    const first = qwikLoader!.dispatch(button!, 'click');
    const second = qwikLoader!.dispatch(button!, 'click');
    await Promise.all([first, second]);

    expect(button!.textContent).toBe('2');

    cleanup();
  });

  it('should run captured handlers when state is split across scripts', async () => {
    const ScriptsLoaderSplitState = () => {
      const signals = createSignal(Array.from({ length: 1025 }, (_, i) => createSignal(i)));
      const last = signals.value[signals.value.length - 1];

      return (
        <div>
          {signals.value.map((signal, index) => (
            <span key={index}>{signal.value}</span>
          ))}
          <button onClick$={() => last.value++}>{last.value}</button>
        </div>
      );
    };

    const { container, cleanup, qwikLoader } = await ssrRender(<ScriptsLoaderSplitState />, {
      debug,
    });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();
    expect(container.querySelectorAll('script[type="qwik/state"]').length).toBeGreaterThan(1);
    expect(button!.textContent).toBe('1024');

    await qwikLoader!.dispatch(button!, 'click');

    expect(button!.textContent).toBe('1025');

    cleanup();
  });
});

describe('csrRender: qwikloader', () => {
  it('should run a _qDispatch event handler through qwikloader', async () => {
    const ScriptsCsrLoaderClick = () => {
      return (
        <button
          onClick$={(event) => {
            (globalThis as any).__vdomlessCsrQwikLoaderClicks =
              ((globalThis as any).__vdomlessCsrQwikLoaderClicks ?? 0) + 1;
            (globalThis as any).__vdomlessCsrQwikLoaderEventType = event.type;
            (globalThis as any).__vdomlessCsrQwikLoaderClientX = (event as any).clientX;
          }}
        >
          Click
        </button>
      );
    };

    (globalThis as any).__vdomlessCsrQwikLoaderClicks = 0;
    (globalThis as any).__vdomlessCsrQwikLoaderEventType = undefined;
    (globalThis as any).__vdomlessCsrQwikLoaderClientX = undefined;
    const { container, cleanup, qwikLoader } = await csrRender(<ScriptsCsrLoaderClick />, {
      debug,
    });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();

    await qwikLoader!.dispatch(button!, 'click', { clientX: 11 });

    expect((globalThis as any).__vdomlessCsrQwikLoaderClicks).toBe(1);
    expect((globalThis as any).__vdomlessCsrQwikLoaderEventType).toBe('click');
    expect((globalThis as any).__vdomlessCsrQwikLoaderClientX).toBe(11);

    cleanup();
    delete (globalThis as any).__vdomlessCsrQwikLoaderClicks;
    delete (globalThis as any).__vdomlessCsrQwikLoaderEventType;
    delete (globalThis as any).__vdomlessCsrQwikLoaderClientX;
  });
});
