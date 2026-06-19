import { $, component$, ErrorBoundary, useSignal, useTask$, useVisibleTask$ } from '@qwik.dev/core';
import { domRender, ssrRenderToDom, waitForDrain } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { delay } from '../shared/utils/promises';

// A throw inside useTask$ / useVisibleTask$ should route to the NEAREST enclosing <ErrorBoundary>,
// exactly like a synchronous render throw does. The existing use-task / use-visible-task specs only
// prove a task throw reaches the generic ERROR_CONTEXT test helper (ErrorProvider), which inits
// `error: null` and is capture-only: it never re-renders to a fallback. These tests assert the
// user-facing behavior against a real <ErrorBoundary fallback$={...}>: the fallback must show.
//
// Routing basis: the shared `runTask` sends both the CSR and SSR task-throw paths through
// `container.handleError(reason, host)` (use-task.ts). The DOM container's `handleError` resolves
// ERROR_CONTEXT to the boundary store (which inits `error: undefined`), records the error, and
// re-renders the boundary host to its fallback. The SSR container's `handleError`, by contrast,
// re-throws unconditionally and ignores the host — so the SSR case below documents the intuitively
// correct expectation that an enclosing boundary catches an eager `useTask$` throw during SSR.

const debug = false;

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
    // Intuitive-correct expectation: an eager useTask$ throw during SSR is caught by the enclosing
    // boundary and the fallback is rendered in place — mirroring the synchronous render-throw path
    // (see error-boundary.spec.tsx 'SSR: renders the fallback in place when a child throws').
    // Today this FAILS: the SSR container's handleError (server/ssr-container.ts) re-throws and
    // ignores the host, so ssrRenderToDom rejects with the task error instead of catching it.
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
