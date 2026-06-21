import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';
import { logError } from '../utils/log';
import type { QRL } from '../qrl/qrl.public';
import type { ISsrNode } from '../../ssr/ssr-types';

/** @internal */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /** Server-only fallback renderer; the client re-renders with `props.fallback$` instead. Internal. */
  $fallback$?: (error: any) => unknown;
  /**
   * The boundary's optional `onError$` side-effect. Serialized (unlike `$fallback$`) so the client
   * `handleError` path can fire it for a post-resume throw, not just the SSR catch.
   */
  $onError$?: QRL<(error: unknown) => void>;
  /**
   * Server-only; streams `fallback$` as an out-of-order segment and swaps it into the fallback
   * host.
   */
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  /**
   * Server-only; the boundary's `content-host` SSR node, captured when it renders so a throw can
   * mark the swapped-out subtree inert (its tasks must not resume on the client).
   */
  $contentHostNode$?: ISsrNode;
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

/**
 * Fire the boundary's `onError$` side-effect with the ORIGINAL error (not the serialized
 * projection). Pure side-effect: it must never affect rendering, so it is fire-and-forget and its
 * own failure is logged rather than propagated. Call only at the catch point, guarded so it fires
 * once per error.
 */
export const fireOnError = (store: ErrorBoundaryStore, error: unknown): void => {
  const onError = store.$onError$;
  if (!onError) {
    return;
  }
  try {
    Promise.resolve(onError(error)).catch(logError);
  } catch (e) {
    logError(e);
  }
};
