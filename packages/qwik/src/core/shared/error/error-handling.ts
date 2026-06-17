import { createContextId } from '../../use/use-context';

/** @public */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /**
   * The boundary's fallback renderer. Set by `<ErrorBoundary>` so SSR can render the fallback in
   * place of a subtree that throws during server render (on the client the boundary re-renders
   * instead). Internal — not meant to be set by application code.
   */
  $fallback$?: (error: any) => unknown;
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
