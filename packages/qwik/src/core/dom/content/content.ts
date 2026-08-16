import type { QRL } from '../../shared/qrl/qrl.public';
import type { FunctionComponent, JSXOutput } from '../../shared/jsx/types/jsx-node';
import { isPromise, maybeThen, retryOnPromise, safeCall } from '../../shared/utils/promises';
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
import { disposeOwner, registerSubscriberToOwner, type Owner } from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
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
import type { SsrOutput } from '../../ssr/output';
import { replaceRange } from '../range/range';
import { reapplyUseOnContexts } from '../../runtime/use-on';
import type { BranchRange } from '../branch/branch';

export type ContentOutput = MaybeNodeOutput | string | number | bigint | boolean;
type ContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<ContentOutput>;
type SsrContentFn<TArgs extends unknown[] = unknown[]> = (
  ...args: TArgs
) => ValueOrPromise<SsrOutput>;
type SuspenseContentFn = (ctx: ContainerContext) => ValueOrPromise<MaybeNodeOutput>;

/** @public */
export interface SuspenseProps {
  readonly fallback$?: QRL<() => JSXOutput>;
  readonly delay?: number;
}

/** @public */
export const Suspense: FunctionComponent<SuspenseProps & { children?: JSXOutput }> = () => null;

/**
 * A child value the compiler could not classify: exactly what it would have emitted had it known
 * the shape — a compiled JSX closure renders, empty values vanish, everything else is text.
 */
export const renderSsrDynamicContent = (value: unknown): ValueOrPromise<SsrOutput> =>
  maybeThen(value, (v) =>
    typeof v === 'function'
      ? (v as () => ValueOrPromise<SsrOutput>)()
      : v == null || v === true || v === false
        ? ''
        : escapeHTML(String(v))
  );

/** The client peer of {@link renderSsrDynamicContent}: nodes instead of bytes. */
export const createDynamicContent = (
  value: unknown,
  ctx: ContainerContext
): ValueOrPromise<readonly Node[]> =>
  maybeThen(value, (v) =>
    typeof v === 'function'
      ? maybeThen((v as (ctx: ContainerContext) => ValueOrPromise<MaybeNodeOutput>)(ctx), toNodes)
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
            runWithCollector(subscription, () =>
              invokeApply(
                invokeContext,
                fn as (...args: unknown[]) => ValueOrPromise<ContentOutput>,
                this.contextArg ? [this.container, ...this.args] : this.args
              )
            )
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
    replaceRange(this.document, this.start, this.end, EMPTY_NODES);
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
    replaceRange(this.document, this.start, this.end, nodes);
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

  constructor(
    readonly block: ContentBlock<TArgs>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<readonly Node[]> {
    return this.owner === null ? EMPTY_NODES : this.block.run(this);
  }

  dispose(): void {
    this.block.dispose();
  }
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

export function createSuspense(
  ctx: ContainerContext,
  range: BranchRange,
  contentQrl: QRL<SuspenseContentFn>,
  fallbackQrl?: QRL<SuspenseContentFn>,
  delay = 0,
  group?: RevealGroup,
  index = 0
): ContentSubscription<[]> {
  const subscription = createContentBlock(
    ctx,
    range.start,
    range.end,
    [],
    contentQrl as QRL<ContentFn<[]>>,
    false,
    true
  );
  const content = subscription.run();
  // committed content may still have to wait for its reveal group
  const holdForReveal = (nodes: readonly Node[]) => {
    if (group === undefined) {
      return;
    }
    group.resolve(index);
    if (group.canReveal(index) || subscription.owner === null) {
      return;
    }
    range.replace(EMPTY_NODES);
    group.whenRevealable(index, () => {
      if (subscription.owner !== null) {
        range.replace(nodes);
      }
    });
  };
  if (!isPromise(content)) {
    holdForReveal(content);
    return subscription;
  }
  let isPending = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let fallbackContext: RuntimeInvokeContext | null = null;
  const disposeFallback = () => {
    const context = fallbackContext;
    const owner = context?.owner;
    if (owner) {
      if (subscription.block.currentOwner === owner) {
        subscription.block.currentOwner = null;
      }
      disposeOwner(owner);
      context.owner = null;
    }
  };
  const finish = () => {
    isPending = false;
    clearTimeout(timer);
    disposeFallback();
  };
  const showFallback = () => {
    if (!isPending || subscription.owner === null || fallbackQrl === undefined) {
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
          if (!isPending || subscription.owner === null) {
            finish();
            return;
          }
          const output = invoke(invokeContext, fallback, ctx);
          subscription.block.currentOwner = invokeContext.owner;
          return maybeThen(output, (output) => {
            if (!isPending || subscription.owner === null) {
              finish();
              return;
            }
            range.replace(toNodes(output));
          });
        }),
      () => {},
      (error) => {
        disposeFallback();
        return Promise.reject(error);
      }
    );
    ctx.scheduler.waitFor(work);
  };

  if (fallbackQrl !== undefined && delay > 0) {
    timer = setTimeout(showFallback, delay);
  } else if (fallbackQrl !== undefined) {
    showFallback();
  }
  content.then(
    (nodes) => {
      finish();
      holdForReveal(nodes);
    },
    (error) => {
      finish();
      group?.resolve(index);
      subscription.block.dispose();
      // Only the rejection goes to the scheduler; awaiting the content would block the fallback.
      ctx.scheduler.waitFor(Promise.reject(error));
    }
  );
  return subscription;
}

export class SSRContent<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null = null;
  isPending = true;

  constructor(
    readonly rangeId: number,
    readonly args: TArgs,
    readonly qrl: QRL<SsrContentFn<TArgs>>,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: ContainerContext,
    readonly useOnRoot = false,
    readonly contextArg = false
  ) {}

  run(
    onSubscription?: (subscription: SSRContentSubscription<TArgs>) => void
  ): ValueOrPromise<SsrOutput> {
    const subscription = registerSubscriberToOwner(new SSRContentSubscription<TArgs>(this));
    onSubscription?.(subscription);
    return maybeThen(getFunctionOrResolve(this.qrl, this.container), (fn) => {
      const invokeContext = newChildInvokeContext(this.invokeContext, {
        ownerHost: subscription.owner,
        container: this.container,
      });
      return safeCall(
        () =>
          retryOnPromise(() =>
            runWithCollector(subscription, () =>
              invokeApply(
                invokeContext,
                fn as (...args: unknown[]) => ValueOrPromise<SsrOutput>,
                this.contextArg ? [this.container, ...this.args] : this.args
              )
            )
          ),
        (output) => {
          this.isPending = false;
          if (subscription.owner === null) {
            if (invokeContext.owner !== null) {
              disposeOwner(invokeContext.owner);
              invokeContext.owner = null;
            }
            return output;
          }
          this.currentOwner = invokeContext.owner;
          return output;
        },
        (error) => {
          this.isPending = false;
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
  readonly scheduler = null;
  owner: Owner | null = null;
  deps: Source[] | null = null;

  constructor(readonly content: SSRContent<TArgs>) {}

  dispose(): void {
    this.content.isPending = false;
    const owner = this.content.currentOwner;
    this.content.currentOwner = null;
    if (owner !== null) {
      disposeOwner(owner);
    }
  }
}

export function renderSsrContent<TArgs extends unknown[]>(
  ctx: ContainerContext,
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
