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
   * Server-only marker (a `noSerialize` object): set when the boundary defers its subtree into an
   * out-of-order segment (experimental `errorBoundary` feature). Tells the in-place SSR catch to
   * let the throw propagate so the segment swap can render the fallback cleanly.
   */
  $deferred$?: object;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

const DEFERRED_ERROR = /*#__PURE__*/ Symbol('qDeferredBoundaryError');

/**
 * Wraps a throw from an out-of-order-deferred boundary's subtree, carrying the resolved boundary
 * store so the segment swap can render its fallback without re-resolving the context.
 */
export interface DeferredBoundaryError {
  [DEFERRED_ERROR]: true;
  store: ErrorBoundaryStore;
  error: unknown;
}

export const deferredBoundaryError = (
  store: ErrorBoundaryStore,
  error: unknown
): DeferredBoundaryError => ({ [DEFERRED_ERROR]: true, store, error });

export const isDeferredBoundaryError = (value: unknown): value is DeferredBoundaryError =>
  !!value && typeof value === 'object' && (value as DeferredBoundaryError)[DEFERRED_ERROR] === true;

export const isRecoverable = (err: any) => {
  if (err && err instanceof Error) {
    if ('plugin' in err) {
      return false;
    }
  }
  return true;
};
