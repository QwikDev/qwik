import {
  $,
  component$,
  createAsync$,
  ErrorBoundary,
  Suspense,
  type JSXOutput,
} from '@qwik.dev/core';
import { createDocument, domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';

const debug = false;

const Thrower = component$(() => {
  throw new Error('boom');
});

// Throws *asynchronously*: a rejected promise child resolves after the Suspense placeholder has
// already streamed, so the throw surfaces as the deferred segment's rejection.
const AsyncThrower = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

// An async component whose render itself rejects (returns a rejecting promise, not a promise child) —
// exercises the async-component drain path rather than the promise-child path.
const AsyncRejector = component$(
  () => new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom'))) as any
);

// A fallback whose own render throws — must not deadlock the stream.
const FallbackBoomer = component$(() => {
  throw new Error('fallback boom');
});

// Reads an async signal (the signal object, not its value) whose computation rejects — exercises the
// async-signal drain path.
const AsyncSignalThrower = component$(() => {
  const sig = createAsync$(() => Promise.reject(new Error('async signal boom')));
  return <>{sig}</>;
});

describe('ErrorBoundary', () => {
  it('projects children when there is no error', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="content">All good</div>
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#content')).toBeTruthy();
    expect(container.element.querySelector('#fb')).toBeFalsy();
  });

  it('SSR: renders the fallback in place when a child throws during render', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <Thrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('client: a render throw is caught by the NEAREST boundary', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
      >
        <div id="content">ok</div>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-inner">inner</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#content')).toBeTruthy();
  });

  it('client: an async qerror is routed to the NEAREST boundary', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => (
          <p id="fb-outer">outer</p>
        ))}
      >
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-inner">inner</p>
          ))}
        >
          <button id="target">x</button>
        </ErrorBoundary>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('async boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    expect(el.querySelector('#fb-inner')).toBeTruthy();
    expect(el.querySelector('#fb-outer')).toBeFalsy();
  });

  it('client: a throwing fallback does not infinite-loop handleError', async () => {
    const { container } = await domRender(
      <ErrorBoundary
        fallback$={$(() => {
          throw new Error('fallback boom');
        })}
      >
        <button id="target">x</button>
      </ErrorBoundary>,
      { debug }
    );
    const el = container.element;
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('client boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    // The re-entrancy guard breaks the loop; without it this hangs (~infinite handleError calls).
    // A throwing fallback may surface as a drain rejection — that's fine; the point is it terminates.
    try {
      await waitForDrain(container);
    } catch {
      /* throwing fallback propagated — acceptable, as long as we didn't loop */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
  });
});

describe('ErrorBoundary streaming swap (experimental)', () => {
  // Render with out-of-order streaming, then run the emitted `qO` scripts to perform the inline swap
  // (hide the content host, reveal the fallback host) and wire `qProcessOOOS` for resume, mirroring
  // the Suspense OOOS specs. Returns the streamed HTML (to assert the boundary did NOT block) plus
  // the resumed document (to assert the post-swap DOM).
  const streamAndResume = async (jsx: JSXOutput) => {
    const chunks: string[] = [];
    await ssrRenderToDom(jsx, {
      stream: {
        write: (c: string) => {
          chunks.push(c);
        },
      },
      streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true },
      debug,
    });
    const html = chunks.join('');
    const document = createDocument({ html });
    (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (s) => s.textContent || ''
    ).filter((code) => code.includes('qO') || code.includes('qInstallOOOS'));
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);
    return { html, document };
  };

  const displayOf = (el: Element | null | undefined) =>
    (el as HTMLElement | null | undefined)?.style?.display;

  it('streams the content, then hides it and reveals the fallback when a descendant throws', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="before">before</div>
          <Thrower />
          <div id="after">after</div>
        </ErrorBoundary>
        <footer id="eb-tail">tail</footer>
      </main>
    );
    // The boundary never blocks: its content streams as usual.
    expect(html).toContain('id="before"');
    // The inline `qO` swap script lands right after the boundary — BEFORE trailing content — so the
    // broken content is not left visible until end-of-stream. The swap is a plain inline script, so
    // it runs as the chunk parses, with no dependency on the framework having resumed.
    const swapPos = html.search(/qO\(\d/);
    expect(swapPos).toBeGreaterThan(html.indexOf('id="before"'));
    expect(swapPos).toBeLessThan(html.indexOf('id="eb-tail"'));
    // After the swap the content host is hidden and the fallback host revealed.
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('renders the content unchanged when nothing throws (ships no swap JS)', async () => {
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <div id="before">before</div>
          <div id="content">all good</div>
          <div id="after">after</div>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#content')?.textContent).toBe('all good');
    expect(displayOf(document.querySelector('#content')?.closest('div[style]'))).toBe('contents');
    expect(document.querySelector('#fb')).toBeFalsy();
    // An error-free boundary arms nothing: neither the shared qO executor nor any qO(id) call.
    expect(html).not.toMatch(/qO\(|qInstallOOOS/);
  });

  it('a deferred (async) throw inside a child <Suspense> tears down the WHOLE boundary', async () => {
    // The boundary committed once the Suspense placeholder streamed, so it can't catch the later
    // async throw in place. Instead the whole boundary — the streamed sibling and the Suspense — is
    // hidden and the boundary fallback revealed (the dev's `fallback$` replaces the boundary, not a
    // sub-slot of it).
    const { html, document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel">loading</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    expect(html).toContain('id="sibling"');
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
  });

  it('nested boundaries: the inner one tears down, the outer subtree stays visible', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-sibling">outer-sibling</div>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <div id="before">before</div>
            <Thrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </ErrorBoundary>
      </main>
    );
    // The inner boundary catches: its content host hides, its fallback shows.
    expect(document.querySelector('#fb-inner')).toBeTruthy();
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
    // The outer subtree is untouched and stays visible.
    expect(document.querySelector('#outer-sibling')).toBeTruthy();
    expect(displayOf(document.querySelector('#outer-sibling')?.closest('div[style]'))).toBe(
      'contents'
    );
  });

  it('boundary inside a <Suspense> buffers within the segment (skeleton → fallback)', async () => {
    // When the boundary sits inside a <Suspense> its subtree is already deferred into a buffered
    // segment, so the boundary buffers there and discards the partial content — a clean
    // skeleton → fallback swap rather than the stream-and-hide path used by a live boundary.
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="loading">loading</span>}>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb">caught: {e.message}</p>
            ))}
          >
            <div id="before">before</div>
            <Thrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#before')).toBeFalsy();
    expect(document.querySelector('#after')).toBeFalsy();
  });

  it('boundary inside a <Suspense>: an async throw rolls back the WHOLE content', async () => {
    const { document } = await streamAndResume(
      <main>
        <Suspense fallback={<span id="loading">loading</span>}>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb">caught: {String(e?.message ?? e)}</p>
            ))}
          >
            <div id="before">before</div>
            <AsyncThrower />
            <div id="after">after</div>
          </ErrorBoundary>
        </Suspense>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(document.querySelector('#before')).toBeFalsy();
    expect(document.querySelector('#after')).toBeFalsy();
  });

  it('catches an async component whose render rejects (no <Suspense>)', async () => {
    // The async component is not wrapped in a <Suspense>; its rejection is routed to the boundary
    // (async-component drain path) instead of aborting the stream.
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncRejector />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('catches a rejected promise child (no <Suspense>)', async () => {
    // A rejected promise child (not wrapped in a <Suspense>) is routed to the boundary
    // (promise-child drain path) instead of aborting the stream.
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <AsyncThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
  });

  it('a fallback whose own render throws aborts the stream instead of deadlocking', async () => {
    // A throwing fallback must not re-render itself forever. With its own `$fallback$` detached
    // while rendering, the throw propagates (here: aborts to the error page) rather than hanging.
    await expect(
      streamAndResume(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <FallbackBoomer />
            ))}
          >
            <Thrower />
          </ErrorBoundary>
        </main>
      )
    ).rejects.toThrow('fallback boom');
  });

  it('catches an async signal that rejects (no <Suspense>)', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncSignalThrower />
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async signal boom');
    expect(displayOf(document.querySelector('#before')?.closest('div[style]'))).toBe('none');
  });

  it('sibling boundaries swap independently', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-a">A failed</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-b">B failed</p>
          ))}
        >
          <div id="ok-b">b ok</div>
        </ErrorBoundary>
      </main>
    );
    // The first boundary errored → its fallback shows; the second is fine → its content shows. The
    // boundaries use distinct ids, so the swaps don't interfere.
    expect(document.querySelector('#fb-a')).toBeTruthy();
    expect(document.querySelector('#ok-b')?.textContent).toBe('b ok');
    expect(document.querySelector('#fb-b')).toBeFalsy();
    expect(displayOf(document.querySelector('#fb-a')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#ok-b')?.closest('div[style]'))).toBe('contents');
  });

  // NOTE: a client-time error after a streamed (out-of-order) resume is covered by the e2e
  // (`scenario=client` in error-boundary-streaming.e2e.ts) rather than here: re-rendering a resumed
  // streamed boundary to its fallback needs the `fallback$` QRL to resolve, which the unit resume
  // harness (createDocument + emulated scripts) cannot do, so it would hang. The reactive re-render
  // path itself is unit-tested via `domRender` in the first describe block above.
});
