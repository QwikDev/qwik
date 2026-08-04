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
  OnRenderProp,
  QErrorContentHost,
  QErrorFallbackHost,
  QSlot,
  QSuspenseResolved,
  QSuspenseResultParent,
} from '../utils/markers';
import { qTest } from '../utils/qdev';
import { isOutOfOrderSegmentContainer } from '../utils/container';
import { createInternalServerComponent } from '../../ssr/internal-server-component';
import { finalizeAndSwapOutOfOrderSegment } from '../../ssr/out-of-order-segment-swap';
import type { SSRContainer } from '../../ssr/ssr-types';
import { tryGetInvokeContext } from '../../use/use-core';
import { getNextUniqueIndex } from '../utils/unique-index-generator';
import { getStoreTarget } from '../../reactive-primitives/impl/store';
import { hasSlotProps } from '../utils/prop';
import {
  vnode_getProjectionParentOrParent,
  vnode_getProp,
  vnode_isVirtualVNode,
} from '../../client/vnode-utils';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import {
  ERROR_CONTEXT,
  ERROR_BOUNDARY_QRL_SYMBOL,
  getOwnErrorBoundaryStore,
  isErrorFromDeferredSegment,
  markBoundaryErrored,
  redactBoundaryErrorForDisplay,
  type ErrorBoundaryInfo,
  type ErrorBoundaryStore,
  ErrorBoundaryPhase,
} from './error-handling';
import { _captures } from '../qrl/qrl-class';
import type { DomContainer } from '../../client/dom-container';
import type { VirtualVNode } from '../vnode/virtual-vnode';
import type { VNode } from '../vnode/vnode';

/** @public @experimental */
export interface ErrorBoundaryProps {
  /**
   * Rendered when a descendant throws. The error is always an `Error`, so `{error.message}` is
   * safe: a non-Error throw is wrapped, and production redacts server-origin errors to a generic
   * message plus `digest`. Client-origin errors render as thrown — their messages already live in
   * the browser bundle.
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
  const [host] = _captures as [VNode];
  // this is executed only on client
  const container = tryGetInvokeContext()?.$container$ as DomContainer | undefined;
  const isBrowserEnv = qTest ? !isServerPlatform() : isBrowser;
  if (isBrowserEnv && host && container) {
    resetErrorBoundary(container, host);
  }
};

const RESET_KEY_SUFFIX = '\0';

/** @internal */
export function resetErrorBoundary(container: DomContainer, host: VNode): void {
  const boundaryHost = container.resolveContextHost(host, ERROR_CONTEXT);
  if (!boundaryHost) {
    return;
  }
  const store = getOwnErrorBoundaryStore(container, boundaryHost);
  if (!store) {
    return;
  }
  scheduleBoundaryContentReset(
    container,
    boundaryHost as VirtualVNode,
    (store.projectedContentOwner as VirtualVNode | undefined) ?? null
  );
  store.error = undefined;
}

function scheduleBoundaryContentReset(
  container: DomContainer,
  boundaryHost: VirtualVNode,
  recordedContentOwner: VirtualVNode | null
): void {
  let resetHost = boundaryHost;
  let contentOwner: VirtualVNode | null = null;
  let vNode: VNode | null = vnode_getProjectionParentOrParent(boundaryHost);
  let crossedProjection = false;
  while (vNode) {
    if (vnode_isVirtualVNode(vNode)) {
      if (vnode_getProp(vNode, QSlot, null) !== null) {
        crossedProjection = true;
      } else if (vnode_getProp(vNode, OnRenderProp, null) !== null) {
        if (!crossedProjection) {
          const ownerBoundary = getOwnErrorBoundaryStore(container, vNode);
          if (!ownerBoundary || ownerBoundary.error !== undefined) {
            if (contentOwner) {
              resetHost = contentOwner;
            }
            contentOwner = vNode;
            if (ownerBoundary?.error !== undefined || !hasSlotProps(vNode.props)) {
              break;
            }
          }
        }
        crossedProjection = false;
      }
    }
    vNode = vnode_getProjectionParentOrParent(vNode);
  }
  if (recordedContentOwner && recordedContentOwner !== contentOwner) {
    resetHost = contentOwner ?? resetHost;
    contentOwner = recordedContentOwner;
  }
  if (contentOwner) {
    // Force keyed diff to recreate emptied projected content.
    resetHost.key = `${resetHost.key ?? ''}${RESET_KEY_SUFFIX}`;
    markVNodeDirty(container, contentOwner, ChoreBits.COMPONENT);
  } else {
    markVNodeDirty(container, boundaryHost, ChoreBits.COMPONENT);
  }
}

const renderFallbackOrLastResort = (
  fallbackQrl: ErrorBoundaryProps['fallback$'],
  error: Error,
  reset: QRL<() => void>
): JSXOutput | Promise<JSXOutput> => {
  return fallbackQrl(error, reset).catch((err) => {
    if (fallbackQrl.resolved !== undefined) {
      throw err;
    }
    return /*#__PURE__*/ _jsxSorted(
      'div',
      { role: 'alert' },
      null,
      'Something went wrong.',
      0,
      null
    );
  });
};

const buildSSRErrorBoundaryHosts = (
  store: ErrorBoundaryStore,
  container: SSRContainer | undefined
): JSXOutput => {
  const boundaryId = container?.nextOutOfOrderId(false) ?? 0;
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
  const container = invokeCtx?.$container$;
  if (container && (getStoreTarget(store) ?? store).boundaryId === undefined) {
    store.boundaryId = getNextUniqueIndex(container);
  }
  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (!isServerEnv && store.error === undefined) {
    return /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null);
  }

  const reset = /*#__PURE__*/ inlinedQrl(errorBoundaryReset, '_ebR', [invokeCtx?.$hostElement$]);
  if (isServerEnv) {
    const fallbackQrl = props.fallback$;
    store.$fallback$ = noSerialize((error: unknown) => fallbackQrl(error as Error, reset));
    const onErrorQrl = props.onError$;
    if (onErrorQrl) {
      store.$onError$ = noSerialize((error: unknown, info: ErrorBoundaryInfo) =>
        onErrorQrl(error as Error, info)
      );
    }
    return buildSSRErrorBoundaryHosts(store, container as SSRContainer);
  }

  const displayError = redactBoundaryErrorForDisplay(store.error, true);
  return /*#__PURE__*/ _jsxSorted(
    Fragment,
    null,
    null,
    renderFallbackOrLastResort(props.fallback$, displayError, reset),
    0,
    null
  );
};

/** Renders `fallback$` instead of its children when a descendant throws. @public @experimental */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, ERROR_BOUNDARY_QRL_SYMBOL)
  );

type SSRErrorFallbackProps = {
  boundaryId: number;
  store: ErrorBoundaryStore;
};

const consumeSSRErrorFallback = (ssr: SSRContainer, store: ErrorBoundaryStore): JSXOutput => {
  const fallback = store.$fallback$!;
  delete store.$fallback$;
  const projected = redactBoundaryErrorForDisplay(store.error, isDev, ssr.$transformError$);
  return fallback(projected) as JSXOutput;
};

const SSRErrorFallbackRenderer = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<SSRErrorFallbackProps & { deliverLate: boolean }>(
      (ssr, jsx, options, enqueue) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
        if (jsx.varProps.deliverLate) {
          const streamFallback = async (error: unknown): Promise<void> => {
            if (!store.$fallback$) {
              return;
            }
            // The catch site already recorded it; marking again refires onError$.
            if (store.error !== error) {
              markBoundaryErrored(store, error, ErrorBoundaryPhase.Render);
            }
            const segment = await ssr.segment(
              `${boundaryId}`,
              consumeSSRErrorFallback(ssr, store),
              options
            );
            // qErr hides the errored content host and strips its broadcast handlers.
            segment.container.$registerErrorSwap$(boundaryId);
            await ssr.$runQueuedRender$(() =>
              finalizeAndSwapOutOfOrderSegment(ssr, boundaryId, segment, null)
            );
          };
          store.$emitFallback$ = noSerialize(streamFallback);
          ssr.write(`<template ${QSuspenseResolved}="${boundaryId}"></template>`);
          if (store.error !== undefined) {
            return streamFallback(store.error);
          }
          return;
        }

        if (store.error === undefined || !store.$fallback$) {
          return;
        }
        if (isOutOfOrderSegmentContainer(ssr)) {
          ssr.$registerErrorSwap$(boundaryId);
        } else {
          enqueue(() => {
            ssr.emitErrorSwapExecutorIfNeeded();
            ssr.emitInlineScript(`qErr(${boundaryId})`);
          });
        }
        enqueue(consumeSSRErrorFallback(ssr, store));
      }
    )
  : null!;

export const SSRErrorFallbackHost = __EXPERIMENTAL__.errorBoundary
  ? /*#__PURE__*/ createInternalServerComponent<SSRErrorFallbackProps>(
      (ssr, jsx, _options, enqueue) => {
        const boundaryId = jsx.varProps.boundaryId as number;
        const store = jsx.varProps.store as ErrorBoundaryStore;
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
              style: 'display:none',
            },
            null,
            /*#__PURE__*/ _jsxSorted(
              SSRErrorFallbackRenderer,
              { boundaryId, store, deliverLate },
              null,
              null,
              1,
              null
            ),
            1,
            null
          )
        );
      }
    )
  : null!;
