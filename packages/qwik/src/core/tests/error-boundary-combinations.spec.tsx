import { $, component$, ErrorBoundary, Suspense, type JSXOutput } from '@qwik.dev/core';
import { createDocument, domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { processOutOfOrderSegmentVNodeData } from '../client/process-vnode-data';

// Combinatorial coverage for multiple throws / multiple boundaries across the three modes
// (CSR, in-order SSR, and out-of-order streaming). These pin down the "who catches what" semantics
// when more than one error or boundary is in play.

const debug = false;

const ThrowerA = component$(() => {
  throw new Error('boomA');
});
const ThrowerB = component$(() => {
  throw new Error('boomB');
});

// Rejects after the Suspense placeholder has streamed, so the throw surfaces as a deferred segment
// rejection rather than a synchronous render throw.
const AsyncThrower = component$(() => {
  const pending = new Promise<JSXOutput>((_resolve, reject) => reject(new Error('async boom')));
  return <>{pending}</>;
});

// Stream with out-of-order streaming, then run the emitted `qO` scripts to perform the inline swap.
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
  const document = createDocument({ html: chunks.join('') });
  (document as any).qProcessOOOS = (boundaryId: number, content: Element | null) =>
    processOutOfOrderSegmentVNodeData(document, String(boundaryId), content);
  const scripts = Array.from(
    document.querySelectorAll('script[type="text/javascript"]'),
    (s) => s.textContent || ''
  ).filter((code) => code.includes('qO') || code.includes('qInstallOOOS'));
  // eslint-disable-next-line no-new-func
  new Function('document', scripts.join('\n'))(document);
  return document;
};

const fbCount = (root: any) => root.querySelectorAll('#fb').length;

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
      const document = await streamAndResume(
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
      const document = await streamAndResume(
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

    it('two Suspense in one boundary that both async-throw render a single fallback', async () => {
      const document = await streamAndResume(
        <main>
          <ErrorBoundary
            fallback$={$((e: any) => (
              <p id="fb">caught: {String(e?.message ?? e)}</p>
            ))}
          >
            <Suspense fallback={<span id="sa">a</span>}>
              <AsyncThrower />
            </Suspense>
            <Suspense fallback={<span id="sb">b</span>}>
              <AsyncThrower />
            </Suspense>
          </ErrorBoundary>
        </main>
      );
      expect(fbCount(document)).toBe(1);
    });
  });
});
