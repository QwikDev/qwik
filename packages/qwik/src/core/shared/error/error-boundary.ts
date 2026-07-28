import { isBrowser } from '@qwik.dev/core/build';
import { nextErrorBoundaryId } from '../../control-flow/suspense-utils';
import { SSRErrorFallbackHost } from '../../control-flow/suspense';
import { useErrorBoundaryStore } from '../../use/use-error-boundary-store';
import { componentQrl, type Component } from '../component.public';
import { _jsxSorted } from '../jsx/jsx-internal';
import { Fragment } from '../jsx/jsx-runtime';
import { Slot } from '../jsx/slot.public';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { isServerPlatform } from '../platform/platform';
import { inlinedQrl } from '../qrl/qrl';
import type { QRL } from '../qrl/qrl.public';
import { noSerialize } from '../serdes/verify';
import { QErrorContentHost } from '../utils/markers';
import { qTest } from '../utils/qdev';
import { tryGetInvokeContext } from '../../use/use-core';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { getNextUniqueIndex } from '../utils/unique-index-generator';
import { getStoreTarget } from '../../reactive-primitives/impl/store';
import {
  ERROR_BOUNDARY_QRL_SYMBOL,
  redactBoundaryErrorForDisplay,
  type ErrorBoundaryStore,
} from './error-handling';

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

/** @public @experimental */
export interface ErrorBoundaryProps {
  /**
   * Rendered when a descendant throws. The error is always an `Error`, so `{error.message}` is
   * safe: a non-Error throw is wrapped, and production redacts to a generic message plus `digest`.
   *
   * Wrap `reset` in a handler — `onClick$={() => reset()}`, not `onClick$={reset}` — so it stays
   * wired in a streamed fallback.
   */
  fallback$: QRL<(error: Error & { digest?: string }, reset: QRL<() => void>) => JSXOutput>;
  /**
   * Side effect only; never affects rendering. Receives the original `Error` — a non-Error throw
   * arrives wrapped, with `cause` set to the raw value.
   *
   * An error caught during SSR fires again when the client re-derives it, so dedupe in your
   * reporter.
   */
  onError$?: QRL<(error: Error, info: ErrorBoundaryInfo) => void>;
}

/** @internal */
export const errorBoundaryReset = (): void => {
  const [host] = useLexicalScope<[unknown]>();
  const container = tryGetInvokeContext()?.$container$ as
    | { resetErrorBoundary?: (host: unknown) => void }
    | undefined;
  if (container?.resetErrorBoundary && host) {
    container.resetErrorBoundary(host);
  }
};

const buildLastResortFallback = (): JSXOutput =>
  /*#__PURE__*/ _jsxSorted('div', { role: 'alert' }, null, 'Something went wrong.', 0, null);

const renderFallbackOrLastResort = (
  fallbackQrl: ErrorBoundaryProps['fallback$'],
  error: Error,
  reset: QRL<() => void>
): JSXOutput | Promise<JSXOutput> => {
  const rendered = fallbackQrl(error, reset) as JSXOutput | Promise<JSXOutput>;
  if (rendered && typeof (rendered as Promise<JSXOutput>).then === 'function') {
    return (rendered as Promise<JSXOutput>).catch((err) => {
      if ((fallbackQrl as { resolved?: unknown }).resolved !== undefined) {
        throw err;
      }
      return buildLastResortFallback();
    });
  }
  return rendered;
};

const buildErrorBoundaryHosts = (store: ErrorBoundaryStore): JSXOutput => {
  const boundaryId = nextErrorBoundaryId();
  return [
    /*#__PURE__*/ _jsxSorted(
      'div',
      {
        [QErrorContentHost]: String(boundaryId),
        style: 'display:contents',
      },
      null,
      /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null),
      1,
      null
    ),
    /*#__PURE__*/ _jsxSorted(
      SSRErrorFallbackHost,
      {
        boundaryId,
        store,
        hostStyle: 'display:none',
      },
      null,
      null,
      1,
      null
    ),
  ] as unknown as JSXOutput;
};

/** @internal */
export const errorBoundaryCmp = (props: ErrorBoundaryProps): JSXOutput => {
  if (!__EXPERIMENTAL__.errorBoundary) {
    throw new Error(
      '<ErrorBoundary> requires the `errorBoundary` experimental feature. Enable it in your Qwik Vite config: qwikVite({ experimental: ["errorBoundary"] }).'
    );
  }
  const store = useErrorBoundaryStore();
  const invokeCtx = tryGetInvokeContext();
  const host = invokeCtx?.$hostElement$;
  const container = invokeCtx?.$container$;
  if (container && (getStoreTarget(store) ?? store).boundaryId === undefined) {
    store.boundaryId = getNextUniqueIndex(container);
  }
  const reset = /*#__PURE__*/ inlinedQrl(errorBoundaryReset, '_ebR', [host]);

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    const fallbackQrl = props.fallback$;
    store.$fallback$ = noSerialize((error: unknown) => fallbackQrl(error as Error, reset));
    const onErrorQrl = props.onError$;
    if (onErrorQrl) {
      store.$onError$ = noSerialize((error: unknown, info: ErrorBoundaryInfo) =>
        onErrorQrl(error as Error, info)
      );
    }
    // Serialized only to keep this node resumable; dropping it makes reset a silent no-op.
    store.resumableParent = (host as { parentComponent?: unknown } | undefined)?.parentComponent;
    return buildErrorBoundaryHosts(store);
  }

  if (store.error !== undefined) {
    const displayError = redactBoundaryErrorForDisplay(store.error);
    return /*#__PURE__*/ _jsxSorted(
      Fragment,
      null,
      null,
      renderFallbackOrLastResort(props.fallback$, displayError, reset),
      0,
      null
    );
  }

  return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
};

/** Renders `fallback$` instead of its children when a descendant throws. @public @experimental */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, ERROR_BOUNDARY_QRL_SYMBOL)
  );
