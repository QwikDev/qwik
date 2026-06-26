import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';
import { logError } from '../utils/log';

/** @internal */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /** Server-only; the client re-renders with `props.fallback$` instead. */
  $fallback$?: (error: any) => unknown;
  /** Server-only `onError$` mirror; the client fires the serialized `props.onError$` instead. */
  $onError$?: (error: unknown) => void;
  /** Server-only; streams `fallback$` as an out-of-order segment. */
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  /** Serialized projection owner, so a resumed `reset()` can re-render it. */
  $resetOwner$?: unknown;
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

/** Project a non-serializable throw to a serializable `Error`, so serialization can't abort. */
export const toSerializableBoundaryError = (err: unknown): unknown => {
  if (err instanceof Error || canSerialize(err)) {
    return err;
  }
  const rawMessage = (err as { message?: unknown })?.message;
  return new Error(typeof rawMessage === 'string' ? rawMessage : String(err));
};

/** Fire-and-forget `onError$`; its own failure never affects rendering. */
export const fireOnError = (
  onError: ((error: unknown) => unknown) | undefined | null,
  error: unknown
): void => {
  if (!onError) {
    return;
  }
  try {
    Promise.resolve(onError(error)).catch(logError);
  } catch (e) {
    logError(e);
  }
};

/** Mark the boundary errored and fire `onError$` once, with the original error. */
export const markBoundaryErrored = (store: ErrorBoundaryStore, error: unknown): void => {
  const isFirstCatch = store.error === undefined;
  store.error = toSerializableBoundaryError(error);
  if (isFirstCatch) {
    fireOnError(store.$onError$, error);
  }
};
