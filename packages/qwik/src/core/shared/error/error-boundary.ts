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
import { _fnSignal } from '../qrl/inlined-fn';
import { inlinedQrl } from '../qrl/qrl';
import type { QRL } from '../qrl/qrl.public';
import { noSerialize } from '../serdes/verify';
import { QErrorContentHost } from '../utils/markers';
import { qTest } from '../utils/qdev';
import { tryGetInvokeContext } from '../../use/use-core';
import { useLexicalScope } from '../../use/use-lexical-scope.public';
import { getNextUniqueIndex } from '../utils/unique-index-generator';
import { getStoreTarget } from '../../reactive-primitives/impl/store';
import { redactBoundaryErrorForDisplay, type ErrorBoundaryStore } from './error-handling';

/** Minimal SSR frame shape: the projection frame holds the component that authored the children. */
type ISsrComponentFrameLike = {
  projectionComponentFrame?: { componentNode?: unknown } | null;
};

/** Structured metadata about a caught error, passed to `onError$`. @public */
export interface ErrorBoundaryInfo {
  /** Where the caught error originated. */
  phase: 'render' | 'task' | 'event' | 'async-generator' | 'async-signal';
  /** Stable id of the boundary that caught it. */
  boundaryId: string;
}

/** @public */
export interface ErrorBoundaryProps {
  /**
   * Rendered when a descendant throws; receives `(error, reset)`. Add a live region for
   * screen-reader announcement. Invoke `reset` wrapped in a handler — `onClick$={() => reset()}`,
   * not `onClick$={reset}` — so it stays wired in a streamed fallback after resume.
   */
  fallback$: QRL<(error: unknown, reset: QRL<() => void>) => JSXOutput>;
  /** Side-effect fired once per caught error; never affects rendering. */
  onError$?: QRL<(error: unknown, info: ErrorBoundaryInfo) => void>;
}

/**
 * `reset` handler: clears the error and re-attempts the boundary's children.
 *
 * @internal
 */
export const errorBoundaryReset = (): void => {
  // The render-time boundary host; the reset-time host is the streamed fallback's, which doesn't chain.
  const [host] = useLexicalScope<[unknown]>();
  const container = tryGetInvokeContext()?.$container$ as
    | { resetErrorBoundary?: (host: unknown) => void }
    | undefined;
  if (container?.resetErrorBoundary && host) {
    container.resetErrorBoundary(host);
  }
};

// Core isn't optimizer-processed, so ErrorBoundary is hand-built with `inlinedQrl`.

// `!== undefined`, not truthiness, so a thrown falsy value still shows the fallback.
const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error!==undefined?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error!==undefined?"contents":"none"}';

// Core-bundled (non-lazy, no QRL) last-resort fallback for when the `fallback$` chunk itself fails
// to load. `role="alert"` because it's the one fallback the author can't annotate.
const buildLastResortFallback = (): JSXOutput =>
  /*#__PURE__*/ _jsxSorted('div', { role: 'alert' }, null, 'Something went wrong.', 0, null);

/**
 * Invoke the `fallback$` QRL, but if its chunk fails to LOAD (the QRL rejects without ever
 * resolving) render the last-resort node instead of nothing. A fallback that loaded and then THREW
 * still escalates to the parent (its rejection is re-thrown), preserving existing behavior.
 */
const renderFallbackOrLastResort = (
  fallbackQrl: QRL<(error: unknown, reset: QRL<() => void>) => JSXOutput>,
  error: unknown,
  reset: QRL<() => void>
): JSXOutput | Promise<JSXOutput> => {
  const rendered = fallbackQrl(error, reset) as JSXOutput | Promise<JSXOutput>;
  if (rendered && typeof (rendered as Promise<JSXOutput>).then === 'function') {
    return (rendered as Promise<JSXOutput>).catch((err) => {
      // Loaded then threw → the QRL resolved; escalate. Never loaded → chunk failure; last resort.
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
        style: /*#__PURE__*/ _fnSignal(_ebContentStyle, [store], _ebContentStyle_str),
      },
      null,
      /*#__PURE__*/ _jsxSorted(Slot, null, null, null, 0, null),
      1,
      null
    ),
    // The host marker + delivery mode are chosen at drain time, when an in-place throw is known.
    /*#__PURE__*/ _jsxSorted(
      SSRErrorFallbackHost,
      {
        boundaryId,
        store,
        hostStyle: /*#__PURE__*/ _fnSignal(_ebFallbackStyle, [store], _ebFallbackStyle_str),
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
  // Capture the boundary host so a streamed fallback's `reset()` can re-find the boundary.
  const invokeCtx = tryGetInvokeContext();
  const host = invokeCtx?.$hostElement$;
  // Stable id passed to `onError$` as `info.boundaryId`. A non-`$` field so it serializes for the
  // CSR-on-resume sink; minted on both server and client so pure-CSR boundaries also have one.
  // Read the raw target (not the proxy) so the component never subscribes to `boundaryId`.
  const container = invokeCtx?.$container$;
  if (container && (getStoreTarget(store) ?? store).boundaryId === undefined) {
    store.boundaryId = getNextUniqueIndex(container);
  }
  const reset = /*#__PURE__*/ inlinedQrl(errorBoundaryReset, '_ebR', [host]);
  // Server-only mirrors in fresh closures, so `noSerialize` taints them, not the serialized prop QRLs.
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: unknown) => fallbackQrl(error, reset));
  const onErrorQrl = props.onError$;
  store.$onError$ = onErrorQrl
    ? noSerialize((error: unknown, info: ErrorBoundaryInfo) => onErrorQrl(error, info))
    : undefined;

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    // Serialize the children's projection owner (the component that wrote `<ErrorBoundary>{children}`)
    // so a resumed `reset()` re-renders + re-executes them — NOT the EB's physical parent, which a
    // `<Slot>`-projecting wrapper sits between. The owning frame is the EB frame's projection frame.
    // `resetOwner` (not `$resetOwner$`): the prod build drops `$`-prefixed store keys.
    const ownerFrame = (
      invokeCtx?.$container$ as
        | { getComponentFrame?: (depth: number) => ISsrComponentFrameLike | null }
        | undefined
    )?.getComponentFrame?.(0);
    store.resetOwner =
      ownerFrame?.projectionComponentFrame?.componentNode ??
      (host as { parentComponent?: unknown } | undefined)?.parentComponent;
    return buildErrorBoundaryHosts(store);
  }

  if (store.error !== undefined) {
    // Client-side display redaction (prod) for parity with the SSR path; no-op in dev.
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

/** @public */
export const ErrorBoundary: Component<ErrorBoundaryProps> =
  /*#__PURE__*/ componentQrl<ErrorBoundaryProps>(
    /*#__PURE__*/ inlinedQrl(errorBoundaryCmp, '_ebC')
  );
