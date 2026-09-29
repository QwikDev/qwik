import type { DomContainer } from '../../client/dom-container';
import type { ContainerElement, QDocument } from '../../client/types';
import { mapArray_get } from '../../client/util-mapArray';
import { createContextId } from '../../use/use-context';
import type { HostElement } from '../types';
import { setErrorPayload } from '../cursor/chore-execution';
import { hashCode } from '../utils/hash_code';
import { logError, logWarn } from '../utils/log';
import { QContainerSelector, QCtxAttr } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import type { VNode } from '../vnode/vnode';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import { CatchPhase } from './catch-phase';

export { CatchPhase } from './catch-phase';

/** Structured metadata about a caught error, passed to `onError$`. @public @experimental */
export interface CatchInfo {
  /** Where the caught error originated. */
  phase: CatchPhase;
  /**
   * Identifies the boundary within the page. Allocated in render order and kept across a resume, so
   * every report from one boundary shares it — but it shifts when render order changes.
   */
  boundaryId: string;
  /**
   * The code a production fallback shows for a server-origin error, so a user's bug report matches
   * your logs. An error caught during SSR reports a second, different digest if the client
   * re-derives it — the stacks differ.
   */
  digest: string;
}

/** @internal */
export interface CatchStore {
  error: unknown | undefined;
  $fallback$?: (error: unknown) => unknown;
  $onError$?: (error: unknown, info: CatchInfo) => void;
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  boundaryId?: string;
  projectedContentOwner?: HostElement;
}

export const ERROR_CONTEXT = /*#__PURE__*/ createContextId<CatchStore>('qk-error');

export const CATCH_QRL_SYMBOL = '_caC';

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

const errorDigest = (err: unknown): string =>
  hashCode(
    safeRead(
      () =>
        err instanceof Error ? `${err.name}: ${err.message}\n${err.stack ?? ''}` : String(err),
      'unknown'
    )
  );

const REDACTED = /*#__PURE__*/ Symbol();

export const redactToGeneric = (err: unknown): Error & { digest: string } => {
  const redacted = new Error(GENERIC_BOUNDARY_ERROR_MESSAGE) as Error & { digest: string };
  redacted.digest = errorDigest(err);
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
  showRaw: boolean,
  transformError?: (error: unknown) => unknown
): Error => {
  try {
    if (transformError) {
      const projected = transformError(error);
      if (projected instanceof Error) {
        return isReadableProjection(projected) ? projected : redactToGeneric(error);
      }
      if (projected != null) {
        if (showRaw && isPromise(projected)) {
          logWarn('transformError must return synchronously; an async one redacts every error.');
        }
        return redactToGeneric(error);
      }
    }
    if (safeRead(() => error instanceof Error && REDACTED in error, false)) {
      return error as Error;
    }
    if (!showRaw) {
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
  onError: ((error: Error, info: CatchInfo) => unknown) | undefined | null,
  error: unknown,
  phase: CatchPhase,
  boundaryId: string
): void => {
  if (!onError) {
    return;
  }
  try {
    const digest = errorDigest(error);
    void Promise.resolve(onError(toBoundaryError(error), { phase, boundaryId, digest })).catch(
      logError
    );
  } catch (e) {
    logError(e);
  }
};

const boundariesWithDeferredError = /*#__PURE__*/ new WeakSet<CatchStore>();

export const markErrorFromDeferredSegment = (store: CatchStore): void => {
  boundariesWithDeferredError.add(store);
};

export const isErrorFromDeferredSegment = (store: CatchStore): boolean =>
  boundariesWithDeferredError.has(store);

const ERROR_PHASE = /*#__PURE__*/ Symbol('qErrorPhase');

export const tagErrorPhase = (err: unknown, phase: CatchPhase): void => {
  try {
    Object.defineProperty(err, ERROR_PHASE, { value: phase, configurable: true });
  } catch {
    // ignore
  }
};

const getTaggedErrorPhase = (err: unknown): CatchPhase | undefined =>
  safeRead(() => (err as { [ERROR_PHASE]?: CatchPhase })?.[ERROR_PHASE], undefined);

export const markBoundaryErrored = (
  store: CatchStore,
  error: unknown,
  phase: CatchPhase = CatchPhase.Render
): void => {
  // `null` would collide with the capture-only sentinel, so wrap every nullish throw.
  store.error = error == null ? toBoundaryError(error) : error;
  const onError = store.$onError$;
  if (onError) {
    fireOnError(onError, error, getTaggedErrorPhase(error) ?? phase, store.boundaryId ?? '');
  }
};

const handleQError = (e: Event) => {
  const detail = (e as CustomEvent<{ error: unknown; element?: Element; importError?: string }>)
    .detail;
  if (detail?.importError) {
    return;
  }
  const source = detail.element;
  // The listener is document-wide, so only this document's elements may route through it.
  if (!source || source.ownerDocument !== e.currentTarget) {
    return;
  }
  // A destroyed container clears this back-pointer, so a stale target resolves to nothing.
  const container = (source.closest(QContainerSelector) as ContainerElement | null)?.qContainer;
  const host = container?.vNodeLocate(source);
  if (!container || !host) {
    return;
  }
  try {
    container.handleError(detail.error, host, CatchPhase.Event);
  } catch (handlerError) {
    logError(handlerError);
  }
};

/**
 * One listener per document, routed by target, so no container is retained by the document. The
 * marker lives on the document so a second bundle on the page reuses it instead of
 * double-handling.
 */
export function installQErrorListener(doc: QDocument): void {
  if (!doc.qErrorHandler) {
    doc.qErrorHandler = handleQError;
    doc.addEventListener?.('qerror', handleQError);
  }
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

export function getOwnCatchStore(container: DomContainer, host: VNode): CatchStore | null {
  const ctx = container.getHostProp<Array<string | unknown>>(host, QCtxAttr);
  return ctx ? (mapArray_get(ctx, ERROR_CONTEXT.id, 0) as CatchStore | null) : null;
}
