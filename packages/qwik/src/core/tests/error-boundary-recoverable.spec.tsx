import { $, component$, ErrorBoundary, type JSXOutput } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;

// A normal, recoverable runtime error — the boundary should catch it and render the fallback.
const Thrower = component$(() => {
  throw new Error('boom');
});

// A NON-recoverable build/plugin error: Vite/Rollup stamp `.plugin` on transform/build errors.
// `isRecoverable` returns false for these, so a boundary must NOT hide them in its fallback — in dev
// they surface (SSR render rejects; the client rethrows past the boundary) so the developer sees the
// real build failure instead of a generic fallback.
const PluginThrower = component$(() => {
  const err = new Error('build boom');
  (err as any).plugin = 'vite:some-plugin';
  throw err;
});

const Boxed = (child: JSXOutput) => (
  <ErrorBoundary
    fallback$={$((e: any) => (
      <p id="fb">caught: {e.message}</p>
    ))}
  >
    {child}
  </ErrorBoundary>
);

describe('ErrorBoundary: recoverable vs build errors (dev)', () => {
  it('SSR: a recoverable error renders the fallback', async () => {
    const { container } = await ssrRenderToDom(Boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('SSR: a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
    await expect(ssrRenderToDom(Boxed(<PluginThrower />), { debug })).rejects.toThrow('build boom');
  });

  it('CSR: a recoverable error renders the fallback', async () => {
    const { container } = await domRender(Boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
    // Routed via a client `qerror` (like an async QRL failure). The boundary must NOT show its
    // fallback — `handleError` rethrows non-recoverable errors past it (the listener then logs).
    const { container } = await domRender(Boxed(<button id="content">x</button>), { debug });
    const el = container.element;
    const target = el.querySelector('#content')!;
    const err = new Error('build boom');
    (err as any).plugin = 'vite:some-plugin';
    const ev = target.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: err, element: target };
    target.ownerDocument.dispatchEvent(ev);
    try {
      await waitForDrain(container);
    } catch {
      /* the rethrown build error may surface during drain — the point is the fallback never shows */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
  });
});
