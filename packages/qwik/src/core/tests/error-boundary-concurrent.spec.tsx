import { $, component$, ErrorBoundary, Suspense, type JSXOutput } from '@qwik.dev/core';
import { createDocument, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';

const debug = false;

// Throws *asynchronously*: a rejected promise child resolves after the Suspense placeholder has
// already streamed, so the throw surfaces as the deferred segment's rejection (not a render throw).
const AsyncThrower = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

describe('ErrorBoundary concurrent fallback teardown (experimental)', () => {
  // Render with out-of-order streaming, then run the emitted `qO` scripts to perform the inline swap.
  // Returns the streamed HTML (to assert the boundary didn't block) and the resumed document.
  // Replicated from error-boundary.spec.tsx so this regression spec stands alone.
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

  it('two sibling <Suspense> that both reject tear the boundary down exactly once', async () => {
    // Both <Suspense> wrap an async thrower, so both deferred segments reject and both invoke the
    // boundary's shared `$emitFallback$`. Before the idempotency guard, the second invocation read the
    // detached `store.$fallback$` as undefined and threw a TypeError ("undefined is not a function"),
    // which rejected its out-of-order segment and surfaced as an unhandled render rejection here.
    const result = await streamAndResume(
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
    const fallbacks = result.document.querySelectorAll('#fb');
    expect(fallbacks.length).toBe(1);
    expect(fallbacks[0]?.textContent).toContain('caught: async boom');
    // The fallback host is revealed and the content host (with the siblings) is hidden.
    expect(displayOf(result.document.querySelector('#fb')?.closest('[q\\:rp]'))).toBe('contents');
    expect(displayOf(result.document.querySelector('#sibling')?.closest('div[style]'))).toBe(
      'none'
    );
  });
});
