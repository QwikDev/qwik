import type { SSRBufferCheckpoint } from '../../ssr/ssr-types';
import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';

/** @internal */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /** Server-only fallback renderer; the client re-renders with `props.fallback$` instead. Internal. */
  $fallback$?: (error: any) => unknown;
  /**
   * Server-only render checkpoint, present only when a boundary buffers inside a `<Suspense>`
   * segment.
   */
  $checkpoint$?: SSRBufferCheckpoint;
  /**
   * Server-only; streams `fallback$` as an out-of-order segment and swaps it into the fallback
   * host.
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

/**
 * A non-serializable thrown value would fail `verifySerializable` and abort the whole page when the
 * boundary's `store.error` is serialized. Project it to an `Error` so the stored value stays
 * serializable (and resumes truthy via `TypeIds.Error`).
 */
export const toSerializableBoundaryError = (err: unknown): unknown => {
  if (err instanceof Error || canSerialize(err)) {
    return err;
  }
  const rawMessage = (err as { message?: unknown })?.message;
  return new Error(typeof rawMessage === 'string' ? rawMessage : String(err));
};
