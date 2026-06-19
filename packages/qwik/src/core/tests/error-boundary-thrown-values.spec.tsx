import { $, component$, ErrorBoundary, type JSXOutput } from '@qwik.dev/core';
import { createDocument, domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';

const debug = false;

// Dispatch a synthetic client `qerror` carrying an arbitrary (here: falsy) thrown value, mirroring an
// async QRL/handler failure routed to the closest boundary.
const dispatchQError = (target: Element, error: unknown) => {
  const ev = target.ownerDocument.createEvent('Event');
  ev.initEvent('qerror', false, false);
  (ev as any).detail = { error, element: target };
  target.ownerDocument.dispatchEvent(ev);
};

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

// A thrown value should show the fallback regardless of its truthiness: ANY thrown value (including
// the falsy `0`, `''`, `false`, `null`) tears the boundary down to its fallback. The boundary uses
// `store.error !== undefined` (not truthiness) as the "has error" signal precisely for this.
describe('ErrorBoundary: falsy thrown values', () => {
  const expectFallbackShown = async (error: unknown) => {
    const { container } = await domRender(<Boundary />, { debug });
    const el = container.element;
    expect(el.querySelector('#content')).toBeTruthy();

    dispatchQError(el.querySelector('#content')!, error);
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
