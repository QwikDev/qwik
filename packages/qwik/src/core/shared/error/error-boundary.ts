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

// `!== undefined` so a thrown falsy value still shows the fallback.
const _ebContentStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'none' : 'contents',
});
const _ebContentStyle_str = '{display:p0.error!==undefined?"none":"contents"}';
const _ebFallbackStyle = (store: ErrorBoundaryStore) => ({
  display: store.error !== undefined ? 'contents' : 'none',
});
const _ebFallbackStyle_str = '{display:p0.error!==undefined?"contents":"none"}';

const buildLastResortFallback = (): JSXOutput =>
  /*#__PURE__*/ _jsxSorted('div', { role: 'alert' }, null, 'Something went wrong.', 0, null);

const renderFallbackOrLastResort = (
  fallbackQrl: QRL<(error: unknown, reset: QRL<() => void>) => JSXOutput>,
  error: unknown,
  reset: QRL<() => void>
): JSXOutput | Promise<JSXOutput> => {
  const rendered = fallbackQrl(error, reset) as JSXOutput | Promise<JSXOutput>;
  if (rendered && typeof (rendered as Promise<JSXOutput>).then === 'function') {
    return (rendered as Promise<JSXOutput>).catch((err) => {
      // Resolved means loaded-then-threw: escalate; else chunk failure.
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
  const invokeCtx = tryGetInvokeContext();
  const host = invokeCtx?.$hostElement$;
  // Raw target, not proxy, so this never subscribes to `boundaryId`.
  const container = invokeCtx?.$container$;
  if (container && (getStoreTarget(store) ?? store).boundaryId === undefined) {
    store.boundaryId = getNextUniqueIndex(container);
  }
  const reset = /*#__PURE__*/ inlinedQrl(errorBoundaryReset, '_ebR', [host]);
  // Fresh closures so `noSerialize` taints these mirrors, not the prop QRLs.
  const fallbackQrl = props.fallback$;
  store.$fallback$ = noSerialize((error: unknown) => fallbackQrl(error, reset));
  const onErrorQrl = props.onError$;
  store.$onError$ = onErrorQrl
    ? noSerialize((error: unknown, info: ErrorBoundaryInfo) => onErrorQrl(error, info))
    : undefined;

  const isServerEnv = qTest ? isServerPlatform() : !isBrowser;
  if (__EXPERIMENTAL__.errorBoundary && isServerEnv) {
    // Projection owner under a plain key; prod drops `$`-prefixed keys.
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
