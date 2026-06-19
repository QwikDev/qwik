import { $, ErrorBoundary } from '@qwik.dev/core';
import { domRender, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

const debug = false;

/** Dispatch a `qerror` CustomEvent the same way qwikloader does (see error-boundary.spec.tsx). */
function dispatchQError(
  target: Element,
  detail: { error: unknown; element?: Element; importError?: string }
): void {
  const ev = target.ownerDocument.createEvent('Event');
  ev.initEvent('qerror', false, false);
  (ev as any).detail = detail;
  target.ownerDocument.dispatchEvent(ev);
}

describe('ErrorBoundary qerror listener', () => {
  it('does NOT throw when a qerror has no enclosing ErrorBoundary', async () => {
    const { container } = await domRender(
      <main>
        <button id="target">x</button>
      </main>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    // With no boundary above the host, handleError re-throws. The listener must contain that throw
    // (and log it) instead of letting it escape document.dispatchEvent.
    expect(() =>
      dispatchQError(target, { error: new Error('boom'), element: target })
    ).not.toThrow();
  });

  it('control: a with-boundary qerror still reveals the fallback', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    dispatchQError(target, { error: new Error('async boom'), element: target });
    await waitForDrain(container);

    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async boom');
  });

  it('an importError qerror only logs and does NOT reveal the fallback', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const target = container.element.querySelector('#target')!;

    // qwikloader already console.errors QRL chunk-import / missing-symbol failures (importError set),
    // so they must not be routed to a boundary.
    expect(() =>
      dispatchQError(target, { error: new Error('sym:0'), element: target, importError: 'sync' })
    ).not.toThrow();
    await waitForDrain(container);

    expect(container.element.querySelector('#fb')).toBeFalsy();
  });
});
