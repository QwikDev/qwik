import { canSerialize } from '../serdes/can-serialize';
import { createContextId } from '../../use/use-context';
import { logError } from '../utils/log';
import type { ISsrNode } from '../../ssr/ssr-types';

/** @internal */
export interface ErrorBoundaryStore {
  error: any | undefined;
  /** Server-only; the client re-renders with `props.fallback$` instead. */
  $fallback$?: (error: any) => unknown;
  /** Server-only `onError$` mirror; the client fires the serialized `props.onError$` instead. */
  $onError$?: (error: unknown) => void;
  /** Server-only; streams `fallback$` as an out-of-order segment. */
  $emitFallback$?: (error: unknown) => void | Promise<void>;
  /**
   * The content-host SSR node, captured so a throw can mark the swapped-out subtree inert (its
   * tasks must not resume). Unlike the sibling `$`-fields this is intentionally NOT
   * `noSerialize`'d: serializing it roots the content host in the client VNode graph, which is what
   * lets a client re-render locate and drop the inert subtree. Wrapping it in `noSerialize` looks
   * tidier but breaks the inert-teardown re-render tests — leave it serialized.
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
 * A non-serializable thrown value would abort the whole page, so project it to a serializable
 * `Error`.
 */
export const toSerializableBoundaryError = (err: unknown): unknown => {
  if (err instanceof Error || canSerialize(err)) {
    return err;
  }
  const rawMessage = (err as { message?: unknown })?.message;
  return new Error(typeof rawMessage === 'string' ? rawMessage : String(err));
};

/**
 * Fire a boundary's `onError$` with the original error; fire-and-forget, its own failure never
 * affects rendering.
 */
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
