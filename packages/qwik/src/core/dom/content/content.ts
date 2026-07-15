import type { QRL } from '../../shared/qrl/qrl.public';
import { maybeThen, retryOnPromise, safeCall } from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { SubscriberFlags } from '../../reactive/flags';
import type { Source } from '../../reactive/source';
import { runWithCollector } from '../../reactive/tracking';
import type { ContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import { disposeOwner, registerSubscriberToOwner, type Owner } from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import {
  SubscriberKind,
  type ContentSubscriber,
  type SsrContentSubscriber,
} from '../../runtime/subscriber';
import { EMPTY_NODES } from '../../utils/consts';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../../utils/qrl';
import type { SsrOutput } from '../../ssr/output';
import { createContentRange, replaceRange } from '../range/range';
import { reapplyUseOnContexts } from '../../runtime/use-on';

type ContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<MaybeNodeOutput>;
type SsrContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<SsrOutput>;

export class ContentBlock<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null = null;
  private readonly range: Range;
  private committed: boolean;
  private pendingContext: RuntimeInvokeContext | null = null;

  constructor(
    readonly document: Document,
    readonly start: Comment,
    readonly end: Comment,
    readonly args: TArgs,
    readonly fn: ContentFn<TArgs> | QRL<ContentFn<TArgs>>,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: ContainerContext,
    readonly useOnRoot = false,
    committed = false
  ) {
    this.range = createContentRange(document, start, end);
    this.committed = committed;
  }

  run(subscription: ContentSubscription<TArgs>): ValueOrPromise<readonly Node[]> {
    return maybeThen(getFunctionOrResolve(this.fn, this.container), (fn) => {
      if (subscription.owner === null) {
        return EMPTY_NODES;
      }
      const invokeContext = newChildInvokeContext(this.invokeContext, {
        ownerHost: subscription.owner,
        container: this.container,
      });
      this.pendingContext = invokeContext;
      return safeCall(
        () =>
          retryOnPromise(() =>
            runWithCollector(subscription, () => invoke(invokeContext, fn, ...this.args))
          ),
        (output) => {
          if (this.pendingContext === invokeContext) {
            this.pendingContext = null;
          }
          if (subscription.owner === null) {
            if (invokeContext.owner !== null) {
              disposeOwner(invokeContext.owner);
              invokeContext.owner = null;
            }
            return EMPTY_NODES;
          }
          return this.commit(invokeContext, output);
        },
        (error) => {
          if (this.pendingContext === invokeContext) {
            this.pendingContext = null;
          }
          if (invokeContext.owner !== null) {
            disposeOwner(invokeContext.owner);
            invokeContext.owner = null;
          }
          throw error;
        }
      );
    });
  }

  dispose(): void {
    const owner = this.currentOwner;
    this.currentOwner = null;
    if (owner !== null) {
      disposeOwner(owner);
    }
    const pendingContext = this.pendingContext;
    this.pendingContext = null;
    if (pendingContext !== null && pendingContext.owner !== null) {
      disposeOwner(pendingContext.owner);
      pendingContext.owner = null;
    }
    replaceRange(this.document, this.start, this.end, this.range, EMPTY_NODES);
  }

  private commit(invokeContext: RuntimeInvokeContext, output: MaybeNodeOutput): readonly Node[] {
    const previousOwner = this.currentOwner;
    const nodes = toNodes(
      this.useOnRoot && this.committed
        ? reapplyUseOnContexts(output, this.invokeContext, this.document)
        : output
    );
    replaceRange(this.document, this.start, this.end, this.range, nodes);
    this.committed = true;
    this.currentOwner = invokeContext.owner;
    if (previousOwner !== null) {
      disposeOwner(previousOwner);
    }
    return nodes;
  }
}

export class ContentSubscription<TArgs extends unknown[] = unknown[]> implements ContentSubscriber {
  readonly kind = SubscriberKind.Content;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly block: ContentBlock<TArgs>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<readonly Node[]> {
    return this.owner === null ? EMPTY_NODES : this.block.run(this);
  }
}

export function createContentBlock<TArgs extends unknown[]>(
  ctx: ContainerContext,
  start: Comment,
  end: Comment,
  args: TArgs,
  fn: ContentFn<TArgs> | QRL<ContentFn<TArgs>>,
  useOnRoot = false
): ContentSubscription<TArgs> {
  const block = new ContentBlock(
    ctx.document,
    start,
    end,
    args,
    fn,
    getActiveInvokeContextOrNull(),
    ctx,
    useOnRoot
  );
  return registerSubscriberToOwner(new ContentSubscription(block, ctx.scheduler));
}

export class SSRContent<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null = null;

  constructor(
    readonly rangeId: number,
    readonly args: TArgs,
    readonly qrl: QRL<SsrContentFn<TArgs>>,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: ContainerContext,
    readonly useOnRoot = false
  ) {}

  run(): ValueOrPromise<SsrOutput> {
    const subscription = registerSubscriberToOwner(new SSRContentSubscription<TArgs>(this));
    return maybeThen(getFunctionOrResolve(this.qrl, this.container), (fn) => {
      const invokeContext = newChildInvokeContext(this.invokeContext, {
        ownerHost: subscription.owner,
        container: this.container,
      });
      return safeCall(
        () =>
          retryOnPromise(() =>
            runWithCollector(subscription, () => invoke(invokeContext, fn, ...this.args))
          ),
        (output) => {
          this.currentOwner = invokeContext.owner;
          return output;
        },
        (error) => {
          if (invokeContext.owner !== null) {
            disposeOwner(invokeContext.owner);
            invokeContext.owner = null;
          }
          throw error;
        }
      );
    });
  }
}

export class SSRContentSubscription<
  TArgs extends unknown[] = unknown[],
> implements SsrContentSubscriber {
  readonly kind = SubscriberKind.Content;
  owner: Owner | null = null;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly content: SSRContent<TArgs>) {}
}

export function renderSsrContent<TArgs extends unknown[]>(
  ctx: ContainerContext,
  rangeId: number,
  args: TArgs,
  qrl: QRL<SsrContentFn<TArgs>>,
  useOnRoot = false
): ValueOrPromise<SsrOutput> {
  return new SSRContent(rangeId, args, qrl, getActiveInvokeContextOrNull(), ctx, useOnRoot).run();
}
