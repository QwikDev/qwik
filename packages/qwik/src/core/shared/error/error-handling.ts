import { isDev } from '@qwik.dev/core/build';
import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';
import { logError } from '../utils/log';
import type { ErrorBoundaryInfo } from './error-boundary';

/** @internal */
export interface ErrorBoundaryStore {
  error: unknown | undefined;
  /** Server-only; the client re-renders with `props.fallback$`. */
  $fallback$?: (error: unknown) => unknown;
  /** Server-only; the client fires the serialized `props.onError$`. */
  $onError$?: (error: unknown, info: ErrorBoundaryInfo) => void;
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  /** Plain (non-`$`) key so prod serializes it for a resumed `reset()`. */
  resetOwner?: unknown;
  /** Plain (non-`$`) key so the CSR-on-resume sink reads it after resume. */
  boundaryId?: string;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

/** Reads from a possibly-hostile raw value; a throwing trap/getter yields the fallback. */
const safeRead = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

export const isRecoverable = (err: any) =>
  safeRead(() => !(err && err instanceof Error && 'plugin' in err), true);

const GENERIC_BOUNDARY_ERROR_MESSAGE = 'An error occurred';

const errorBoundaryDigest = (err: unknown): string => {
  const source = safeRead(
    () => (err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err)),
    'unknown'
  );
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (Math.imul(31, hash) + source.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

// No `instanceof Error` shortcut: an Error's own fields must serialize too.
const isKeepableBoundaryError = (v: unknown): boolean => v !== undefined && canSerialize(v);

const redactToGeneric = (err: unknown): Error & { digest: string } => {
  // No cause/custom fields: redaction must never leak the raw error.
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorBoundaryDigest(err);
  return redacted;
};

/**
 * Wraps a non-Error throw; assigns `cause` (not the constructor arg) so it stays enumerable and
 * serializes.
 */
const toBoundaryError = (raw: unknown, withCause: boolean): Error => {
  if (raw instanceof Error) {
    return raw;
  }
  let message: string;
  try {
    message = String(raw);
  } catch {
    try {
      message = Object.prototype.toString.call(raw);
    } catch {
      // Even the tag read throws (revoked Proxy): give up on the raw value.
      message = GENERIC_BOUNDARY_ERROR_MESSAGE;
    }
  }
  const wrapped = new Error(message);
  if (withCause) {
    wrapped.cause = raw;
  }
  return wrapped;
};

/** Never returns `undefined` (the store's no-error sentinel); fail-closed. */
export const toSerializableBoundaryError = (
  err: unknown,
  dev: boolean = isDev,
  transformError?: (error: unknown) => unknown
): Error => {
  try {
    if (transformError) {
      // A throwing transform lands in the outer catch. The projection's own
      // fields serialize later; validate them now, fail-closed.
      const projected = transformError(err);
      return projected instanceof Error && canSerialize(projected)
        ? projected
        : redactToGeneric(err);
    }
    if (!dev) {
      return redactToGeneric(err);
    }
    if (isKeepableBoundaryError(err)) {
      // Dev-only: a serializable raw throw survives to the fallback via `cause`.
      return toBoundaryError(err, true);
    }
    const rawMessage = (err as { message?: unknown })?.message;
    // No cause: a non-serializable raw would break dev serialization.
    return typeof rawMessage === 'string' ? new Error(rawMessage) : toBoundaryError(err, false);
  } catch {
    // A hostile raw value threw during inspection: redact without touching it again.
    return redactToGeneric(err);
  }
};

export const redactBoundaryErrorForDisplay = (error: unknown, dev: boolean = isDev): Error =>
  // Framework-projected (server-redacted) errors pass through untouched.
  safeRead(() => error instanceof Error && 'digest' in error, false)
    ? (error as Error)
    : toSerializableBoundaryError(error, dev);

export const fireOnError = (
  onError: ((error: Error, info: ErrorBoundaryInfo) => unknown) | undefined | null,
  error: unknown,
  info: ErrorBoundaryInfo
): void => {
  if (!onError) {
    return;
  }
  try {
    // In-memory only: identity-preserving for Errors, `cause` carries a raw non-Error.
    Promise.resolve(onError(toBoundaryError(error, true), info)).catch(logError);
  } catch (e) {
    logError(e);
  }
};

// Off the store so the deferred-origin flag never serializes.
const boundariesWithDeferredError = /*#__PURE__*/ new WeakSet<ErrorBoundaryStore>();

export const markErrorFromDeferredSegment = (store: ErrorBoundaryStore): void => {
  boundariesWithDeferredError.add(store);
};

/** Keeps `qO` segment delivery even when absorbed before the host drains. */
export const isErrorFromDeferredSegment = (store: ErrorBoundaryStore): boolean =>
  boundariesWithDeferredError.has(store);

// The render-drain catch site only knows phase 'render', so tag the origin.
const ERROR_PHASE = /*#__PURE__*/ Symbol('qErrorPhase');

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
    ? safeRead(
        () => (err as { [ERROR_PHASE]?: ErrorBoundaryInfo['phase'] })[ERROR_PHASE],
        undefined
      )
    : undefined;

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
