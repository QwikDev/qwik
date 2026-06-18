import { $, component$, ErrorBoundary, Suspense, type JSXOutput } from '@qwik.dev/core';
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
});

describe('ErrorBoundary buffer-and-swap (experimental)', () => {
  // Render with streaming, then run the emitted scripts to resume on the client (and inject any
  // out-of-order Suspense segments into their placeholders, mirroring the Suspense OOOS specs).
  const ssrRenderResumed = async (jsx: JSXOutput) => {
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
    const document = createDocument({ html: chunks.join('') });
    (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
      processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
    const scripts = Array.from(
      document.querySelectorAll('script[type="text/javascript"]'),
      (s) => s.textContent || ''
    );
    // eslint-disable-next-line no-new-func
    new Function('document', scripts.join('\n'))(document);
    return document;
  };

  it('discards leftover siblings and swaps in the fallback when a descendant throws', async () => {
    const document = await ssrRenderResumed(
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
      </main>
    );
    // The partially-streamed `before`/`after` siblings are rolled back — the boundary renders as a
    // clean `boundary > fallback`, matching the client (instead of the in-place divergence).
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#before')).toBeFalsy();
    expect(document.querySelector('#after')).toBeFalsy();
  });

  it('renders the content unchanged when nothing throws', async () => {
    const document = await ssrRenderResumed(
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
    expect(document.querySelector('#before')).toBeTruthy();
    expect(document.querySelector('#after')).toBeTruthy();
    expect(document.querySelector('#fb')).toBeFalsy();
  });

  it('works when the boundary is inside a <Suspense> (swaps within the segment)', async () => {
    const document = await ssrRenderResumed(
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

  it('nested boundaries: the inner one catches, the outer subtree is untouched', async () => {
    const document = await ssrRenderResumed(
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
    expect(document.querySelector('#fb-inner')).toBeTruthy();
    expect(document.querySelector('#outer-sibling')).toBeTruthy();
    expect(document.querySelector('#fb-outer')).toBeFalsy();
    expect(document.querySelector('#before')).toBeFalsy();
    expect(document.querySelector('#after')).toBeFalsy();
  });

  it('routes a deferred (async) throw inside a child <Suspense> to the boundary fallback', async () => {
    // The boundary commits once the Suspense placeholder streams, so its own buffer can't catch the
    // later async throw; the rejected segment is instead routed to the boundary's fallback, injected
    // into the Suspense slot — no aborted render.
    const document = await ssrRenderResumed(
      <main>
        <ErrorBoundary
          fallback$={$((e: any) => (
            <p id="fb">caught: {String(e?.message ?? e)}</p>
          ))}
        >
          <Suspense fallback={<span id="loading">loading</span>}>
            <AsyncThrower />
          </Suspense>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#fb')?.textContent).toContain('caught: async boom');
  });
});
