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
   * Children's projection owner for a resumed `reset()`; plain (non-`$`) so prod serializes it, and
   * the ref roots the owner.
   */
  resetOwner?: unknown;
  /** Stable id for `onError$`; plain (non-`$`) so the CSR-on-resume sink can read it after resume. */
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

// Stable digest correlating a redacted client error with server logs.
const errorBoundaryDigest = (err: unknown): string => {
  const source =
    err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err);
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (Math.imul(31, hash) + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

const isKeepableBoundaryError = (v: unknown): boolean =>
  v instanceof Error || (v !== undefined && canSerialize(v));

const redactToGeneric = (err: unknown): Error & { digest: string } => {
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorBoundaryDigest(err);
  return redacted;
};

/**
 * Project a caught error to the serialized/`fallback$` value. Prod redacts to a generic message +
 * stable `digest`; dev keeps fidelity; never returns `undefined` (the store's no-error sentinel).
 * `transformError` owns the projection in both modes and is fail-closed; `dev` is an explicit arg
 * so tests can drive both paths.
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
    return isKeepableBoundaryError(projected) ? projected : redactToGeneric(err);
  }
  if (!dev) {
    return redactToGeneric(err);
  }
  if (isKeepableBoundaryError(err)) {
    return err;
  }
  const rawMessage = (err as { message?: unknown })?.message;
  return new Error(typeof rawMessage === 'string' ? rawMessage : String(err));
};

/**
 * Fallback display value: redacts client errors in prod to match SSR, keeping an already-redacted
 * (`digest`) projection so digests stay consistent with server logs.
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

// Off the store so the deferred-origin flag never serializes.
const boundariesWithDeferredError = /*#__PURE__*/ new WeakSet<ErrorBoundaryStore>();

/** Record that the boundary's error originated inside a deferred segment. */
export const markErrorFromDeferredSegment = (store: ErrorBoundaryStore): void => {
  boundariesWithDeferredError.add(store);
};

/** A deferred-origin error keeps `qO` segment delivery even when absorbed before the host drains. */
export const isErrorFromDeferredSegment = (store: ErrorBoundaryStore): boolean =>
  boundariesWithDeferredError.has(store);

// The render-drain catch site only knows phase 'render', so tag the origin.
const ERROR_PHASE = /*#__PURE__*/ Symbol('qErrorPhase');

/** Tag the error's originating phase so a rethrow through the render drain keeps it. */
export const tagErrorPhase = (err: unknown, phase: ErrorBoundaryInfo['phase']): void => {
  if (err === null || (typeof err !== 'object' && typeof err !== 'function')) {
    return;
  }
  try {
    Object.defineProperty(err, ERROR_PHASE, { value: phase, configurable: true });
  } catch {
    // Frozen error: catch site falls back to its own phase.
  }
};

const getTaggedErrorPhase = (err: unknown): ErrorBoundaryInfo['phase'] | undefined =>
  err !== null && (typeof err === 'object' || typeof err === 'function')
    ? (err as { [ERROR_PHASE]?: ErrorBoundaryInfo['phase'] })[ERROR_PHASE]
    : undefined;

/**
 * Mark the boundary errored and fire `onError$` with the original error; each newly caught error
 * fires again so display and telemetry stay consistent.
 */
export const markBoundaryErrored = (
  store: ErrorBoundaryStore,
  error: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render',
  transformError?: (error: unknown) => unknown
): void => {
  store.error = toSerializableBoundaryError(error, isDev, transformError);
  fireOnError(store.$onError$, error, {
    // A tagged origin (e.g. a rethrown task throw) beats the catch site's.
    phase: getTaggedErrorPhase(error) ?? phase,
    boundaryId: store.boundaryId ?? '',
  });
};
