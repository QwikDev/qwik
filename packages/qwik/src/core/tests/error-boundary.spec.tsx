import { $, component$, ErrorBoundary, type JSXOutput } from '@qwik.dev/core';
import { createDocument, domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';

const debug = false;

const Thrower = component$(() => {
  throw new Error('boom');
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

describe('ErrorBoundary out-of-order streaming (experimental)', () => {
  // Render with OOOS streaming, then run the emitted scripts to simulate the client injecting each
  // resolved segment into its placeholder (mirrors the Suspense OOOS specs).
  const renderOOOS = async (jsx: JSXOutput) => {
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

  it('swaps in the fallback with no leftover siblings when a descendant throws', async () => {
    const document = await renderOOOS(
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
    // Unlike the in-place SSR path, the streamed `before`/`after` siblings are gone — the boundary
    // rendered as a clean `boundary > fallback`, matching the client.
    expect(document.querySelector('#fb')?.textContent).toContain('caught: boom');
    expect(document.querySelector('#before')).toBeFalsy();
    expect(document.querySelector('#after')).toBeFalsy();
  });

  it('streams the content (no fallback) when nothing throws', async () => {
    const document = await renderOOOS(
      <main>
        <ErrorBoundary
          fallback$={$(() => (
            <p id="fb">fallback</p>
          ))}
        >
          <div id="content">all good</div>
        </ErrorBoundary>
      </main>
    );
    expect(document.querySelector('#content')?.textContent).toBe('all good');
    expect(document.querySelector('#fb')).toBeFalsy();
  });
});
