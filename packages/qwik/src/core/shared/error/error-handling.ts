import { isDev } from '@qwik.dev/core/build';
import type { DomContainer } from '../../client/dom-container';
import { mapArray_get } from '../../client/util-mapArray';
import { createContextId } from '../../use/use-context';
import { setErrorPayload } from '../cursor/chore-execution';
import { hashCode } from '../utils/hash_code';
import { logError, logWarn } from '../utils/log';
import { QContainerSelector, QCtxAttr } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VNode } from '../vnode/vnode';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import { PublicError } from './public-error';

/** Structured metadata about a caught error, passed to `onError$`. @public @experimental */
export interface ErrorBoundaryInfo {
  /** Where the caught error originated. */
  phase: 'render' | 'task' | 'event' | 'async-generator' | 'async-signal';
  /**
   * Identifies the boundary within the page. Allocated in render order and kept across a resume, so
   * every report from one boundary shares it — but it shifts when render order changes.
   */
  boundaryId: string;
  /**
   * The code a production fallback shows for this error, so a user's bug report matches your logs.
   * An error caught during SSR reports a second, different digest if the client re-derives it — the
   * stacks differ.
   */
  digest: string;
}

/** @internal */
export interface ErrorBoundaryStore {
  error: unknown | undefined;
  $fallback$?: (error: unknown) => unknown;
  $onError$?: (error: unknown, info: ErrorBoundaryInfo) => void;
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  boundaryId?: string;
  projectedContentOwnerId?: string;
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
  safeRead(() => !(err instanceof Error && 'plugin' in err), true);

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
        if (dev && isPromise(projected)) {
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
  phase: ErrorBoundaryInfo['phase'],
  boundaryId: string
): void => {
  if (!onError) {
    return;
  }
  try {
    const digest = errorBoundaryDigest(error);
    void Promise.resolve(onError(toBoundaryError(error), { phase, boundaryId, digest })).catch(
      logError
    );
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
  const onError = store.$onError$;
  if (onError) {
    fireOnError(onError, error, getTaggedErrorPhase(error) ?? phase, store.boundaryId ?? '');
  }
};

export function createErrorHandler(container: DomContainer): (e: Event) => void {
  return (e: Event) => {
    const detail = (e as CustomEvent<{ error: unknown; element?: Element; importError?: string }>)
      .detail;
    if (detail?.importError) {
      return;
    }
    const source = detail.element;
    if (source && source.closest(QContainerSelector) === container.element) {
      const host = container.vNodeLocate(source);
      if (host) {
        try {
          container.handleError(detail.error, host, 'event');
        } catch (handlerError) {
          logError(handlerError);
        }
      }
    }
  };
}

export function handleDevError(container: DomContainer, err: any, host: VNode) {
  if (typeof document !== 'undefined') {
    setErrorPayload(host, err);
    markVNodeDirty(container, host, ChoreBits.ERROR_WRAP);
  }
  try {
    if (err instanceof Error && !('hostElement' in err)) {
      (err as any)['hostElement'] = String(host);
    }
  } catch {
    // ignore
  }
  if (!isRecoverable(err)) {
    throw err;
  }
}

export function getOwnErrorBoundaryStore(
  container: DomContainer,
  host: VNode
): ErrorBoundaryStore | null {
  const ctx = container.getHostProp<Array<string | unknown>>(host, QCtxAttr);
  return ctx ? (mapArray_get(ctx, ERROR_CONTEXT.id, 0) as ErrorBoundaryStore | null) : null;
}
