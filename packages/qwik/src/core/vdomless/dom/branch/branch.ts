import { isQrl } from '../../../shared/qrl/qrl-utils';
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
import { replaceBranchRange } from '../../runtime/node-walker';
import { disposeOwner, registerSubscriberToOwner, type Owner } from '../../runtime/owner';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import {
  SubscriberKind,
  type BranchSubscriber,
  type SsrBranchSubscriber,
} from '../../runtime/subscriber';

type BranchConditionFn = () => boolean;
type BranchHandlerFn = (ctx: ContainerContext) => readonly Node[];
type SSRBranchHandlerFn = (ctx: ContainerContext, rangeId: number) => string;

/** BranchRange represents a range of nodes in the DOM that can be replaced with new nodes */
export class BranchRange {
  constructor(
    readonly start: Comment,
    readonly end: Comment
  ) {}

  replace(nodes: readonly Node[]): void {
    replaceBranchRange([this.start, this.end], nodes);
  }
}

const enum BranchState {
  Then = 0,
  Else = 1,
}

const EMPTY_NODES: readonly Node[] = [];

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
          container: this.branch.container,
        });

        const nodes: readonly Node[] = runWithCollector(null, () =>
          invoke(newInvokeContext, () => renderer(newInvokeContext.container!))
        );

        this.branch.currentOwner = newInvokeContext.owner;
        this.branch.range.replace(nodes ?? EMPTY_NODES);
      });
    });
  }
}

function getFunctionOrResolve<T>(fn: T | QRL<T>, ctx?: ContainerContext): T | Promise<T> {
  return isQrl(fn) ? ((fn.resolved ?? fn.resolve(ctx)) as T | Promise<T>) : (fn as T);
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

              const invokeContext = newChildInvokeContext(getActiveInvokeContextOrNull(), {
                container: this.container,
              });

              const html = runWithCollector(null, () =>
                invoke(invokeContext, () => renderer(invokeContext.container!, this.rangeId))
              );
              subscription.branch.currentOwner = invokeContext.owner;
              return html;
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
