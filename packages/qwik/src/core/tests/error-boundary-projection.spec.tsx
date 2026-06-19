import { $, component$, ErrorBoundary, Slot } from '@qwik.dev/core';
import { domRender, ssrRenderToDom } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';

// A throw inside Slot-PROJECTED content must resolve to the lexically-nearest <ErrorBoundary> via the
// projection chain (client: getParentHost walking `slotParent`; SSR: resolveContext walking
// `parentComponent`). When children are projected into a boundary's <Slot/>, the boundary the content
// is projected *into* is the nearest provider and must catch a render throw from that content.

const debug = false;

const Thrower = component$(() => {
  throw new Error('boom');
});

// Wrapper whose children are PROJECTED into an <ErrorBoundary>. The boundary lives inside `Boxed`, so
// anything passed as `Boxed`'s children renders through the <Slot/> *inside* that boundary.
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

// Like `Boxed`, but also renders a non-throwing sibling beside the projected slot, so we can assert
// the whole boundary subtree (sibling + projected content) is torn down to the fallback.
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

describe('ErrorBoundary projection', () => {
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
      // The boundary tore down its whole subtree to the fallback: neither the sibling nor the
      // (non-throwing) projected child is visible.
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

    it('renders the fallback in place; siblings already streamed before the throw remain', async () => {
      // In-order (non-streaming) SSR renders the fallback IN PLACE of the throwing child (see the
      // "renders the fallback in place" test in error-boundary.spec.tsx). Content emitted before the
      // throw is already in the stream and cannot be retracted, so a sibling rendered before the
      // <Slot/> stays — unlike CSR (and the experimental out-of-order path), which replace the whole
      // boundary subtree with the fallback.
      const { container } = await ssrRenderToDom(
        <BoxedWithSibling>
          <Thrower />
          <div id="projected-ok">projected ok</div>
        </BoxedWithSibling>,
        { debug }
      );
      const el = container.element;
      expect(el.querySelector('#fb')?.textContent).toContain('caught: boom');
      // The sibling streamed before the throw is retained (in-place fallback).
      expect(el.querySelector('#sibling')).toBeTruthy();
    });
  });
});
