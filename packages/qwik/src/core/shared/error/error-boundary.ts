import { isBrowser, isDev } from '@qwik.dev/core/build';
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
import {
  QErrorContentHost,
  QErrorFallbackHost,
  QSuspenseResolved,
  QSuspenseResultParent,
} from '../utils/markers';
import { qTest } from '../utils/qdev';
import { isOutOfOrderSegmentContainer } from '../utils/container';
import { createInternalServerComponent } from '../../ssr/internal-server-component';
import { finalizeAndSwapOutOfOrderSegment } from '../../ssr/out-of-order-segment-swap';
import type { SSRContainer, SSROutOfOrderSegment } from '../../ssr/ssr-types';
import { tryGetInvokeContext } from '../../use/use-core';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { getNextUniqueIndex } from '../utils/unique-index-generator';
import { getStoreTarget } from '../../reactive-primitives/impl/store';
import {
  ERROR_BOUNDARY_QRL_SYMBOL,
  isErrorFromDeferredSegment,
  markBoundaryErrored,
  redactBoundaryErrorForDisplay,
  type ErrorBoundaryInfo,
  type ErrorBoundaryStore,
} from './error-handling';

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

// Boundary ids draw from the container's shared out-of-order sequence (nextOutOfOrderId(false)).
const nextErrorBoundaryId = (): number => {
  if (!__EXPERIMENTAL__.errorBoundary) {
    return 0;
  }
  const container = tryGetInvokeContext()?.$container$ as SSRContainer | undefined;
  return container?.nextOutOfOrderId?.(false) ?? 0;
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

export const SSRErrorFallback = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{ boundaryId: number; store: ErrorBoundaryStore }>(
      (ssr, jsx, options) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        const segmentId = `${boundaryId}`;
        const streamFallback = async (error: unknown): Promise<void> => {
          const fallback = store.$fallback$;
          if (!fallback) {
            return;
          }
          // The catch site already recorded it; marking again refires onError$.
          if (store.error !== error) {
            markBoundaryErrored(store, error, 'render');
          }
          delete store.$fallback$;
          const projected = redactBoundaryErrorForDisplay(store.error, isDev, ssr.$transformError$);
          const segment = await ssr.segment(segmentId, fallback(projected) as JSXOutput, options);
          await emitErrorBoundaryFallback(ssr, boundaryId, segmentId, segment);
        };
        store.$emitFallback$ = noSerialize(streamFallback);
        ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
        if (store.error !== undefined && store.$fallback$) {
          return streamFallback(store.error);
        }
      }
    )
  : null!;

export const SSRErrorFallbackInline = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{ boundaryId: number; store: ErrorBoundaryStore }>(
      (ssr, jsx, _options, enqueue) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        if (store.error !== undefined && store.$fallback$) {
          const fallback = store.$fallback$;
          delete store.$fallback$;
          const projected = redactBoundaryErrorForDisplay(store.error, isDev, ssr.$transformError$);
          if (isOutOfOrderSegmentContainer(ssr)) {
            ssr.$registerErrorSwap$(boundaryId);
            enqueue(fallback(projected) as JSXOutput);
          } else {
            enqueue(() => {
              ssr.emitErrorSwapExecutorIfNeeded();
              ssr.emitInlineScript(`qErr(${boundaryId})`);
            });
            enqueue(fallback(projected) as JSXOutput);
          }
        }
      }
    )
  : null!;

export const SSRErrorFallbackHost = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<{
      boundaryId: number;
      store: ErrorBoundaryStore;
      hostStyle: string;
    }>((ssr, jsx, _options, enqueue) => {
      const boundaryId = jsx.varProps.boundaryId as number;
      const store = jsx.varProps.store as ErrorBoundaryStore;
      const hostStyle = jsx.varProps.hostStyle as string;
      const deliverLate =
        __EXPERIMENTAL__.suspense &&
        ssr.outOfOrderStreaming &&
        !isOutOfOrderSegmentContainer(ssr) &&
        (store.error === undefined || isErrorFromDeferredSegment(store));
      enqueue(
        /*#__PURE__*/ _jsxSorted(
          'div',
          {
            [deliverLate ? QSuspenseResultParent : QErrorFallbackHost]: String(boundaryId),
            style: hostStyle,
          },
          null,
          /*#__PURE__*/ _jsxSorted(
            deliverLate ? SSRErrorFallback : SSRErrorFallbackInline,
            { boundaryId, store },
            null,
            null,
            1,
            null
          ),
          1,
          null
        )
      );
    })
  : null!;

async function emitErrorBoundaryFallback(
  ssr: SSRContainer,
  boundaryId: number,
  segmentId: string,
  rendered: SSROutOfOrderSegment
): Promise<void> {
  // qErr hides the errored content host and strips its broadcast handlers.
  rendered.container.$registerErrorSwap$(boundaryId);
  await ssr.$runQueuedRender$(() =>
    finalizeAndSwapOutOfOrderSegment(ssr, boundaryId, segmentId, rendered, null, true)
  );
}
