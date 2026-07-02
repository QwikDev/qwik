import { isDev } from '@qwik.dev/core/build';
import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';
import { logError } from '../utils/log';
import type { ErrorBoundaryInfo } from './error-boundary';

/** @internal */
export interface ErrorBoundaryStore {
  error: unknown | undefined;
  /** Server-only; the client re-renders with `props.fallback$` instead. */
  $fallback$?: (error: unknown) => unknown;
  /** Server-only `onError$` mirror; the client fires the serialized `props.onError$` instead. */
  $onError$?: (error: unknown, info: ErrorBoundaryInfo) => void;
  /** Server-only; streams `fallback$` as an out-of-order segment. */
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  /**
   * Serialized projection owner (the children's authoring component), so a resumed `reset()`
   * re-renders it. A plain (non-`$`) field on purpose: the prod build drops `$`-prefixed store
   * keys, so this node ref must NOT be `$`-prefixed — and the ref also roots the owner so it
   * resumes.
   */
  resetOwner?: unknown;
  /**
   * Stable boundary id handed to `onError$` as `info.boundaryId`. A plain (non-`$`) field so it
   * serializes — the CSR-on-resume sink reads it after resume.
   */
  boundaryId?: string;
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

const GENERIC_BOUNDARY_ERROR_MESSAGE = 'An error occurred';

/**
 * Stable, non-reversible digest of a thrown value, to correlate a redacted client error with server
 * logs.
 */
const errorBoundaryDigest = (err: unknown): string => {
  const source =
    err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (Math.imul(31, hash) + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

/** Redact to a generic message + a stable `digest`, dropping the raw message and any attached props. */
const redactToGeneric = (err: unknown): Error & { digest: string } => {
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorBoundaryDigest(err);
  return redacted;
};

/**
 * Project a caught error to the value serialized into the HTML and handed to `fallback$`.
 *
 * In production this REDACTS to a generic message + a stable `digest` (dropping the raw message and
 * any attached props; the stack is already dev-gated in the serializer), so internal detail never
 * reaches the client. `onError$` and server `logError` still receive the original error (see
 * `markBoundaryErrored`). In dev it keeps full fidelity, projecting a non-serializable throw to a
 * serializable `Error`. It never returns `undefined` — that is the store's "no error" sentinel, so
 * a thrown/projected `undefined` becomes an `Error` the store can key on. `dev` is an explicit arg
 * so tests can drive both paths — the build-time `isDev` constant can't be toggled at runtime.
 *
 * `transformError` (the server-only `RenderOptions.transformError`), when set, OWNS the projection
 * in both dev and prod. It is fail-closed: a throw or a non-serializable return redacts to the
 * generic shape rather than leaking the raw error.
 */
export const toSerializableBoundaryError = (
  err: unknown,
  dev: boolean = isDev,
  transformError?: (error: unknown) => unknown
): unknown => {
  if (transformError) {
    let projected: unknown;
    try {
      projected = transformError(err);
    } catch {
      return redactToGeneric(err);
    }
    return projected instanceof Error || (projected !== undefined && canSerialize(projected))
      ? projected
      : redactToGeneric(err);
  }
  if (!dev) {
    return redactToGeneric(err);
  }
  if (err instanceof Error || (err !== undefined && canSerialize(err))) {
    return err;
  }
  const rawMessage = (err as { message?: unknown })?.message;
  return new Error(typeof rawMessage === 'string' ? rawMessage : String(err));
};

/**
 * What the boundary's fallback displays. Redacts a client-origin error in prod so it matches the
 * SSR path; keeps an already-redacted projection (it has a `digest`) so the digest the client shows
 * stays consistent with the server log. `dev` is explicit so tests can drive both paths.
 */
export const redactBoundaryErrorForDisplay = (error: unknown, dev: boolean = isDev): unknown =>
  error instanceof Error && 'digest' in error ? error : toSerializableBoundaryError(error, dev);

/** Fire-and-forget `onError$`; its own failure never affects rendering. */
export const fireOnError = (
  onError: ((error: unknown, info: ErrorBoundaryInfo) => unknown) | undefined | null,
  error: unknown,
  info: ErrorBoundaryInfo
): void => {
  if (!onError) {
    return;
  }
  try {
    Promise.resolve(onError(error, info)).catch(logError);
  } catch (e) {
    logError(e);
  }
};

// Server-only: boundaries whose caught error came from a deferred (out-of-order) segment. Kept out
// of the store so the flag never serializes.
const boundariesWithDeferredError = /*#__PURE__*/ new WeakSet<ErrorBoundaryStore>();

/** Record that the boundary's error originated inside a deferred segment. */
export const markErrorFromDeferredSegment = (store: ErrorBoundaryStore): void => {
  boundariesWithDeferredError.add(store);
};

/** A deferred-origin error keeps `qO` segment delivery even when absorbed before the host drains. */
export const isErrorFromDeferredSegment = (store: ErrorBoundaryStore): boolean =>
  boundariesWithDeferredError.has(store);

/**
 * Mark the boundary errored and fire `onError$` with the original error and its phase. Each newly
 * caught error fires again, so display (`store.error`) and telemetry stay consistent.
 */
export const markBoundaryErrored = (
  store: ErrorBoundaryStore,
  error: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render',
  transformError?: (error: unknown) => unknown
): void => {
  store.error = toSerializableBoundaryError(error, isDev, transformError);
  fireOnError(store.$onError$, error, { phase, boundaryId: store.boundaryId ?? '' });
};
