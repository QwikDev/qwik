import { isDev } from '@qwik.dev/core/build';
import { createContextId } from '../../use/use-context';
import { hashCode } from '../utils/hash_code';
import { logError, logWarn } from '../utils/log';
import type { ErrorBoundaryInfo } from './error-boundary';
import { PublicError } from './public-error';

/** @internal */
export interface ErrorBoundaryStore {
  error: unknown | undefined;
  $fallback$?: (error: unknown) => unknown;
  $onError$?: (error: unknown, info: ErrorBoundaryInfo) => void;
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  resumableParent?: unknown;
  boundaryId?: string;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<ErrorBoundaryStore>('qk-error');

export const ERROR_BOUNDARY_QRL_SYMBOL = '_ebC';

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

const REDACTED = /*#__PURE__*/ Symbol();

const redactToGeneric = (err: unknown): Error & { digest: string } => {
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorBoundaryDigest(err);
  Object.defineProperty(redacted, REDACTED, { value: true });
  return redacted;
};

export const toBoundaryError = (raw: unknown): Error => {
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
      message = GENERIC_BOUNDARY_ERROR_MESSAGE;
    }
  }
  const wrapped = new Error(message);
  wrapped.cause = raw;
  return wrapped;
};

const isReadableProjection = (projected: Error): boolean =>
  safeRead(() => {
    void projected.message;
    void projected.name;
    for (const key in projected) {
      void (projected as unknown as Record<string, unknown>)[key];
    }
    return true;
  }, false);

export const redactBoundaryErrorForDisplay = (
  error: unknown,
  dev: boolean = isDev,
  transformError?: (error: unknown) => unknown
): Error => {
  try {
    if (transformError) {
      const projected = transformError(error);
      if (projected instanceof Error) {
        return isReadableProjection(projected) ? projected : redactToGeneric(error);
      }
      if (projected != null) {
        if (dev && typeof (projected as { then?: unknown })?.then === 'function') {
          logWarn('transformError must return synchronously; an async one redacts every error.');
        }
        return redactToGeneric(error);
      }
    }
    if (error instanceof PublicError) {
      return error;
    }
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
      const wrapped = new Error(rawMessage);
      wrapped.cause = error;
      return wrapped;
    }
    return toBoundaryError(error);
  } catch {
    return redactToGeneric(error);
  }
};

export const fireOnError = (
  onError: ((error: Error, info: ErrorBoundaryInfo) => unknown) | undefined | null,
  error: unknown,
  info: Omit<ErrorBoundaryInfo, 'digest'>
): void => {
  if (!onError) {
    return;
  }
  try {
    const digest = errorBoundaryDigest(error);
    Promise.resolve(onError(toBoundaryError(error), { ...info, digest })).catch(logError);
  } catch (e) {
    logError(e);
  }
};

const boundariesWithDeferredError = /*#__PURE__*/ new WeakSet<ErrorBoundaryStore>();

export const markErrorFromDeferredSegment = (store: ErrorBoundaryStore): void => {
  boundariesWithDeferredError.add(store);
};

export const isErrorFromDeferredSegment = (store: ErrorBoundaryStore): boolean =>
  boundariesWithDeferredError.has(store);

const ERROR_PHASE = /*#__PURE__*/ Symbol('qErrorPhase');

export const tagErrorPhase = (err: unknown, phase: ErrorBoundaryInfo['phase']): void => {
  try {
    Object.defineProperty(err, ERROR_PHASE, { value: phase, configurable: true });
  } catch {
    // ignore
  }
};

const getTaggedErrorPhase = (err: unknown): ErrorBoundaryInfo['phase'] | undefined =>
  safeRead(() => (err as { [ERROR_PHASE]?: ErrorBoundaryInfo['phase'] })?.[ERROR_PHASE], undefined);

export const markBoundaryErrored = (
  store: ErrorBoundaryStore,
  error: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render'
): void => {
  // `null` would collide with the capture-only sentinel, so wrap every nullish throw.
  store.error = error == null ? toBoundaryError(error) : error;
  fireOnError(store.$onError$, error, {
    phase: getTaggedErrorPhase(error) ?? phase,
    boundaryId: store.boundaryId ?? '',
  });
};
