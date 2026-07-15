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
  type BranchSubscriber,
  type SsrBranchSubscriber,
} from '../../runtime/subscriber';
import { EMPTY_NODES } from '../../utils/consts';
import { toNodes } from '../../utils/nodes';
import type { MaybeNodeOutput } from '../../utils/nodes';
import { getFunctionOrResolve } from '../../utils/qrl';
import { createContentRange, replaceRange } from '../range/range';
import type { SsrOutput } from '../../ssr/output';
import { reapplyUseOnContexts } from '../../runtime/use-on';

type BranchConditionFn = () => ValueOrPromise<boolean>;
type BranchHandlerFn = (ctx: ContainerContext, id?: string) => ValueOrPromise<MaybeNodeOutput>;
type SSRBranchHandlerFn = (
  ctx: ContainerContext,
  rangeId: number,
  id?: string
) => ValueOrPromise<SsrOutput>;

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
    readonly container?: ContainerContext,
    readonly idBase = '',
    readonly useOnRoot = false
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

  commit(
    invokeContext: RuntimeInvokeContext | null,
    nextBranch: BranchState,
    output: MaybeNodeOutput
  ): void {
    const previousOwner = this.currentOwner;
    const nodes = toNodes(
      this.useOnRoot && this.currentBranch !== null
        ? reapplyUseOnContexts(output, this.invokeContext, this.range.document)
        : output
    );
    this.range.replace(nodes);
    this.currentBranch = nextBranch;
    this.currentOwner = invokeContext?.owner ?? null;
    if (previousOwner !== null) {
      disposeOwner(previousOwner);
    }
  }
}

export class BranchSubscription implements BranchSubscriber {
  readonly kind = SubscriberKind.Branch;
  owner: Owner | null = null;
  flags = SubscriberFlags.None;
  deps: Source[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly branch: Branch,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<void> {
    const conditionFn = getFunctionOrResolve(this.branch.conditionFn, this.branch.container);

    return maybeThen(conditionFn, (conditionFn) => {
      if (this.owner === null) {
        return;
      }
      const condition = retryOnPromise(() =>
        runWithCollector(this, () => invoke(this.branch.invokeContext, conditionFn))
      );
      return maybeThen(condition, (condition) => {
        if (this.owner === null) {
          return;
        }
        const nextBranch = condition ? BranchState.Then : BranchState.Else;
        if (this.branch.currentBranch === nextBranch) {
          return;
        }

        const renderer = getFunctionOrResolve(
          condition ? this.branch.thenFn : this.branch.elseFn,
          this.branch.container
        );
        return maybeThen(renderer, (renderer) => {
          if (this.owner === null) {
            return;
          }
          if (renderer === undefined) {
            this.branch.commit(null, nextBranch, EMPTY_NODES);
            return;
          }

          const invokeContext = newChildInvokeContext(this.branch.invokeContext, {
            ownerHost: this.owner,
            container: this.branch.container,
          });
          return safeCall(
            () =>
              retryOnPromise(() =>
                runWithCollector(null, () =>
                  invoke(invokeContext, () =>
                    renderer(invokeContext.container!, this.branch.idBase)
                  )
                )
              ),
            (nodes) => {
              if (this.owner === null) {
                if (invokeContext.owner !== null) {
                  disposeOwner(invokeContext.owner);
                  invokeContext.owner = null;
                }
                return;
              }
              this.branch.commit(invokeContext, nextBranch, nodes);
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
      });
    });
  }
}

export function createBranch(
  ctx: ContainerContext,
  branchRange: BranchRange,
  condition: BranchConditionFn | QRL<BranchConditionFn>,
  then: BranchHandlerFn | QRL<BranchHandlerFn>,
  elseFn?: BranchHandlerFn | QRL<BranchHandlerFn>,
  idBase = '',
  useOnRoot = false
): BranchSubscriber {
  const branch = new Branch(
    branchRange,
    condition,
    then,
    elseFn,
    null,
    getActiveInvokeContextOrNull(),
    ctx,
    idBase,
    useOnRoot
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
    readonly container?: ContainerContext,
    readonly idBase = '',
    readonly useOnRoot = false
  ) {}

  run(): ValueOrPromise<SsrOutput> {
    const subscription = registerSubscriberToOwner(new SSRBranchSubscription(this));

    return maybeThen(getFunctionOrResolve(this.conditionQrl, this.container), (conditionFn) => {
      const trackedCondition = retryOnPromise(() => runWithCollector(subscription, conditionFn));
      return maybeThen(trackedCondition, (trackedCondition) => {
        const nextBranch = trackedCondition ? BranchState.Then : BranchState.Else;
        const rendererQrl = trackedCondition ? this.thenQrl : this.elseQrl;

        return maybeThen(
          rendererQrl ? getFunctionOrResolve(rendererQrl, this.container) : undefined,
          (renderer) => {
            if (renderer === undefined) {
              return '';
            }

            const invokeContext = newChildInvokeContext(this.invokeContext, {
              ownerHost: subscription.owner,
              container: this.container,
            });
            return safeCall(
              () =>
                runWithCollector(null, () =>
                  invoke(invokeContext, () =>
                    renderer(invokeContext.container!, this.rangeId, this.idBase)
                  )
                ),
              (output) => {
                subscription.branch.currentBranch = nextBranch;
                subscription.branch.currentOwner = invokeContext.owner;
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
          }
        );
      });
    });
  }
}

export class SSRBranchSubscription implements SsrBranchSubscriber {
  readonly kind = SubscriberKind.Branch;
  owner: Owner | null = null;
  deps: Source[] | null = null;
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
  elseQrl: QRL<SSRBranchHandlerFn> | undefined,
  idBase = '',
  useOnRoot = false
): ValueOrPromise<SsrOutput> {
  const branch = new SSRBranch(
    rangeId,
    conditionQrl,
    thenQrl,
    elseQrl,
    null,
    getActiveInvokeContextOrNull(),
    ctx,
    idBase,
    useOnRoot
  );
  return branch.run();
}
