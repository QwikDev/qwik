import type { SSRBufferCheckpoint } from '../../ssr/ssr-types';
import { createContextId } from '../../use/use-context';

/** @internal */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /**
   * The boundary's fallback renderer. Set by `<ErrorBoundary>` so SSR can render the fallback in
   * place of a subtree that throws during server render (on the client the boundary re-renders
   * instead). Internal — not meant to be set by application code.
   */
  $fallback$?: (error: any) => unknown;
  /**
   * Server-only. When the boundary buffers its subtree (experimental `errorBoundary` feature) —
   * only inside a `<Suspense>` segment, which is already buffered — this holds the render
   * checkpoint taken at the start of its content. Its presence tells the in-place SSR catch to let
   * the throw propagate to the boundary's nested render, which rolls back to this checkpoint and
   * renders the fallback.
   */
  $checkpoint$?: SSRBufferCheckpoint;
  /**
   * Server-only, streaming `<ErrorBoundary>`. Set by the boundary's SSR fallback host: streams the
   * boundary's `fallback$(error)` as an out-of-order segment and injects it (via the shared `qO`
   * executor) into the fallback host, hiding the content host. Called either synchronously — when a
   * descendant threw during the content render — or later, when a deferred child `<Suspense>`
   * throws.
   */
  $emitFallback$?: (error: unknown) => void | Promise<void>;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

export const isRecoverable = (err: any) => {
  if (err && err instanceof Error) {
    if ('plugin' in err) {
      return false;
    }
  }
  return true;
};
