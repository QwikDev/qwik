import type { QRL } from '../../shared/qrl/qrl.public';
import { isPromise, maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { getActiveInvokeContextOrNull, invoke } from '../../runtime/invoke-context';
import type { SsrDeferredRange, SsrOutput } from '../../ssr/output';
import { renderSsrContent } from './content';
import type { RevealGroup } from './reveal';

/**
 * What the SSR streaming engine offers whoever wants to hold part of the document open. The engine
 * streams ranges and schedules lanes; why a range defers is none of its business.
 */
export interface SsrRangeHost {
  nextId(): number;
  addRoot(value: unknown): number;
  /** Wraps content in a range's document markers. */
  wrapRange(rangeId: number, content: SsrOutput): SsrOutput;
  /** A child scope: its work runs on its own lane and its ranges nest under `rangeId`. */
  createRangeScope(rangeId: number): SsrRangeScope;
  /** False under in-order rendering: the owner must await its content instead of deferring. */
  readonly canDefer: boolean;
}

export interface SsrRangeScope extends SsrRangeHost {
  /** Runs the work queued on this scope's lane. */
  flush(): ValueOrPromise<void>;
  /** Streams `range.output` in a later packet; the caller returns placeholder markup now. */
  defer(range: SsrDeferredRange, content: Promise<SsrOutput>): void;
  /** Lifts ranges nested in this scope up to its parent, for a scope that never defers. */
  reparentRanges(): void;
}

type SsrSuspenseRenderFn = (host: SsrRangeHost) => ValueOrPromise<SsrOutput>;

/**
 * Renders a Suspense boundary on the server: the content takes its own lane, and if it has not
 * settled by `delay` the fallback streams in its place until a later packet swaps it out.
 */
export function createSsrSuspense(
  host: SsrRangeHost,
  rangeId: number,
  contentQrl: QRL<SsrSuspenseRenderFn>,
  fallbackQrl?: QRL<SsrSuspenseRenderFn>,
  delay = 0,
  group?: RevealGroup,
  index = 0
): ValueOrPromise<SsrOutput> {
  const scope = host.createRangeScope(rangeId);
  let contentRoot: unknown;
  const rendered = renderSsrContent(
    scope as never,
    rangeId,
    [],
    contentQrl as never,
    false,
    true,
    (subscription) => (contentRoot = subscription)
  );
  const initialTasks = scope.flush();
  const drain = (output: SsrOutput) => maybeThen(scope.flush(), () => output);
  const content =
    isPromise(rendered) && isPromise(initialTasks)
      ? Promise.all([rendered, initialTasks]).then(([output]) => drain(output))
      : maybeThen(rendered, (output) => maybeThen(initialTasks, () => drain(output)));

  /** The boundary resolved in place, so it never occupies a reveal slot or a later packet. */
  const settleInline = (output: SsrOutput): SsrOutput => {
    group?.resolve(index);
    scope.reparentRanges();
    return host.wrapRange(rangeId, output);
  };
  if (!isPromise(content)) {
    return settleInline(content);
  }
  if (!host.canDefer) {
    return content.then((output) => {
      host.addRoot(contentRoot);
      return settleInline(output);
    });
  }

  // the fallback can render from a timer, where no invoke context is ambient
  const invokeContext = getActiveInvokeContextOrNull();
  const range: SsrDeferredRange = {
    id: rangeId,
    parentId: null,
    contentRoot,
    canEmit: () => group?.canReveal(index) ?? true,
    onEmitted: () => group?.resolve(index),
    onCancelled: () => group?.resolve(index),
  };
  const renderFallback = (): ValueOrPromise<SsrOutput> => {
    if (fallbackQrl === undefined || !(group?.mayShowFallback(index) ?? true)) {
      return host.wrapRange(rangeId, '');
    }
    const fallbackId = host.nextId();
    return invoke(invokeContext, () =>
      maybeThen(
        renderSsrContent(
          host as never,
          fallbackId,
          [],
          fallbackQrl as never,
          false,
          true,
          (subscription) => {
            range.placeholderRoot = subscription;
          }
        ),
        (fallback) => {
          host.addRoot(range.placeholderRoot);
          return host.wrapRange(rangeId, host.wrapRange(fallbackId, fallback));
        }
      )
    );
  };
  const deferContent = (): ValueOrPromise<SsrOutput> => {
    scope.defer(range, content);
    return renderFallback();
  };
  if (!(delay > 0)) {
    return deferContent();
  }
  // race the delay: content that beats it renders in place and no fallback is ever streamed
  return new Promise<SsrOutput>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve(deferContent());
    }, delay);
    content.then(
      (output) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          host.addRoot(contentRoot);
          resolve(settleInline(output));
        }
      },
      (error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(error);
        }
      }
    );
  });
}
