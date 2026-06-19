import { component$, type JSXOutput } from '@qwik.dev/core';
import { ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

// Safety-net invariant (PR #8745): the PR now catches SSR render throws at every drain site so a
// throw inside an <ErrorBoundary> renders the fallback instead of aborting. But with NO boundary
// above, the throw MUST still propagate and reject the render (abort to the error page) — it must
// not be silently swallowed. These in-order SSR cases pin each of the three catch paths to that
// rethrow behavior. (`ssrRenderToDom` with no `stream`/`streaming` opts renders in-order via
// `renderToString`, so `ssr.outOfOrderStreaming` is false and the final rethrow branch of
// `renderErrorBoundaryFallback` is exercised.)

const debug = false;

// Throws synchronously during render — caught by the component-body try/catch in ssr-render-jsx.ts.
const Thrower = component$(() => {
  throw new Error('boom');
});

// An async component whose render itself rejects (returns a rejecting promise) — exercises the
// awaited-output drain path rather than the promise-child path.
const AsyncRejector = component$(
  () => new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom'))) as any
);

// A rejected promise child (not a component) — exercises the Promise drain path.
const PromiseChild = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

describe('ErrorBoundary safety net: in-order SSR throw with no boundary above', () => {
  it('(a) a synchronous render throw propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <Thrower />
        </main>,
        { debug }
      )
    ).rejects.toThrow('boom');
  });

  it('(a) the ORIGINAL error object propagates unchanged (not wrapped/projected)', async () => {
    const original = new Error('boom');
    const Throws = component$(() => {
      throw original;
    });
    let caught: unknown;
    try {
      await ssrRenderToDom(
        <main>
          <Throws />
        </main>,
        { debug }
      );
    } catch (err) {
      caught = err;
    }
    // With no boundary above, the raw throw must propagate — `toSerializableBoundaryError` must NOT
    // run on this path, so the identity is preserved.
    expect(caught).toBe(original);
  });

  it('(b) an async component whose render rejects propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <AsyncRejector />
        </main>,
        { debug }
      )
    ).rejects.toThrow('async boom');
  });

  it('(c) a rejected promise child propagates and rejects the render', async () => {
    await expect(
      ssrRenderToDom(
        <main>
          <PromiseChild />
        </main>,
        { debug }
      )
    ).rejects.toThrow('async boom');
  });
});
