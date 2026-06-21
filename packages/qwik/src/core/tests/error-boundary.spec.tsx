import {
  $,
  component$,
  createAsync$,
  ErrorBoundary,
  render,
  setPlatform,
  Slot,
  Suspense,
  useSignal,
  useTask$,
  useVisibleTask$,
  type JSXOutput,
} from '@qwik.dev/core';
import { _getDomContainer } from '@qwik.dev/core/internal';
import {
  createDocument,
  domRender,
  getTestPlatform,
  ssrRenderToDom,
  waitForDrain,
} from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';
import { rerenderComponent } from '../../testing/rendering.unit-util';
import { delay } from '../shared/utils/promises';

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

// An async component whose render itself rejects (returns a rejecting promise, not a promise child).
const AsyncRejector = component$(
  () => new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom'))) as any
);

// A fallback whose own render throws — must not deadlock the stream.
const FallbackBoomer = component$(() => {
  throw new Error('fallback boom');
});

// Reads an async signal whose computation rejects — exercises the async-signal drain path.
const AsyncSignalThrower = component$(() => {
  const sig = createAsync$(() => Promise.reject(new Error('async signal boom')));
  return <>{sig}</>;
});

const ThrowerA = component$(() => {
  throw new Error('boomA');
});
const ThrowerB = component$(() => {
  throw new Error('boomB');
});

// A non-serializable thrown value (must be module-scoped: it's captured by a `component$` QRL).
class NonSerializableError {
  message = 'non-serializable boom';
  toJSON() {
    return this.message;
  }
}

// Render with out-of-order streaming, then run the emitted `qO` scripts to perform the inline swap.
// Returns the streamed HTML (to assert the boundary didn't block) and the resumed document.
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
  ).filter(
    (code) =>
      code.includes('qO') ||
      code.includes('qInstallOOOS') ||
      code.includes('qErr') ||
      code.includes('qInstallErrorSwap')
  );
  // eslint-disable-next-line no-new-func
  new Function('document', scripts.join('\n'))(document);
  return { html, document };
};

const displayOf = (el: Element | null | undefined) =>
  (el as HTMLElement | null | undefined)?.style?.display;

/** Dispatch a `qerror` CustomEvent the same way qwikloader does. */
const dispatchQError = (
  target: Element,
  detail: { error: unknown; element?: Element; importError?: string }
) => {
  const ev = target.ownerDocument.createEvent('Event');
  ev.initEvent('qerror', false, false);
  (ev as any).detail = detail;
  target.ownerDocument.dispatchEvent(ev);
};

const fbCount = (root: any) => root.querySelectorAll('#fb').length;

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

  it('SSR: shows the fallback and swaps the content out when a child throws during render', async () => {
    // The redesign never leaves the errored content visible: it streams the fallback into the sibling
    // host and hides the content-host (a swap, not "rendered in place").
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="content">content</div>
        <Thrower />
      </ErrorBoundary>,
      { debug, streaming: { outOfOrder: false } }
    );
    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    // The partial content sits (closed, well-formed) inside the hidden content-host — swapped out.
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.style.display).toBe('none');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);
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
    // With no ancestor boundary the throwing fallback escalates to the generic handler (logged), which
    // terminates the loop. It may surface as a drain rejection — fine; the point is it terminates.
    try {
      await waitForDrain(container);
    } catch {
      /* throwing fallback propagated — acceptable, as long as we didn't loop */
    }
    expect(el.querySelector('#fb')).toBeFalsy();
  });
});

describe('ErrorBoundary streaming swap (experimental)', () => {
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
    // The swap script lands right after the boundary, before trailing content (not at end-of-stream).
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
    // The whole boundary (the streamed sibling and the Suspense) is torn down to the fallback, not
    // wedged into the Suspense slot.
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

  it('boundary inside a <Suspense> swaps within the segment (skeleton → fallback)', async () => {
    // Inside a <Suspense> the boundary uses the SAME two-host swap as standalone, rendered into the
    // segment buffer; its `qErr(id)` is emitted at the root after the segment's `qO` reveal (an inline
    // script inside the segment `<template>` would be inert). The partial content is swapped out
    // (hidden in the content-host), NOT discarded via a rollback.
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
    const contentHost = document.querySelector('[q\\:ebc]');
    expect(contentHost?.querySelector('#before')).toBeTruthy();
    expect(displayOf(contentHost)).toBe('none');
  });

  it('boundary inside a <Suspense>: an async throw swaps out the WHOLE content', async () => {
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
    // The whole content is swapped out (hidden in the content-host), not discarded.
    const contentHost = document.querySelector('[q\\:ebc]');
    expect(contentHost?.querySelector('#before')).toBeTruthy();
    expect(displayOf(contentHost)).toBe('none');
  });

  it('catches an async component whose render rejects (no <Suspense>)', async () => {
    // The async component's rejection is routed to the boundary (async-component drain path) instead
    // of aborting the stream.
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
    // A rejected promise child is routed to the boundary (promise-child drain path) instead of
    // aborting the stream.
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
    // With its own `$fallback$` detached while rendering, the throw propagates (aborts to the error
    // page) rather than re-rendering itself forever.
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

  // The OOOS branch never read `store.error`, so a client-time error relies on `handleError`'s
  // explicit re-render to swap in the fallback (also covered by the `scenario=client` e2e).
  it('client: a post-resume error on an out-of-order streamed boundary re-renders to its fallback', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <button id="target">x</button>
          <div id="content">content ok</div>
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    // Streamed fine: the content is present and no fallback was streamed.
    expect(el.querySelector('#content')?.textContent).toBe('content ok');
    expect(el.querySelector('#fb')).toBeFalsy();

    // Route a client-time error to the boundary, mirroring a resumed `qerror`.
    const target = el.querySelector('#target')!;
    const ev = el.ownerDocument.createEvent('Event');
    ev.initEvent('qerror', false, false);
    (ev as any).detail = { error: new Error('client boom'), element: target };
    el.ownerDocument.dispatchEvent(ev);
    await waitForDrain(container);

    // The boundary re-rendered to its fallback; the two-host structure (incl. the placeholder host)
    // is gone.
    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    expect(el.querySelector('#content')).toBeFalsy();
  });
});

// Combinatorial coverage for multiple throws / multiple boundaries across CSR, in-order SSR, and
// out-of-order streaming — pinning down the "who catches what" semantics.
describe('ErrorBoundary combinations', () => {
  describe('CSR', () => {
    it('two throwing children in one boundary render a single fallback (first error wins)', async () => {
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowerA />
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(fbCount(container.element)).toBe(1);
      expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boomA');
    });

    it('two adjacent boundaries that both throw each show their own fallback', async () => {
      const { container } = await domRender(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>,
        { debug }
      );
      expect(container.element.querySelector('#fb-a')).toBeTruthy();
      expect(container.element.querySelector('#fb-b')).toBeTruthy();
    });

    it('nested boundaries: when the outer also throws it supersedes the inner fallback', async () => {
      // The inner boundary catches its own child, but the outer boundary catches its direct-child
      // throw and re-renders its whole subtree to the outer fallback — replacing the inner one.
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
            <ThrowerA />
          </ErrorBoundary>
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(container.element.querySelector('#fb-outer')).toBeTruthy();
      expect(container.element.querySelector('#fb-inner')).toBeFalsy();
    });

    it('a throwing inner fallback escalates to the outer boundary', async () => {
      // The inner fallback itself throws, so the inner boundary can't show it; the throw escalates to
      // the nearest ancestor boundary, which shows its fallback (never loops on the inner boundary).
      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <ErrorBoundary
            fallback$={$(() => {
              throw new Error('inner fallback boom');
            })}
          >
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container).catch(() => {});
      expect(container.element.querySelector('#fb-outer')?.textContent).toBe('outer');
      expect(container.element.querySelector('#fb-inner')).toBeFalsy();
    });
  });

  describe('in-order SSR', () => {
    it('two throwing children in one boundary render a single fallback', async () => {
      const { container } = await ssrRenderToDom(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowerA />
          <ThrowerB />
        </ErrorBoundary>,
        { debug }
      );
      expect(fbCount(container.element)).toBe(1);
    });

    it('two adjacent boundaries that both throw each show their own fallback', async () => {
      const { container } = await ssrRenderToDom(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>,
        { debug }
      );
      expect(container.element.querySelector('#fb-a')).toBeTruthy();
      expect(container.element.querySelector('#fb-b')).toBeTruthy();
    });
  });

  describe('out-of-order streaming', () => {
    it('two adjacent boundaries that both throw each swap in their own fallback', async () => {
      const { document } = await streamAndResume(
        <main>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-a">A</p>
            ))}
          >
            <ThrowerA />
          </ErrorBoundary>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-b">B</p>
            ))}
          >
            <ThrowerB />
          </ErrorBoundary>
        </main>
      );
      expect(document.querySelector('#fb-a')).toBeTruthy();
      expect(document.querySelector('#fb-b')).toBeTruthy();
    });

    it('two boundaries inside one Suspense each show their own fallback', async () => {
      const { document } = await streamAndResume(
        <main>
          <Suspense fallback={<span id="skel">loading</span>}>
            <ErrorBoundary
              fallback$={$(() => (
                <p id="fb-a">A</p>
              ))}
            >
              <ThrowerA />
            </ErrorBoundary>
            <ErrorBoundary
              fallback$={$(() => (
                <p id="fb-b">B</p>
              ))}
            >
              <ThrowerB />
            </ErrorBoundary>
          </Suspense>
        </main>
      );
      expect(document.querySelector('#fb-a')).toBeTruthy();
      expect(document.querySelector('#fb-b')).toBeTruthy();
    });

    // "two Suspense in one boundary both async-throw -> single fallback" lives in the concurrent
    // teardown-exactly-once regression test below.
  });
});

// Routing through Suspense: the CLOSEST enclosing boundary catches, and any boundary that encloses the
// catching one stays untouched. (Settled routing table, §5 of the design.)
describe('ErrorBoundary routing through Suspense (experimental)', () => {
  it('B4 EB-outer › Suspense › EB-inner › throw → EB-inner catches, EB-outer untouched', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer-ok</div>
          <Suspense fallback={<span id="skel">loading</span>}>
            <ErrorBoundary
              fallback$={$((e: any) => (
                <p id="fb-inner">caught: {e.message}</p>
              ))}
            >
              <Thrower />
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    // The inner boundary (inside the Suspense segment) catches.
    expect(document.querySelector('#fb-inner')?.textContent).toContain('caught: boom');
    // The outer boundary never errored: no outer fallback, its content stays visible.
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
  });

  it('B6 EB-outer › Suspense-A › EB-mid › Suspense-B › throw → EB-mid catches, EB-outer untouched', async () => {
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer-ok</div>
          <Suspense fallback={<span id="skel-a">a</span>}>
            <ErrorBoundary
              fallback$={$((e: any) => (
                <p id="fb-mid">caught: {e.message}</p>
              ))}
            >
              <div id="mid-ok">mid-ok</div>
              <Suspense fallback={<span id="skel-b">b</span>}>
                <Thrower />
              </Suspense>
            </ErrorBoundary>
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    // The middle boundary (closest to the throw) catches; the outer boundary stays untouched.
    expect(document.querySelector('#fb-mid')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#outer-ok')?.textContent).toBe('outer-ok');
  });
});

describe('ErrorBoundary concurrent fallback teardown (experimental)', () => {
  it('two sibling <Suspense> that both reject tear the boundary down exactly once', async () => {
    // Both deferred children reject into the shared `$emitFallback$`; the second must no-op, not crash
    // on the now-detached `$fallback$`.
    const { document } = await streamAndResume(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="sibling">sibling</div>
          <Suspense fallback={<span id="skel-a">loading a</span>}>
            <AsyncThrower />
          </Suspense>
          <Suspense fallback={<span id="skel-b">loading b</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>
    );

    // The whole boundary tore down to its fallback — exactly one fallback host, no duplicate swap.
    const fallbacks = document.querySelectorAll('#fb');
    expect(fallbacks.length).toBe(1);
    expect(fallbacks[0]?.textContent).toContain('caught: async boom');
    // The fallback host is revealed and the content host (with the siblings) is hidden.
    expect(displayOf(document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(document.querySelector('#sibling')?.closest('div[style]'))).toBe('none');
  });
});

// SSR error in one phase meeting a client re-render in the next. `store.error` is the bridge; the
// SSR two-host structure must reconcile cleanly when the boundary re-renders on the client.
describe('ErrorBoundary SSR→CSR cross-phase (experimental)', () => {
  it('D2 SSR inner error, then a client throw to the OUTER boundary replaces the whole subtree', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb-outer">outer: {e.message}</p>
          ))}
        >
          <button id="outer-btn">x</button>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb-inner">inner: {e.message}</p>
            ))}
          >
            <Thrower />
          </ErrorBoundary>
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    // SSR: the inner boundary caught; its fallback shows, the outer subtree is intact.
    expect(el.querySelector('#fb-inner')?.textContent).toContain('inner: boom');
    expect(el.querySelector('#fb-outer')).toBeFalsy();
    expect(el.querySelector('#outer-btn')).toBeTruthy();

    // Client: a throw attributed to an element in the OUTER subtree (outside the inner boundary) →
    // routes to the outer boundary (distinct store), which re-renders to its own fallback.
    const target = el.querySelector('#outer-btn')!;
    dispatchQError(target, { error: new Error('outer boom'), element: target });
    await waitForDrain(container);

    // The outer fallback replaced the whole subtree, including the inner boundary's fallback.
    expect(el.querySelector('#fb-outer')?.textContent).toContain('outer: outer boom');
    expect(el.querySelector('#fb-inner')).toBeFalsy();
    expect(el.querySelector('#outer-btn')).toBeFalsy();
  });

  it('D3(in-order) an in-order two-host collapses cleanly when a client-first error re-renders the boundary (no Missing child)', async () => {
    // The in-order analog of the OOOS post-resume collapse test above: the SSR `q:ebc`/`q:ebf`
    // two-host must reconcile down to the single client fallback Fragment without a "Missing
    // child"/key mismatch. (Strict D3 — an *already SSR-errored* boundary collapsing on a later
    // BENIGN re-render — isn't reachable in Phase 1: a pre-errored boundary has no re-render trigger
    // and a 2nd error escalates past it; that benign-collapse path arrives with `reset()` in Phase 2.)
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <button id="content-btn">x</button>
          <div id="content">content ok</div>
        </ErrorBoundary>
      </main>,
      { streaming: { outOfOrder: false }, debug }
    );
    const el = container.element;
    // SSR in-order happy path: content visible in the content-host, no fallback yet.
    expect(el.querySelector('#content')?.textContent).toBe('content ok');
    expect(el.querySelector('#fb')).toBeFalsy();
    expect((el.querySelector('[q\\:ebc]') as HTMLElement).style.display).toBe('contents');

    // A client-time error re-renders the boundary to its keyless fallback Fragment.
    const target = el.querySelector('#content-btn')!;
    dispatchQError(target, { error: new Error('client boom'), element: target });
    await waitForDrain(container);

    // The in-order two-host (q:ebc/q:ebf) collapsed to a single clean fallback — no leftover hosts.
    expect(el.querySelectorAll('#fb').length).toBe(1);
    expect(el.querySelector('#fb')?.textContent).toContain('caught: client boom');
    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('[q\\:ebc]')).toBeFalsy();
    expect(el.querySelector('[q\\:ebf]')).toBeFalsy();
  });
});

// An SSR-errored boundary leaves its swapped-out content INERT + hidden, not deleted. It is removed for
// FREE whenever the boundary re-renders (e.g. `reset()` in Phase 2): the re-render collapses the SSR
// two-host down to the fallback Fragment and the vnode diff drops the inert content cleanly (no "Missing
// child"). This is why no dedicated content-deletion mechanism is needed. (Drive the re-render directly
// with `rerenderComponent` — an SSR-errored boundary has no self re-render trigger: a 2nd error escalates
// past it.)
describe('ErrorBoundary: a re-render deletes the inert swapped-out content', () => {
  it('in-order: re-rendering an SSR-errored boundary drops the inert content-host, fallback stays', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="content">content</div>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { debug, streaming: { outOfOrder: false } }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    // SSR: the fallback shows; the inert content sits hidden inside the content-host.
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.style.display).toBe('none');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

    // A re-render (what `reset()` does) collapses the two-host to the fallback Fragment.
    await rerenderComponent(contentHost);
    await waitForDrain(container);

    // The inert content-host + content are gone; the fallback remains — cleanly, no desync.
    expect(el.querySelector('[q\\:ebc]')).toBeFalsy();
    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('out-of-order: re-rendering an SSR-errored boundary drops the inert content, fallback stays', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="content">content</div>
          <Thrower />
        </ErrorBoundary>
      </main>,
      { streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true }, debug }
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.contains(el.querySelector('#content'))).toBe(true);

    await rerenderComponent(contentHost);
    await waitForDrain(container);

    expect(el.querySelector('#content')).toBeFalsy();
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
  });
});

describe('ErrorBoundary across multiple containers on one document', () => {
  // Two resumed containers share one document; each `qerror` listener is guarded by
  // `element.contains(source)`, so only the owning container reacts.
  const renderTwoContainers = async (jsxA: any, jsxB: any) => {
    setPlatform(getTestPlatform());
    const document = createDocument();
    const hostA = document.createElement('div');
    const hostB = document.createElement('div');
    document.body.appendChild(hostA);
    document.body.appendChild(hostB);
    await render(hostA, jsxA);
    await render(hostB, jsxB);
    const containerA = _getDomContainer(hostA);
    const containerB = _getDomContainer(hostB);
    return { document, hostA, hostB, containerA, containerB };
  };

  it('routes a qerror from container A only to A, leaving B untouched', async () => {
    const { hostA, hostB, containerA } = await renderTwoContainers(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-a">caught A: {e.message}</p>
        ))}
      >
        <button id="target-a">a</button>
      </ErrorBoundary>,
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-b">caught B: {e.message}</p>
        ))}
      >
        <button id="target-b">b</button>
      </ErrorBoundary>
    );

    // Sanity: both containers streamed their content, neither shows a fallback yet.
    expect(hostA.querySelector('#fb-a')).toBeFalsy();
    expect(hostB.querySelector('#fb-b')).toBeFalsy();
    expect(hostA.querySelector('#target-a')).toBeTruthy();
    expect(hostB.querySelector('#target-b')).toBeTruthy();

    // A qerror originating INSIDE container A. Both listeners fire, but only A's guard passes.
    const targetA = hostA.querySelector('#target-a')!;
    dispatchQError(targetA, { error: new Error('boom from A'), element: targetA });
    await waitForDrain(containerA);

    // A's boundary reveals its fallback...
    expect(hostA.querySelector('#fb-a')?.textContent).toContain('caught A: boom from A');
    // ...and B is completely untouched: no fallback, original content intact.
    expect(hostB.querySelector('#fb-b')).toBeFalsy();
    expect(hostB.querySelector('#target-b')).toBeTruthy();
  });

  it('routes a qerror from container B only to B, leaving A untouched', async () => {
    const { hostA, hostB, containerB } = await renderTwoContainers(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-a">caught A: {e.message}</p>
        ))}
      >
        <button id="target-a">a</button>
      </ErrorBoundary>,
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb-b">caught B: {e.message}</p>
        ))}
      >
        <button id="target-b">b</button>
      </ErrorBoundary>
    );

    const targetB = hostB.querySelector('#target-b')!;
    dispatchQError(targetB, { error: new Error('boom from B'), element: targetB });
    await waitForDrain(containerB);

    expect(hostB.querySelector('#fb-b')?.textContent).toContain('caught B: boom from B');
    expect(hostA.querySelector('#fb-a')).toBeFalsy();
    expect(hostA.querySelector('#target-a')).toBeTruthy();
  });
});

// With no boundary above, an SSR throw must still propagate and reject the render, not be swallowed.
describe('ErrorBoundary safety net: in-order SSR throw with no boundary above', () => {
  // A rejected promise child (not a component) — exercises the Promise drain path.
  const PromiseChild = component$(() => {
    const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
    return <>{pending}</>;
  });

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

// A throw inside Slot-PROJECTED content must resolve to the lexically-nearest <ErrorBoundary> via the
// projection chain. The boundary the content is projected *into* is the nearest provider.
describe('ErrorBoundary projection', () => {
  // Wrapper whose children are PROJECTED into an <ErrorBoundary> via the <Slot/> inside it.
  const Boxed = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <Slot />
      </ErrorBoundary>
    );
  });

  // Like `Boxed`, but with a non-throwing sibling beside the projected slot, so we can assert the
  // whole boundary subtree (sibling + projected content) is torn down to the fallback.
  const BoxedWithSibling = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {e.message}</p>
        ))}
      >
        <div id="sibling">sibling</div>
        <Slot />
      </ErrorBoundary>
    );
  });

  describe('CSR', () => {
    it('a render throw in projected content is caught by the boundary it is projected into', async () => {
      const { container } = await domRender(
        <Boxed>
          <Thrower />
        </Boxed>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('only the fallback shows: a non-throwing sibling and the projected throw are both gone', async () => {
      const { container } = await domRender(
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      // The boundary tore down its whole subtree to the fallback.
      expect(el.querySelector('#sibling')).toBeFalsy();
      expect(el.querySelector('#projected-ok')).toBeFalsy();
    });
  });

  describe('in-order SSR', () => {
    it('a render throw in projected content is caught by the boundary it is projected into', async () => {
      const { container } = await ssrRenderToDom(
        <Boxed>
          <Thrower />
        </Boxed>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    });

    it('swaps the partial content out (hidden) and shows the fallback instead', async () => {
      // EB contract is "fallback INSTEAD OF content": even in-order SSR (no out-of-order streaming)
      // swaps out everything the boundary streamed before the throw — the content-host is hidden and
      // the sibling fallback-host is revealed, rather than leaving the partial content visible.
      const { container } = await ssrRenderToDom(
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>,
        { debug, streaming: { outOfOrder: false } }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      // The sibling is still in the DOM but inside the hidden content-host (swapped out, not visible).
      const sibling = el.querySelector('#sibling');
      expect(sibling).toBeTruthy();
      const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
      expect(contentHost.style.display).toBe('none');
      expect(contentHost.contains(sibling)).toBe(true);
    });
  });
});

// The in-order swap fires when out-of-order streaming is OFF (e.g. a page without Suspense). The
// boundary still never buffers: content streams live into a `content-host`, and on a throw the
// sibling `fallback-host` renders the fallback in document order + a `qErr(id)` inline script swaps.
describe('ErrorBoundary in-order swap (no out-of-order streaming)', () => {
  const inOrder = { debug, streaming: { outOfOrder: false } } as const;

  it('A1 happy path: content streams; no fallback content and no qErr swap script', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <div id="content">all good</div>
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    expect(el.querySelector('#content')?.textContent).toBe('all good');
    expect(el.querySelector('#fb')).toBeFalsy();
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.style.display).toBe('contents');
    expect(el.outerHTML).not.toContain('qErr(');
  });

  it('A2 sync throw: content-host hidden, fallback in the sibling host, qErr swap emitted', async () => {
    const { container } = await ssrRenderToDom(
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
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    const fallbackHost = el.querySelector('[q\\:ebf]') as HTMLElement;
    expect(contentHost.style.display).toBe('none');
    expect(fallbackHost.style.display).toBe('contents');
    expect(fallbackHost.querySelector('#fb')?.textContent).toContain('caught: boom');
    // partial content sits (closed, well-formed) inside the hidden content-host, NOT in the fallback
    expect(contentHost.querySelector('#before')).toBeTruthy();
    expect(contentHost.contains(fallbackHost)).toBe(false);
    expect(el.outerHTML).toContain('qErr(');
  });

  it('A3 siblings OUTSIDE the boundary that streamed before the throw remain visible', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <div id="outside-before">outside-before</div>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
        <div id="outside-after">outside-after</div>
      </main>,
      inOrder
    );
    const el = container.element;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    // Siblings outside the boundary are untouched and NOT inside the hidden content-host.
    const outsideBefore = el.querySelector('#outside-before');
    const outsideAfter = el.querySelector('#outside-after');
    expect(outsideBefore?.textContent).toBe('outside-before');
    expect(outsideAfter?.textContent).toBe('outside-after');
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(contentHost.contains(outsideBefore)).toBe(false);
    expect(contentHost.contains(outsideAfter)).toBe(false);
  });

  it('A4 awaited-async throw: fallback delivered in document order (sibling host)', async () => {
    // "In-order" is timing, not position: an awaited-async throw still marks `store.error` before the
    // sibling fallback-host renders, so the fallback lands in the sibling host (not at the throw site).
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <div id="before">before</div>
          <AsyncThrower />
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    const fallbackHost = el.querySelector('[q\\:ebf]') as HTMLElement;
    const fb = el.querySelector('#fb');
    expect(fb?.textContent).toContain('caught: async boom');
    expect(contentHost.style.display).toBe('none');
    expect(fallbackHost.style.display).toBe('contents');
    // The fallback is in the sibling fallback-host, never nested at the throw site inside the content.
    // (qwik-dom's element.querySelector is NOT subtree-scoped, so assert placement via `contains`.)
    expect(fallbackHost.contains(fb)).toBe(true);
    expect(contentHost.contains(fb)).toBe(false);
    expect(el.outerHTML).toContain('qErr(');
  });

  it('A6 a throw deep inside nested tags yields well-formed HTML (hideable content-host)', async () => {
    const { container } = await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <div id="lvl1">
            <section id="lvl2">
              <article id="lvl3">
                <Thrower />
              </article>
            </section>
          </div>
        </ErrorBoundary>
      </main>,
      inOrder
    );
    const el = container.element;
    const contentHost = el.querySelector('[q\\:ebc]') as HTMLElement;
    expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(contentHost.style.display).toBe('none');
    // The still-open tags were closed well-formed: the partial nesting stays intact (lvl3 inside lvl2
    // inside lvl1) under the hidden content-host, rather than flattened or broken.
    expect(contentHost.querySelector('#lvl1 #lvl2 #lvl3')).toBeTruthy();
  });

  it('A5 the qErr executor installs independently of OOOS (no qO on the page)', async () => {
    const chunks: string[] = [];
    await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <Thrower />
        </ErrorBoundary>
      </main>,
      {
        debug,
        stream: { write: (c: string) => void chunks.push(c) },
        streaming: { outOfOrder: false },
      }
    );
    const html = chunks.join('');
    expect(html).toContain('qErr(');
    expect(html).toContain('qInstallErrorSwap');
    // No out-of-order Suspense executor is installed for a plain in-order error swap.
    expect(html).not.toMatch(/qInstallOOOS|qO\(/);
  });
});

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

describe('ErrorBoundary: recoverable vs build errors (dev)', () => {
  // A NON-recoverable build/plugin error: Vite/Rollup stamp `.plugin` on transform/build errors, so
  // `isRecoverable` returns false and a boundary must NOT hide them — the real build failure surfaces.
  const PluginThrower = component$(() => {
    const err = new Error('build boom');
    (err as any).plugin = 'vite:some-plugin';
    throw err;
  });

  const boxed = (child: JSXOutput) => (
    <ErrorBoundary
      fallback$={$((e: any) => (
        <p id="fb">caught: {e.message}</p>
      ))}
    >
      {child}
    </ErrorBoundary>
  );

  it('SSR: a recoverable error renders the fallback', async () => {
    const { container } = await ssrRenderToDom(boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('SSR: a non-recoverable build error is NOT hidden in the fallback (it surfaces)', async () => {
    await expect(ssrRenderToDom(boxed(<PluginThrower />), { debug })).rejects.toThrow('build boom');
  });

  it('CSR: a recoverable error renders the fallback', async () => {
    const { container } = await domRender(boxed(<Thrower />), { debug });
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: boom');
  });

  it('CSR: a non-recoverable build error is not caught by the boundary', async () => {
    // Routed via a client `qerror`. `handleError` rethrows non-recoverable errors past the boundary
    // (the listener then logs), so the fallback must NOT show.
    const { container } = await domRender(boxed(<button id="content">x</button>), { debug });
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

describe('ErrorBoundary SSR async-generator + non-serializable throws (experimental)', () => {
  // An async-generator child that streams one chunk, then throws mid-stream. Before the fix this
  // throw escaped the async-generator StackFn and aborted SSR instead of routing to the boundary.
  const AsyncGenThrower = component$(() => {
    return (
      <>
        {(async function* () {
          yield <div id="chunk">chunk</div>;
          throw new Error('async gen boom');
        })()}
      </>
    ) as unknown as JSXOutput;
  });

  const NonSerializableThrower = component$((): JSXOutput => {
    throw new NonSerializableError();
  });

  const NormalErrorThrower = component$((): JSXOutput => {
    throw new Error('normal boom');
  });

  it('S2: routes an async-generator child throw to the enclosing boundary fallback', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <AsyncGenThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: async gen boom');
  });

  it('S4: a non-serializable throw renders the fallback AND the page still serializes', async () => {
    // The key assertion is that ssrRenderToDom RESOLVES (the page serialized) rather than rejecting
    // with a verifySerializable error.
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NonSerializableThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain(
      'caught: non-serializable boom'
    );
  });

  it('S4: a normal Error throw is unchanged (still renders its fallback)', async () => {
    const { container } = await ssrRenderToDom(
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e?.message ?? e)}</p>
        ))}
      >
        <NormalErrorThrower />
      </ErrorBoundary>,
      { debug }
    );
    expect(container.element.querySelector('#fb')?.textContent).toContain('caught: normal boom');
  });
});

// A throw inside useTask$ / useVisibleTask$ should route to the nearest <ErrorBoundary>, like a
// render throw.
describe('ErrorBoundary catches task throws', () => {
  describe('CSR (domRender)', () => {
    it('a useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      // The boundary re-rendered to its fallback; the throwing subtree is gone.
      expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('an async useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(async () => {
          await delay(1);
          throw new Error('async task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: async task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('a useVisibleTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingVisibleTask = component$(() => {
        const state = useSignal('init');
        useVisibleTask$(() => {
          throw new Error('visible task boom');
        });
        return <span id="content">{state.value}</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingVisibleTask />
        </ErrorBoundary>,
        { debug }
      );
      // In CSR visible tasks run after resume; drain any re-render the throw scheduled.
      await waitForDrain(container);

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: visible task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });

    it('a useTask$ throw is caught by the NEAREST of nested boundaries', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await domRender(
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb-outer">outer</p>
          ))}
        >
          <div id="outer-ok">outer ok</div>
          <ErrorBoundary
            fallback$={$(() => (
              <p id="fb-inner">inner</p>
            ))}
          >
            <ThrowingTask />
          </ErrorBoundary>
        </ErrorBoundary>,
        { debug }
      );
      await waitForDrain(container);

      const el = container.element;
      // Only the inner boundary catches; the outer subtree stays visible.
      expect(el.querySelector('#fb-inner')).toBeTruthy();
      expect(el.querySelector('#fb-outer')).toBeFalsy();
      expect(el.querySelector('#outer-ok')).toBeTruthy();
    });
  });

  describe('in-order SSR (ssrRenderToDom)', () => {
    // An eager useTask$ throw during SSR is caught by the enclosing boundary and swaps in the fallback
    // (content-host hidden), mirroring the synchronous render-throw path.
    it('a useTask$ throw is caught by the nearest <ErrorBoundary>', async () => {
      const ThrowingTask = component$(() => {
        useTask$(() => {
          throw new Error('task boom');
        });
        return <span id="content">ok</span>;
      });

      const { container } = await ssrRenderToDom(
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {e.message}</p>
          ))}
        >
          <ThrowingTask />
        </ErrorBoundary>,
        { debug }
      );

      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: task boom');
      expect(el.querySelector('#content')).toBeFalsy();
    });
  });
});

// ANY thrown value (including falsy `0`, `''`, `false`, `null`) tears the boundary down to its
// fallback: the boundary uses `store.error !== undefined` (not truthiness) as the "has error" signal.
describe('ErrorBoundary: falsy thrown values', () => {
  const Boundary = component$(() => {
    return (
      <ErrorBoundary
        fallback$={$((e: any) => (
          <p id="fb">caught: {String(e)}</p>
        ))}
      >
        <button id="content">x</button>
      </ErrorBoundary>
    );
  });

  const expectFallbackShown = async (error: unknown) => {
    const { container } = await domRender(<Boundary />, { debug });
    const el = container.element;
    expect(el.querySelector('#content')).toBeTruthy();

    dispatchQError(el.querySelector('#content')!, {
      error,
      element: el.querySelector('#content')!,
    });
    await waitForDrain(container);

    // The fallback must be revealed and the content torn down — same as for a truthy error.
    expect(el.querySelector('#fb')).toBeTruthy();
    expect(el.querySelector('#content')).toBeFalsy();
  };

  it('shows the fallback when 0 is thrown', async () => {
    await expectFallbackShown(0);
  });

  it('shows the fallback when null is thrown', async () => {
    await expectFallbackShown(null);
  });

  it('shows the fallback when an empty string is thrown', async () => {
    await expectFallbackShown('');
  });

  it('shows the fallback when false is thrown', async () => {
    await expectFallbackShown(false);
  });

  it('out-of-order streaming: a thrown falsy value reveals the fallback host', async () => {
    const FalsyThrower = component$((): JSXOutput => {
      // eslint-disable-next-line no-throw-literal
      throw 0;
    });
    const chunks: string[] = [];
    await ssrRenderToDom(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e)}</p>
          ))}
        >
          <FalsyThrower />
        </ErrorBoundary>
      </main>,
      {
        stream: {
          write: (c: string) => {
            chunks.push(c);
          },
        },
        streaming: { inOrder: { strategy: 'disabled' }, outOfOrder: true },
        debug,
      }
    );
    const document = createDocument({ html: chunks.join('') });
    (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (s) => s.textContent || ''
    ).filter((code) => code.includes('qO') || code.includes('qInstallOOOS'));
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);

    expect(document.querySelector('#fb')?.textContent).toContain('caught: 0');
    const fallbackHost = document.querySelector('#fb')?.closest('[q\\:rp]') as HTMLElement | null;
    expect(fallbackHost?.style?.display).toBe('contents');
  });
});
