import type { QRL } from '../../shared/qrl/qrl.public';
import { isPromise, maybeThen } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { getActiveInvokeContextOrNull, invoke } from '../../runtime/invoke-context';
import { type SsrDeferredRange, type SsrOutput, type SsrRangeHost } from '../../ssr/output';
import { renderSsrContent, SSRContent, SSRPendingContentSubscription } from './content';
import { registerPendingBoundary } from './pending-boundary';
import type { RevealGroup } from './reveal';

type SsrPendingRenderFn = (host: SsrRangeHost) => ValueOrPromise<SsrOutput>;

/**
 * Renders a Pending boundary on the server: the content takes its own lane, and if it has not
 * settled by `delay` the fallback streams in its place until a later packet swaps it out.
 */
export function createSsrPending(
  host: SsrRangeHost,
  rangeId: number,
  contentQrl: QRL<SsrPendingRenderFn>,
  fallbackQrl?: QRL<SsrPendingRenderFn>,
  delay = 0,
  group?: RevealGroup,
  index = 0
): ValueOrPromise<SsrOutput> {
  const scope = host.createRangeScope(rangeId);
  const pendingContent = new SSRContent<[]>(
    rangeId,
    [],
    contentQrl as never,
    getActiveInvokeContextOrNull(),
    scope,
    false,
    true
  );
  const contentRoot = new SSRPendingContentSubscription(pendingContent, fallbackQrl ?? null, delay);
  const rendered = pendingContent.run(undefined, contentRoot);
  const initialTasks = scope.flush();
  const drain = (output: SsrOutput) =>
    maybeThen(scope.flush(), () => {
      const owner = contentRoot.content.currentOwner;
      if (owner !== null) {
        registerPendingBoundary(owner, contentRoot);
      }
      return output;
    });
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
          host,
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
