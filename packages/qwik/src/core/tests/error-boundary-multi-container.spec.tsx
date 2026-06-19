import { $, ErrorBoundary, render, setPlatform } from '@qwik.dev/core';
import { _getDomContainer } from '@qwik.dev/core/internal';
import { createDocument, getTestPlatform, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

// Two independent resumed Qwik containers can coexist on one page. Each registers a document-level
// `qerror` listener (DomContainer.$qErrorHandler$ in client/dom-container.ts). A qerror originating
// inside container A must be handled ONLY by A's ErrorBoundary, never B's — the listener guards with
// `this.element.contains(source)`, so even though both listeners fire on the shared document, only
// the owning container acts.

// domRender() creates a fresh document per call, so two domRender calls would NOT share a document.
// We replicate its internals: one createDocument(), two sibling container divs in document.body, and
// render() into each. render() turns each div into its own DomContainer, and each container's
// constructor adds a `qerror` listener to the SAME ownerDocument.
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

/** Dispatch a `qerror` CustomEvent the same way qwikloader does (see error-boundary.spec.tsx). */
const dispatchQError = (
  target: Element,
  detail: { error: unknown; element?: Element; importError?: string }
) => {
  const ev = target.ownerDocument.createEvent('Event');
  ev.initEvent('qerror', false, false);
  (ev as any).detail = detail;
  target.ownerDocument.dispatchEvent(ev);
};

describe('ErrorBoundary across multiple containers on one document', () => {
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

    // A qerror originating INSIDE container A. Both containers' document listeners fire, but only A's
    // `this.element.contains(source)` guard passes.
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
