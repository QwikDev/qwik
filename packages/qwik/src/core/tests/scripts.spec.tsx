import { component$ } from '@qwik.dev/core';
import { useSignal } from '@qwik.dev/core';
import { describe, expect, it } from 'vitest';
import { csrRender, ssrRender } from '../test-utils';

const debug = false;

describe('ssrRender: qwikloader', () => {
  it('should emit qwikloader and event registrations for event handlers', async () => {
    const ScriptsLoaderAttrs = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { container, html, cleanup } = await ssrRender(ScriptsLoaderAttrs, { debug });

    expect(container.querySelector('button')?.getAttribute('q-e:click')).toBeTruthy();
    expect(html).toContain('id="qwikloader"');
    expect(html).toContain('(window._qwikEv||(window._qwikEv=[])).push("e:click")');

    cleanup();
  });

  it('should keep event registrations when qwikloader is disabled', async () => {
    const ScriptsLoaderDisabled = component$(() => {
      return <button onClick$={() => undefined}>Click</button>;
    });

    const { html, cleanup, qwikLoader } = await ssrRender(ScriptsLoaderDisabled, {
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
            (globalThis as any).__qwikLoaderClicks =
              ((globalThis as any).__qwikLoaderClicks ?? 0) + 1;
            (globalThis as any).__qwikLoaderEventType = event.type;
            (globalThis as any).__qwikLoaderClientX = (event as any).clientX;
          }}
        >
          Click
        </button>
      );
    };

    (globalThis as any).__qwikLoaderClicks = 0;
    (globalThis as any).__qwikLoaderEventType = undefined;
    (globalThis as any).__qwikLoaderClientX = undefined;
    const { container, cleanup, qwikLoader } = await ssrRender(ScriptsLoaderClick, { debug });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();

    await qwikLoader!.dispatch(button!, 'click', { clientX: 7 });

    expect((globalThis as any).__qwikLoaderClicks).toBe(1);
    expect((globalThis as any).__qwikLoaderEventType).toBe('click');
    expect((globalThis as any).__qwikLoaderClientX).toBe(7);

    cleanup();
    delete (globalThis as any).__qwikLoaderClicks;
    delete (globalThis as any).__qwikLoaderEventType;
    delete (globalThis as any).__qwikLoaderClientX;
  });

  it('should run a lazy event handler with captured state through qwikloader', async () => {
    const ScriptsLoaderCapturedClick = () => {
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await ssrRender(ScriptsLoaderCapturedClick, {
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
      const count = useSignal(0);
      return <button onClick$={() => count.value++}>{count.value}</button>;
    };

    const { container, cleanup, qwikLoader } = await ssrRender(ScriptsLoaderCapturedClick, {
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
      const signals = useSignal(Array.from({ length: 1025 }, (_, i) => useSignal(i)));
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

    const { container, cleanup, qwikLoader } = await ssrRender(ScriptsLoaderSplitState, {
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
            (globalThis as any).__csrQwikLoaderClicks =
              ((globalThis as any).__csrQwikLoaderClicks ?? 0) + 1;
            (globalThis as any).__csrQwikLoaderEventType = event.type;
            (globalThis as any).__csrQwikLoaderClientX = (event as any).clientX;
          }}
        >
          Click
        </button>
      );
    };

    (globalThis as any).__csrQwikLoaderClicks = 0;
    (globalThis as any).__csrQwikLoaderEventType = undefined;
    (globalThis as any).__csrQwikLoaderClientX = undefined;
    const { container, cleanup, qwikLoader } = await csrRender(ScriptsCsrLoaderClick, {
      debug,
    });
    const button = container.querySelector('button');

    expect(button).not.toBeNull();
    expect(qwikLoader).toBeDefined();

    await qwikLoader!.dispatch(button!, 'click', { clientX: 11 });

    expect((globalThis as any).__csrQwikLoaderClicks).toBe(1);
    expect((globalThis as any).__csrQwikLoaderEventType).toBe('click');
    expect((globalThis as any).__csrQwikLoaderClientX).toBe(11);

    cleanup();
    delete (globalThis as any).__csrQwikLoaderClicks;
    delete (globalThis as any).__csrQwikLoaderEventType;
    delete (globalThis as any).__csrQwikLoaderClientX;
  });
});
