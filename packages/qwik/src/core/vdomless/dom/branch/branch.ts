import type { QRLInternal } from '../../../shared/qrl/qrl-class';
import type { QRL } from '../../../shared/qrl/qrl.public';
import { maybeThen } from '../../../shared/utils/promises';
import type { ValueOrPromise } from '../../../shared/utils/types';
import { SubscriberFlags } from '../../reactive/flags';
import type { Dependency } from '../../reactive/source';
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
  type BranchSubscriber,
  type SsrBranchSubscriber,
} from '../../runtime/subscriber';
import { EMPTY_NODES } from '../../utils/consts';
import { toNodes } from '../../utils/nodes';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../qrl';
import { createContentRange, replaceRange } from '../range/range';

type BranchConditionFn = () => boolean;
type BranchHandlerFn = (ctx: ContainerContext) => ValueOrPromise<MaybeNodeOutput>;
type SSRBranchHandlerFn = (ctx: ContainerContext, rangeId: number) => ValueOrPromise<string>;

/** BranchRange represents a range of nodes in the DOM that can be replaced with new nodes */
export class BranchRange {
  readonly nativeRange: Range;

  constructor(
    readonly document: Document,
    readonly start: Comment,
    readonly end: Comment
  ) {
    this.nativeRange = createContentRange(this.document, start, end);
  }

  replace(nodes: readonly Node[]): void {
    replaceRange(this.document, this.start, this.end, this.nativeRange, nodes);
  }
}

const enum BranchState {
  Then = 0,
  Else = 1,
}

export class Branch {
  currentOwner: Owner | null;

  constructor(
    readonly range: BranchRange,
    readonly conditionFn: BranchConditionFn | QRL<BranchConditionFn>,
    readonly thenFn: BranchHandlerFn | QRL<BranchHandlerFn>,
    readonly elseFn: BranchHandlerFn | QRL<BranchHandlerFn> | undefined,
    public currentBranch: BranchState | null,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: ContainerContext
  ) {
    this.currentOwner = null;
  }

  dispose(): void {
    const owner = this.currentOwner;
    this.currentOwner = null;
    this.currentBranch = null;

    if (owner !== null) {
      disposeOwner(owner);
    }

    this.range.replace(EMPTY_NODES);
  }
}

export class BranchSubscription implements BranchSubscriber {
  readonly kind = SubscriberKind.Branch;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly branch: Branch,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<void> {
    const conditionFn = getFunctionOrResolve(this.branch.conditionFn, this.branch.container);

    return maybeThen(conditionFn, (conditionFn) => {
      const trackedConditionFn = runWithCollector(this, () =>
        invoke(this.branch.invokeContext, conditionFn)
      );
      const nextBranch = trackedConditionFn ? BranchState.Then : BranchState.Else;
      if (this.branch.currentBranch === nextBranch) {
        return;
      }

      const owner = this.branch.currentOwner;
      this.branch.currentOwner = null;
      if (owner !== null) {
        disposeOwner(owner);
      }

      this.branch.currentBranch = nextBranch;

      const renderer = getFunctionOrResolve(
        trackedConditionFn ? this.branch.thenFn : this.branch.elseFn,
        this.branch.container
      );

      return maybeThen(renderer, (renderer) => {
        if (renderer === undefined) {
          this.branch.range.replace(EMPTY_NODES);
          return;
        }

        const newInvokeContext = newChildInvokeContext(this.branch.invokeContext, {
          ownerHost: this.owner,
          container: this.branch.container,
        });

        let nodes: ValueOrPromise<MaybeNodeOutput>;
        try {
          nodes = runWithCollector(null, () =>
            invoke(newInvokeContext, () => renderer(newInvokeContext.container!))
          );
        } catch (error) {
          if (newInvokeContext.owner !== null) {
            disposeOwner(newInvokeContext.owner);
            newInvokeContext.owner = null;
          }
          throw error;
        }

        return maybeThen(nodes, (nodes) => {
          this.branch.currentOwner = newInvokeContext.owner;
          this.branch.range.replace(toNodes(nodes));
        });
      });
    });
  }
}

export function createBranch(
  ctx: ContainerContext,
  branchRange: BranchRange,
  condition: BranchConditionFn | QRL<BranchConditionFn>,
  then: BranchHandlerFn | QRL<BranchHandlerFn>,
  elseFn?: BranchHandlerFn | QRL<BranchHandlerFn>
): BranchSubscriber {
  const branch = new Branch(
    branchRange,
    condition,
    then,
    elseFn,
    null,
    getActiveInvokeContextOrNull(),
    ctx
  );
  return registerSubscriberToOwner(new BranchSubscription(branch, ctx.scheduler));
}

// SSR

export class SSRBranch {
  currentOwner: Owner | null = null;

  constructor(
    readonly rangeId: number,
    readonly conditionQrl: QRL<BranchConditionFn>,
    readonly thenQrl: QRL<SSRBranchHandlerFn>,
    readonly elseQrl: QRL<SSRBranchHandlerFn> | undefined,
    public currentBranch: BranchState | null,
    readonly invokeContext: RuntimeInvokeContext | null,
    readonly container?: ContainerContext
  ) {}

  run(): ValueOrPromise<string> {
    const subscription = registerSubscriberToOwner(new SSRBranchSubscription(this));

    return maybeThen(
      this.conditionQrl.resolved ?? resolveQrl(this.conditionQrl, this.container),
      (conditionFn) => {
        const trackedCondition = runWithCollector(subscription, conditionFn);
        return maybeThen(trackedCondition, (trackedCondition) => {
          const nextBranch = trackedCondition ? BranchState.Then : BranchState.Else;
          const rendererQrl = trackedCondition ? this.thenQrl : this.elseQrl;

          return maybeThen(
            rendererQrl?.resolved ??
              (rendererQrl ? resolveQrl(rendererQrl, this.container) : undefined),
            (renderer) => {
              if (renderer === undefined) {
                return '';
              }

              subscription.branch.currentBranch = nextBranch;

              const invokeContext = newChildInvokeContext(this.invokeContext, {
                ownerHost: subscription.owner,
                container: this.container,
              });

              let html: ValueOrPromise<string>;
              try {
                html = runWithCollector(null, () =>
                  invoke(invokeContext, () => renderer(invokeContext.container!, this.rangeId))
                );
              } catch (error) {
                if (invokeContext.owner !== null) {
                  disposeOwner(invokeContext.owner);
                  invokeContext.owner = null;
                }
                throw error;
              }
              return maybeThen(html, (html) => {
                subscription.branch.currentOwner = invokeContext.owner;
                return html;
              });
            }
          );
        });
      }
    );
  }
}

function resolveQrl<T>(qrl: QRL<T>, ctx?: ContainerContext): Promise<T> {
  return (qrl as QRLInternal<T>).resolve(ctx);
}

export class SSRBranchSubscription implements SsrBranchSubscriber {
  readonly kind = SubscriberKind.Branch;
  owner: Owner | null = null;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly branch: SSRBranch) {}

  get effect(): any {
    return this.branch;
  }
}

export function renderSsrBranch(
  ctx: ContainerContext,
  rangeId: number,
  conditionQrl: QRL<BranchConditionFn>,
  thenQrl: QRL<SSRBranchHandlerFn>,
  elseQrl: QRL<SSRBranchHandlerFn> | undefined
): ValueOrPromise<string> {
  const branch = new SSRBranch(
    rangeId,
    conditionQrl,
    thenQrl,
    elseQrl,
    null,
    getActiveInvokeContextOrNull(),
    ctx
  );
  return branch.run();
}
