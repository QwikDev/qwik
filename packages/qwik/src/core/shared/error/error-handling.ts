import { isDev } from '@qwik.dev/core/build';
import { createContextId } from '../../use/use-context';
import { hashCode } from '../utils/hash_code';
import { logError } from '../utils/log';
import type { ErrorBoundaryInfo } from './error-boundary';
import { isPublicError } from './public-error';

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

const errorBoundaryDigest = (err: unknown): string =>
  hashCode(
    safeRead(
      () =>
        err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
      'unknown'
    )
  );

// Brands framework-projected errors so the pass-through can't be forged by an app's `digest` field.
const REDACTED = /*#__PURE__*/ Symbol();

const redactToGeneric = (err: unknown): Error & { digest: string } => {
  // No cause/custom fields: redaction must never leak the raw error.
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorBoundaryDigest(err);
  // Non-enumerable so it never leaks into userland serialization of captured errors.
  Object.defineProperty(redacted, REDACTED, { value: true });
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

// A projection with an unreadable field would crash the fallback; probe every enumerable read.
const isReadableProjection = (projected: Error): boolean =>
  safeRead(() => {
    void projected.message;
    void projected.name;
    for (const key in projected) {
      void (projected as Record<string, unknown>)[key];
    }
    return true;
  }, false);

/**
 * The single boundary membrane: turns any thrown value into a display-safe `Error`. Never throws (a
 * hostile value is redacted) and never returns `undefined` (the store's no-error sentinel).
 */
export const redactBoundaryErrorForDisplay = (
  error: unknown,
  dev: boolean = isDev,
  transformError?: (error: unknown) => unknown
): Error => {
  try {
    if (transformError) {
      // The app's projection wins; keep a readable Error by identity, else fail closed.
      const projected = transformError(error);
      return projected instanceof Error && isReadableProjection(projected)
        ? projected
        : redactToGeneric(error);
    }
    // Constructing a PublicError is consent to display its data unredacted, even in prod.
    if (isPublicError(error)) {
      return error;
    }
    // An already-projected (framework-redacted) error passes through untouched.
    if (safeRead(() => error instanceof Error && REDACTED in error, false)) {
      return error as Error;
    }
    if (!dev) {
      return redactToGeneric(error);
    }
    if (error instanceof Error) {
      return error;
    }
    const rawMessage = (error as { message?: unknown })?.message;
    if (typeof rawMessage === 'string') {
      // In-memory only: the raw value always survives to the fallback via `cause`.
      const wrapped = new Error(rawMessage);
      wrapped.cause = error;
      return wrapped;
    }
    return toBoundaryError(error, true);
  } catch {
    // A hostile raw value threw during inspection: redact without touching it again.
    return redactToGeneric(error);
  }
};

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
  phase: ErrorBoundaryInfo['phase'] = 'render'
): void => {
  // Store the raw throw; the display membrane projects it later.
  // `undefined` is the no-error sentinel, so a bare `undefined` throw needs a keyable stand-in.
  store.error = error === undefined ? new Error('undefined') : error;
  fireOnError(store.$onError$, error, {
    // A tagged origin (e.g. a rethrown task throw) beats the catch site's.
    phase: getTaggedErrorPhase(error) ?? phase,
    boundaryId: store.boundaryId ?? '',
  });
};
