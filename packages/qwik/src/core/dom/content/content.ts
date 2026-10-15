import type { SsrContentContext } from '../../ssr/output';
import { Brand, brandClass } from '../../shared/utils/brand';
import { isServer } from '@qwik.dev/core/build';
import type { QRL } from '../../shared/qrl/qrl.public';
import type { FunctionComponent, JSXOutput } from '../../shared/jsx/types/jsx-node';
import {
  isPromise,
  thenInLifetime,
  retryInLifetime,
  maybeThen,
  promiseAll,
  retryOnPromise,
  safeCall,
} from '../../shared/utils/promises';
import type { ValueOrPromise } from '../../shared/utils/types';
import { SubscriberFlags } from '../../reactive/flags';
import type { Source } from '../../reactive/source';
import { runWithCollector } from '../../reactive/tracking';
import type { ContainerContext } from '../../runtime/container-context';
import {
  getActiveInvokeContextOrNull,
  invoke,
  invokeApply,
  newChildInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import {
  disposeOwner,
  getOrCreateContextOwner,
  registerSubscriberToOwner,
  type Owner,
} from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import { registerPendingBoundary } from './pending-boundary';
import { handleError } from './catch-boundary';
import {
  SubscriberKind,
  type ContentSubscriber,
  type SsrContentSubscriber,
} from '../../runtime/subscriber';
import { escapeHTML } from '../../shared/utils/character-escaping';
import { EMPTY_NODES } from '../../utils/consts';
import type { RevealGroup } from './reveal';
import { toNodes, type MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../../utils/qrl';
import { isQrl } from '../../shared/qrl/qrl-utils';
import { ownSsrOutput, resolveSsrOutput, type SsrOutput } from '../../ssr/output';
import { replaceContent, prepareProjectionRanges } from '../range/range';
import { reapplyUseOnContexts } from '../../runtime/use-on';
import type { BranchRange } from '../branch/branch';
import { isSubscriberDisposed } from '../../runtime/subscriber';

export type ContentOutput = MaybeNodeOutput | string | number | bigint | boolean;
export type ContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<ContentOutput>;
export type SsrContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<SsrOutput>;
type PendingContentFn = (ctx: ContainerContext) => ValueOrPromise<MaybeNodeOutput>;

/** @public */
export interface PendingProps {
  readonly fallback$?: QRL<() => JSXOutput>;
  readonly delay?: number;
}

/** @public */
export const Pending: FunctionComponent<PendingProps & { children?: JSXOutput }> = () => null;

/**
 * A child value the compiler could not classify: exactly what it would have emitted had it known
 * the shape — a compiled JSX closure renders, empty values vanish, everything else is text.
 */
export const renderSsrDynamicContent = (
  value: unknown,
  ctx?: SsrContentContext,
  invokeContext = getActiveInvokeContextOrNull()
): ValueOrPromise<SsrOutput> =>
  maybeThen(value, (v) =>
    Array.isArray(v)
      ? promiseAll(Array.from(v, (child) => renderSsrDynamicContent(child, ctx, invokeContext)))
      : typeof v === 'function'
        ? // a callback may hand back another compiled JSX value instead of output
          maybeThen(
            invoke(invokeContext, v as (ctx?: SsrContentContext) => unknown, ctx),
            (output) =>
              isQrl(output)
                ? renderSsrDynamicContent(output, ctx, invokeContext)
                : (output as SsrOutput)
          )
        : v == null || v === true || v === false
          ? ''
          : escapeHTML(String(v))
  );

/** The client peer of {@link renderSsrDynamicContent}: nodes instead of bytes. */
export const createDynamicContent = (
  value: unknown,
  ctx: ContainerContext,
  invokeContext = getActiveInvokeContextOrNull()
): ValueOrPromise<readonly Node[]> =>
  maybeThen(value, (v) =>
    Array.isArray(v)
      ? maybeThen(
          promiseAll(Array.from(v, (child) => createDynamicContent(child, ctx, invokeContext))),
          (children) => children.flat()
        )
      : typeof v === 'function'
        ? maybeThen(
            invoke(invokeContext, v as (ctx: ContainerContext) => unknown, ctx),
            (output) =>
              isQrl(output)
                ? createDynamicContent(output, ctx, invokeContext)
                : toNodes(output as MaybeNodeOutput)
          )
        : v == null || v === true || v === false
          ? EMPTY_NODES
          : [ctx.document.createTextNode(String(v))]
  );

/** Content results are user values, so they must never reach the stream as markup. */
export function escapeSsrContent(output: ContentOutput): string {
  switch (typeof output) {
    case 'string':
    case 'number':
    case 'bigint':
      return escapeHTML(String(output));
    default:
      return '';
  }
}

function normalizeContentOutput(document: Document, output: ContentOutput): MaybeNodeOutput {
  switch (typeof output) {
    case 'string':
    case 'number':
    case 'bigint':
      return document.createTextNode(String(output));
    case 'boolean':
      return null;
    case 'function':
      // a hoisted JSX closure delivered as a value renders in place
      return normalizeContentOutput(document, (output as () => ContentOutput)());
    default:
      return output;
  }
}

export class ContentBlock<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null = null;
  private committed: boolean;
  private generation = 0;
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
    readonly contextArg = false,
    committed = false
  ) {
    this.committed = committed;
  }

  run(subscription: ContentSubscription<TArgs>): ValueOrPromise<readonly Node[]> {
    const generation = this.generation;
    return maybeThen(
      prepareProjectionRanges(this.container, this.start, this.end, this.currentOwner),
      () => (generation === this.generation ? this.runPrepared(subscription) : EMPTY_NODES)
    );
  }

  private runPrepared(subscription: ContentSubscription<TArgs>): ValueOrPromise<readonly Node[]> {
    const requestedGeneration = this.generation;
    return maybeThen(getFunctionOrResolve(this.fn, this.container), (fn) => {
      if (isSubscriberDisposed(subscription) || requestedGeneration !== this.generation) {
        return EMPTY_NODES;
      }
      const invokeContext = newChildInvokeContext(this.invokeContext, {
        ownerHost: subscription.owner,
        container: this.container,
      });
      if (subscription instanceof PendingContentSubscription) {
        registerPendingBoundary(getOrCreateContextOwner(invokeContext)!, subscription);
      }
      subscription.registerRenderBoundary(invokeContext);
      const generation = ++this.generation;
      this.pendingContext = invokeContext;
      const onError = (error: unknown) => {
        if (isSubscriberDisposed(subscription) || generation !== this.generation) {
          return EMPTY_NODES;
        }
        let handled: ValueOrPromise<void>;
        try {
          handled = handleError(invokeContext.owner ?? subscription.owner, error);
        } finally {
          if (this.pendingContext === invokeContext) {
            this.pendingContext = null;
          }
          if (invokeContext.owner !== null) {
            disposeOwner(invokeContext.owner);
            invokeContext.owner = null;
          }
        }
        return maybeThen(handled, () => EMPTY_NODES);
      };
      return safeCall(
        () =>
          retryOnPromise(() => {
            if (isSubscriberDisposed(subscription) || generation !== this.generation) {
              return EMPTY_NODES;
            }
            return runWithCollector(subscription, () =>
              invokeApply(
                invokeContext,
                fn as (...args: unknown[]) => ValueOrPromise<ContentOutput>,
                this.contextArg ? [this.container, ...this.args] : this.args
              )
            );
          }),
        (output) => {
          try {
            if (this.pendingContext === invokeContext) {
              this.pendingContext = null;
            }
            if (isSubscriberDisposed(subscription) || generation !== this.generation) {
              if (invokeContext.owner !== null) {
                disposeOwner(invokeContext.owner);
                invokeContext.owner = null;
              }
              return EMPTY_NODES;
            }
            return this.commit(invokeContext, output);
          } catch (error) {
            return onError(error);
          }
        },
        onError
      );
    });
  }

  dispose(): void {
    this.generation++;
    const owner = this.currentOwner;
    this.currentOwner = null;
    const pendingContext = this.pendingContext;
    this.pendingContext = null;
    try {
      if (pendingContext !== null && pendingContext.owner !== null) {
        disposeOwner(pendingContext.owner);
        pendingContext.owner = null;
      }
    } finally {
      replaceContent(this, EMPTY_NODES, owner, true);
    }
  }

  private commit(invokeContext: RuntimeInvokeContext, output: ContentOutput): readonly Node[] {
    const previousOwner = this.currentOwner;
    // Expression segments may return primitives; SSR emits them as text.
    output = normalizeContentOutput(this.document, output);
    const nodes = toNodes(
      this.useOnRoot && this.committed
        ? reapplyUseOnContexts(output, this.invokeContext, this.document)
        : output
    );
    replaceContent(this, nodes, previousOwner, true);
    this.committed = true;
    // Deferred content claims the owner after this commit, so materialize it now or lose the handle.
    this.currentOwner = getOrCreateContextOwner(invokeContext);
    return nodes;
  }
}

export class ContentSubscription<TArgs extends unknown[] = unknown[]> implements ContentSubscriber {
  readonly kind = SubscriberKind.Content;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;

  constructor(
    public block: ContentBlock<TArgs>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  registerRenderBoundary(_invokeContext: RuntimeInvokeContext): void {}

  run(): ValueOrPromise<readonly Node[]> {
    if (isSubscriberDisposed(this)) {
      return EMPTY_NODES;
    }
    return safeCall(
      () => this.block.run(this),
      (nodes) => nodes,
      (error) => maybeThen(handleError(this.owner, error), () => EMPTY_NODES)
    );
  }

  dispose(): void {
    // a root that was retired before inflation never got its block
    this.block.dispose();
  }
}

export class PendingContentSubscription<
  TArgs extends unknown[] = unknown[],
> extends ContentSubscription<TArgs> {
  pendingWork: Promise<unknown>[] | null = null;
  suspend: (pending: Promise<unknown>, shouldShowFallback?: boolean) => void = (pending) => {
    (this.pendingWork ??= []).push(pending);
  };
}

export function createContentBlock<TArgs extends unknown[]>(
  ctx: ContainerContext,
  start: Comment,
  end: Comment,
  args: TArgs,
  fn: ContentFn<TArgs> | QRL<ContentFn<TArgs>>,
  useOnRoot = false,
  contextArg = false
): ContentSubscription<TArgs> {
  const block = new ContentBlock(
    ctx.document,
    start,
    end,
    args,
    fn,
    getActiveInvokeContextOrNull(),
    ctx,
    useOnRoot,
    contextArg
  );
  return registerSubscriberToOwner(new ContentSubscription(block, ctx.scheduler));
}

export function createPending(
  ctx: ContainerContext,
  range: BranchRange,
  contentQrl: QRL<PendingContentFn>,
  fallbackQrl?: QRL<PendingContentFn>,
  delay = 0,
  group?: RevealGroup,
  index = 0
): PendingContentSubscription<[]> {
  const block = new ContentBlock(
    ctx.document,
    range.start,
    range.end,
    [],
    contentQrl as QRL<ContentFn<[]>>,
    getActiveInvokeContextOrNull(),
    ctx,
    false,
    true
  );
  const subscription = registerSubscriberToOwner(
    new PendingContentSubscription(block, ctx.scheduler)
  );
  attachPending(ctx, range, subscription, subscription.run(), fallbackQrl, delay, group, index);
  return subscription;
}

export function attachPending(
  ctx: ContainerContext,
  range: BranchRange,
  subscription: PendingContentSubscription,
  content: ValueOrPromise<readonly Node[]>,
  fallbackQrl?: QRL<PendingContentFn>,
  delay = 0,
  group?: RevealGroup,
  index = 0
): void {
  // committed content may still have to wait for its reveal group
  const holdForReveal = (nodes: readonly Node[]) => {
    if (group === undefined) {
      return;
    }
    group.resolve(index);
    if (group.canReveal(index) || isSubscriberDisposed(subscription)) {
      return;
    }
    range.replace(EMPTY_NODES);
    group.whenRevealable(index, () => {
      if (!isSubscriberDisposed(subscription)) {
        range.replace(nodes);
      }
    });
  };
  let hasCommittedContent = false;
  if (!isPromise(content)) {
    hasCommittedContent = true;
    holdForReveal(content);
  }
  let isPending = !hasCommittedContent;
  let nestedPending = 0;
  let preservedContent: DocumentFragment | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fallbackContext: RuntimeInvokeContext | null = null;
  const disposeFallback = () => {
    const context = fallbackContext;
    fallbackContext = null;
    const owner = context?.owner ?? null;
    if (context !== null) {
      context.owner = null;
    }
    if (preservedContent !== null) {
      const content = preservedContent;
      preservedContent = null;
      replaceContent(
        range,
        isSubscriberDisposed(subscription) ? EMPTY_NODES : [content],
        owner,
        true
      );
    } else if (owner !== null) {
      if (subscription.block.currentOwner === owner) {
        subscription.block.currentOwner = null;
        replaceContent(range, EMPTY_NODES, owner, true);
      } else {
        disposeOwner(owner);
      }
    }
  };
  const finish = () => {
    isPending = false;
    clearTimeout(timer);
    disposeFallback();
  };
  const showFallback = () => {
    if (!isPending || isSubscriberDisposed(subscription) || fallbackQrl === undefined) {
      finish();
      return;
    }
    if (group !== undefined && !group.mayShowFallback(index)) {
      // a collapsed group hides even the fallback until the order allows it
      group.whenRevealable(index, showFallback);
      return;
    }
    const invokeContext = (fallbackContext = newChildInvokeContext(
      subscription.block.invokeContext,
      { ownerHost: subscription.owner, container: ctx }
    ));
    const work = safeCall(
      () =>
        maybeThen(getFunctionOrResolve(fallbackQrl, ctx), (fallback) => {
          if (fallbackContext !== invokeContext) {
            return;
          }
          if (isSubscriberDisposed(subscription)) {
            finish();
            return;
          }
          const output = invoke(invokeContext, fallback, ctx);
          // The fallback may still be rendering, so materialize the owner instead of reading it.
          if (!hasCommittedContent) {
            subscription.block.currentOwner = getOrCreateContextOwner(invokeContext);
          }
          return maybeThen(output, (output) => {
            if (fallbackContext !== invokeContext) {
              return;
            }
            if (isSubscriberDisposed(subscription)) {
              finish();
              return;
            }
            if (hasCommittedContent) {
              const fragment = ctx.document.createDocumentFragment();
              while (range.start.nextSibling !== range.end) {
                fragment.appendChild(range.start.nextSibling!);
              }
              preservedContent = fragment;
            }
            replaceContent(range, toNodes(output), subscription.block.currentOwner, false);
          });
        }),
      () => {},
      (error) => {
        if (fallbackContext !== invokeContext || isSubscriberDisposed(subscription)) {
          return;
        }
        const owner = invokeContext.owner ?? subscription.owner;
        try {
          return handleError(owner, error);
        } finally {
          disposeFallback();
        }
      }
    );
    ctx.scheduler.waitFor(work, subscription.owner);
  };

  subscription.suspend = (pending, shouldShowFallback = true) => {
    nestedPending++;
    if (shouldShowFallback && !isPending) {
      isPending = true;
      if (fallbackQrl !== undefined && delay > 0) {
        timer = setTimeout(showFallback, delay);
      } else if (fallbackQrl !== undefined) {
        showFallback();
      }
    }
    pending.then(
      () => {
        if (--nestedPending === 0) {
          finish();
        }
      },
      (error) => {
        finish();
        group?.resolve(index);
        subscription.block.dispose();
        ctx.scheduler.waitFor(Promise.reject(error));
      }
    );
  };

  const pendingWork = subscription.pendingWork;
  subscription.pendingWork = null;
  if (pendingWork !== null) {
    for (let i = 0; i < pendingWork.length; i++) {
      subscription.suspend(pendingWork[i]);
    }
  }

  if (!isPromise(content)) {
    if (subscription.block.currentOwner !== null) {
      registerPendingBoundary(subscription.block.currentOwner, subscription);
    }
    return;
  }

  if (fallbackQrl !== undefined && delay > 0) {
    timer = setTimeout(showFallback, delay);
  } else if (fallbackQrl !== undefined) {
    showFallback();
  }
  content.then(
    (nodes) => {
      finish();
      hasCommittedContent = true;
      holdForReveal(nodes);
      if (subscription.block.currentOwner !== null) {
        registerPendingBoundary(subscription.block.currentOwner, subscription);
      }
    },
    (error) => {
      finish();
      group?.resolve(index);
      subscription.block.dispose();
      // Only the rejection goes to the scheduler; awaiting the content would block the fallback.
      ctx.scheduler.waitFor(Promise.reject(error));
    }
  );
}

export class SSRContent<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null = null;
  isPending = true;
  private renderContext?: RuntimeInvokeContext;
  declare currentSubscription?: SSRContentSubscription<TArgs>;
  private isDisposed = false;

  get isCancelled(): boolean {
    return this.isDisposed;
  }

  get pendingOwner(): Owner | null {
    return this.renderContext?.owner ?? null;
  }

  constructor(
    readonly rangeId: number,
    readonly args: TArgs,
    readonly qrl: QRL<SsrContentFn<TArgs>>,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: SsrContentContext,
    readonly useOnRoot = false,
    readonly contextArg = false
  ) {}

  run(
    onSubscription?: (subscription: SSRContentSubscription<TArgs>) => void,
    suppliedSubscription?: SSRContentSubscription<TArgs>
  ): ValueOrPromise<SsrOutput> {
    const subscription = registerSubscriberToOwner(
      suppliedSubscription ?? new SSRContentSubscription<TArgs>(this)
    );
    this.isDisposed = false;
    this.isPending = true;
    this.currentSubscription = subscription;
    onSubscription?.(subscription);
    if (this.isDisposed || isSubscriberDisposed(subscription)) {
      return '';
    }
    return thenInLifetime(
      subscription,
      getFunctionOrResolve(this.qrl, this.container),
      (fn) => {
        const invokeContext = newChildInvokeContext(this.invokeContext, {
          ownerHost: subscription.owner,
          container: this.container,
        });
        subscription.registerRenderBoundary(invokeContext);
        this.renderContext = invokeContext;
        const onError = (error: unknown): ValueOrPromise<string> => {
          let handled: ValueOrPromise<void>;
          try {
            handled = handleError(invokeContext.owner ?? subscription.owner, error);
          } finally {
            this.dispose();
          }
          return maybeThen(handled, () => '');
        };
        let output: ValueOrPromise<SsrOutput>;
        try {
          output = retryInLifetime(
            subscription,
            () =>
              runWithCollector(subscription, () =>
                invokeApply(
                  invokeContext,
                  fn as (...args: unknown[]) => ValueOrPromise<SsrOutput>,
                  this.contextArg ? [this.container, ...this.args] : this.args
                )
              ),
            ''
          );
        } catch (error) {
          return onError(error);
        }
        const finish = (output: SsrOutput): SsrOutput => {
          try {
            this.isPending = false;
            this.renderContext = undefined;
            if (isSubscriberDisposed(subscription)) {
              if (invokeContext.owner !== null) {
                disposeOwner(invokeContext.owner);
                invokeContext.owner = null;
              }
              return '';
            }
            this.currentOwner = invokeContext.owner;
            return ownSsrOutput(output, invokeContext, subscription);
          } catch (error) {
            return onError(error);
          }
        };
        return thenInLifetime(
          subscription,
          output,
          (output) => {
            let resolved: ValueOrPromise<SsrOutput>;
            try {
              resolved = resolveSsrOutput(output, (value, fulfilled) =>
                thenInLifetime(subscription, value, fulfilled, '')
              );
            } catch (error) {
              return onError(error);
            }
            return thenInLifetime(subscription, resolved, finish, '', onError);
          },
          '',
          onError
        );
      },
      ''
    );
  }
  dispose(): void {
    this.isDisposed = true;
    this.isPending = false;
    const owner = this.currentOwner ?? this.pendingOwner;
    this.currentOwner = null;
    if (this.renderContext !== undefined) {
      this.renderContext.owner = null;
    }
    this.renderContext = undefined;
    if (owner !== null) {
      disposeOwner(owner);
    }
  }
}

export class SSRContentSubscription<
  TArgs extends unknown[] = unknown[],
> implements SsrContentSubscriber {
  readonly kind = SubscriberKind.Content;
  readonly scheduler = null;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;

  constructor(public content: SSRContent<TArgs>) {}

  get isCancelled(): boolean {
    return (
      isSubscriberDisposed(this) ||
      this.content.isCancelled ||
      this.content.currentSubscription !== this
    );
  }

  registerRenderBoundary(_invokeContext: RuntimeInvokeContext): void {}

  dispose(): void {
    this.content.dispose();
  }
}

export class SSRPendingContentSubscription extends SSRContentSubscription<[]> {
  constructor(
    content: SSRContent<[]>,
    readonly fallbackQrl: unknown,
    readonly delay: number
  ) {
    super(content);
  }
}

export function renderSsrContent<TArgs extends unknown[]>(
  ctx: SsrContentContext,
  rangeId: number,
  args: TArgs,
  qrl: QRL<SsrContentFn<TArgs>>,
  useOnRoot = false,
  contextArg = false,
  onSubscription?: (subscription: SSRContentSubscription<TArgs>) => void
): ValueOrPromise<SsrOutput> {
  return new SSRContent(
    rangeId,
    args,
    qrl,
    getActiveInvokeContextOrNull(),
    ctx,
    useOnRoot,
    contextArg
  ).run(onSubscription);
}

isServer && brandClass(SSRContentSubscription, Brand.SsrContentSubscription);
isServer && brandClass(SSRPendingContentSubscription, Brand.SsrPendingContentSubscription);
