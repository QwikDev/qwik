import type { QRLInternal } from '../../../shared/qrl/qrl-class';
import { isPromise } from '../../../shared/utils/promises';
import type { ValueOrPromise } from '../../../shared/utils/types';
import { ReactiveFlags } from '../../reactive/flags';
import { disposeOwner, registerSubscriberToOwner, type Owner } from '../../runtime/owner';
import {
  getActiveInvokeContextOrNull,
  invoke,
  newChildInvokeContext,
  type RuntimeInvokeContext,
} from '../../runtime/invoke-context';
import type { ContainerContext } from '../../runtime/container-context';
import { defaultScheduler, type Scheduler } from '../../runtime/scheduler';
import {
  SubscriberKind,
  type BranchSubscriber,
  type SsrBranchSubscriber,
  type Subscriber,
} from '../../runtime/subscriber';
import { NodeWalker } from '../../runtime/node-walker';
import type { Dependency } from '../../reactive/source';
import { runWithCollector } from '../../reactive/tracking';
import { EffectKind } from '../effect/effect-kind.enum';

export type { BranchMarkerRange } from '../../runtime/node-walker';

export type BranchConditionFn<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => boolean;
export type BranchRenderContext = ContainerContext;
export type BranchRenderFn<TArgs extends unknown[] = unknown[]> = (
  ctx: BranchRenderContext,
  ...args: TArgs
) => readonly Node[] | void;
export type BranchQrlRef<TFn> = QRLInternal<TFn>;

type BranchCondition<TArgs extends unknown[]> =
  | BranchConditionFn<TArgs>
  | BranchQrlRef<BranchConditionFn<TArgs>>;
type BranchRenderer<TArgs extends unknown[]> =
  | BranchRenderFn<TArgs>
  | BranchQrlRef<BranchRenderFn<TArgs>>;

export const enum BranchState {
  Then = 0,
  Else = 1,
}

// Client/resume mutation target for an existing DOM range. SSR renders the
// active branch to HTML and serializes branch metadata instead of creating this.
export abstract class BranchRange {
  abstract replace(nodes: readonly Node[]): void;
}

export interface BranchOptions {
  scheduler?: Scheduler;
  order?: number;
  container?: ContainerContext;
  mountedBranch?: BranchState;
}

export interface BranchQrlOptions {
  container?: ContainerContext;
}

export interface BranchSubscriberOptions {
  scheduler?: Scheduler;
  order?: number;
  mountedBranch?: BranchState;
}

const EMPTY_NODES: readonly Node[] = [];
const EMPTY_SUBSCRIBERS: readonly Subscriber[] = [];

interface BranchConditionCall<TArgs extends unknown[]> {
  fn: BranchConditionFn<TArgs>;
  args: TArgs;
}

interface BranchRenderCall<TArgs extends unknown[]> {
  fn: BranchRenderFn<TArgs>;
  ctx: BranchRenderContext | undefined;
  args: TArgs;
}

interface BranchRenderRun<TArgs extends unknown[]> extends BranchRenderCall<TArgs> {
  invokeContext: RuntimeInvokeContext | null;
}

interface BranchConditionRun<TArgs extends unknown[]> {
  subscription: BranchSubscription<TArgs>;
  condition: BranchConditionFn<TArgs>;
}

interface SsrBranchConditionRun<TArgs extends unknown[]> {
  subscription: SsrBranchSubscription<TArgs>;
  condition: BranchConditionFn<TArgs>;
}

export class Branch<TArgs extends unknown[] = unknown[]> {
  currentOwner: Owner | null;
  currentBranch: BranchState | null;

  constructor(
    readonly range: BranchRange,
    readonly args: TArgs,
    readonly condition: BranchCondition<TArgs>,
    readonly then: BranchRenderer<TArgs>,
    readonly otherwise: BranchRenderer<TArgs> | undefined,
    readonly order: number,
    readonly invokeContext: RuntimeInvokeContext | null,
    mountedBranch: BranchState | undefined,
    readonly container?: ContainerContext
  ) {
    this.currentBranch = mountedBranch ?? null;
    // Resumed branch DOM already exists; create its child owner now so a later
    // branch switch can dispose subscriptions restored under that mounted branch.
    this.currentOwner =
      mountedBranch === undefined
        ? null
        : newChildInvokeContext(invokeContext, { container }).owner;
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

export class BranchQrl<TArgs extends unknown[] = unknown[]> {
  constructor(
    readonly args: TArgs,
    readonly conditionQrl: BranchQrlRef<BranchConditionFn<TArgs>>,
    readonly thenQrl: BranchQrlRef<BranchRenderFn<TArgs>>,
    readonly elseQrl: BranchQrlRef<BranchRenderFn<TArgs>> | undefined,
    readonly container?: ContainerContext
  ) {}
}

export class BranchSubscription<TArgs extends unknown[] = unknown[]> implements BranchSubscriber {
  readonly kind = SubscriberKind.Branch;
  flags = ReactiveFlags.None;
  schedulerEpoch = 0;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(
    readonly branch: Branch<TArgs>,
    readonly scheduler: Scheduler = defaultScheduler
  ) {}

  run(): ValueOrPromise<void> {
    return runBranchSubscription(this);
  }
}

export class SsrBranchEffect<TArgs extends unknown[] = unknown[]> {
  readonly kind = EffectKind.Branch;
  currentOwner: Owner | null = null;
  mountedBranch: BranchState | null = null;

  constructor(
    readonly rangeId: number,
    readonly order: number,
    readonly args: TArgs,
    readonly conditionQrl: BranchQrlRef<BranchConditionFn<TArgs>>,
    readonly thenQrl: BranchQrlRef<BranchRenderFn<TArgs>>,
    readonly elseQrl: BranchQrlRef<BranchRenderFn<TArgs>> | undefined
  ) {}
}

export class SsrBranchSubscription<
  TArgs extends unknown[] = unknown[],
> implements SsrBranchSubscriber<TArgs> {
  readonly kind = SubscriberKind.Branch;
  flags = ReactiveFlags.None;
  deps: Dependency[] | null = null;
  depVersions: number[] | null = null;

  constructor(readonly effect: SsrBranchEffect<TArgs>) {}
}

export class CommentBranchRange extends BranchRange {
  constructor(
    readonly start: Comment,
    readonly end: Comment
  ) {
    super();
  }

  replace(nodes: readonly Node[]): void {
    NodeWalker.instance.replaceBranchRange([this.start, this.end], nodes);
  }
}

export function createBranchRange(start: Comment, end: Comment): BranchRange {
  return new CommentBranchRange(start, end);
}

export function createBranch<TArgs extends unknown[]>(
  range: BranchRange,
  args: TArgs,
  condition: BranchConditionFn<TArgs>,
  then: BranchRenderFn<TArgs>,
  otherwise?: BranchRenderFn<TArgs>,
  options?: BranchOptions
): BranchSubscriber {
  return createBranchSubscription(
    new Branch(
      range,
      args,
      condition,
      then,
      otherwise,
      options?.order ?? 0,
      getActiveInvokeContextOrNull(),
      options?.mountedBranch,
      options?.container
    ),
    options?.scheduler
  );
}

// QRL branches are serializable metadata. They intentionally don't capture a
// BranchRange, because SSR has no client DOM range to mutate.
export function createBranchQrl<TArgs extends unknown[]>(
  args: TArgs,
  conditionQrl: BranchQrlRef<BranchConditionFn<TArgs>>,
  thenQrl: BranchQrlRef<BranchRenderFn<TArgs>>,
  elseQrl?: BranchQrlRef<BranchRenderFn<TArgs>>,
  options?: BranchQrlOptions
): BranchQrl<TArgs> {
  return new BranchQrl(args, conditionQrl, thenQrl, elseQrl, options?.container);
}

// Client/resume step that wires serialized QRL branch metadata to an existing
// DOM range.
export function createBranchQrlSubscriber<TArgs extends unknown[]>(
  range: BranchRange,
  branchQrl: BranchQrl<TArgs>,
  options?: BranchSubscriberOptions
): BranchSubscriber {
  return createBranchSubscription(
    new Branch(
      range,
      branchQrl.args,
      branchQrl.conditionQrl,
      branchQrl.thenQrl,
      branchQrl.elseQrl,
      options?.order ?? 0,
      getActiveInvokeContextOrNull(),
      options?.mountedBranch,
      branchQrl.container
    ),
    options?.scheduler
  );
}

export function renderSsrBranch<TArgs extends unknown[]>(
  rangeId: number,
  order: number,
  args: TArgs,
  conditionQrl: BranchQrlRef<BranchConditionFn<TArgs>>,
  thenQrl: BranchQrlRef<BranchRenderFn<TArgs>>,
  elseQrl: BranchQrlRef<BranchRenderFn<TArgs>> | undefined,
  renderThen: () => string,
  renderElse?: () => string
): string {
  const subscription = createSsrBranchSubscription(
    new SsrBranchEffect(rangeId, order, args, conditionQrl, thenQrl, elseQrl)
  );
  const condition = resolveBranchHandler(conditionQrl, getSsrBranchContainer());

  if (isPromise(condition)) {
    throw new Error('SSR branch condition QRL must be resolved before renderSsrBranch().');
  }

  const conditionValue = runTrackedSsrBranchCondition({ subscription, condition });
  if (isPromise(conditionValue)) {
    throw new Error('SSR branch condition must be synchronous.');
  }

  const state = getBranchState(conditionValue);
  subscription.effect.mountedBranch = state;

  const invokeContext = newChildInvokeContext(getActiveInvokeContextOrNull());
  subscription.effect.currentOwner = invokeContext.owner;

  return invoke(
    invokeContext,
    state === BranchState.Then ? renderThen : (renderElse ?? renderEmpty)
  );
}

export function getSsrBranchOwnedSubscribers(
  subscription: SsrBranchSubscription
): readonly Subscriber[] {
  return subscription.effect.currentOwner?.subscribers ?? EMPTY_SUBSCRIBERS;
}

function createBranchSubscription<TArgs extends unknown[]>(
  branch: Branch<TArgs>,
  scheduler: Scheduler | undefined
): BranchSubscriber {
  return registerSubscriberToOwner(
    new BranchSubscription(branch, scheduler ?? getActiveScheduler())
  );
}

function createSsrBranchSubscription<TArgs extends unknown[]>(
  effect: SsrBranchEffect<TArgs>
): SsrBranchSubscription<TArgs> {
  return registerSubscriberToOwner(new SsrBranchSubscription(effect));
}

function runBranchSubscription<TArgs extends unknown[]>(
  subscription: BranchSubscription<TArgs>
): ValueOrPromise<void> {
  const branch = subscription.branch;
  const condition = resolveBranchHandler(branch.condition, getBranchContainer(branch));

  if (isPromise(condition)) {
    return condition.then((fn) => {
      return runBranchCondition(subscription, fn);
    });
  }

  return runBranchCondition(subscription, condition);
}

function runBranchCondition<TArgs extends unknown[]>(
  subscription: BranchSubscription<TArgs>,
  condition: BranchConditionFn<TArgs>
): ValueOrPromise<void> {
  const value = invoke(subscription.branch.invokeContext, runTrackedBranchCondition, {
    subscription,
    condition,
  });

  if (isPromise(value)) {
    throw new Error('Branch condition must be synchronous');
  }

  return setBranchState(subscription.branch, getBranchState(value));
}

function setBranchState<TArgs extends unknown[]>(
  branch: Branch<TArgs>,
  nextBranch: BranchState
): ValueOrPromise<void> {
  if (branch.currentBranch === nextBranch) {
    return;
  }

  const owner = branch.currentOwner;
  branch.currentOwner = null;
  if (owner !== null) {
    disposeOwner(owner);
  }

  branch.currentBranch = nextBranch;

  const renderer =
    nextBranch === BranchState.Then
      ? resolveBranchHandler(branch.then, getBranchContainer(branch))
      : resolveOptionalBranchHandler(branch.otherwise, getBranchContainer(branch));

  if (renderer === undefined) {
    branch.range.replace(EMPTY_NODES);
    return;
  }

  if (isPromise(renderer)) {
    return renderer.then((fn) => {
      mountBranch(branch, fn);
    });
  }

  mountBranch(branch, renderer);
}

function mountBranch<TArgs extends unknown[]>(
  branch: Branch<TArgs>,
  renderer: BranchRenderFn<TArgs>
): void {
  const invokeContext = newChildInvokeContext(branch.invokeContext, {
    container: branch.container,
  });
  branch.currentOwner = invokeContext.owner;

  const nodes = runWithCollector(null, runBranchRenderer, {
    invokeContext,
    fn: renderer,
    ctx: invokeContext.container ?? getBranchContainer(branch),
    args: branch.args,
  });

  if (isPromise(nodes)) {
    throw new Error('Branch renderer must be synchronous');
  }

  branch.range.replace(nodes ?? EMPTY_NODES);
}

function runTrackedBranchCondition<TArgs extends unknown[]>(
  run: BranchConditionRun<TArgs>
): boolean {
  return runWithCollector(run.subscription, callBranchCondition, {
    fn: run.condition,
    args: run.subscription.branch.args,
  });
}

function runTrackedSsrBranchCondition<TArgs extends unknown[]>(
  run: SsrBranchConditionRun<TArgs>
): boolean {
  return runWithCollector(run.subscription, callBranchCondition, {
    fn: run.condition,
    args: run.subscription.effect.args,
  });
}

function runBranchRenderer<TArgs extends unknown[]>(
  run: BranchRenderRun<TArgs>
): readonly Node[] | void {
  return invoke(run.invokeContext, callBranchRenderer, {
    fn: run.fn,
    ctx: run.ctx,
    args: run.args,
  });
}

function resolveBranchHandler<TFn>(
  handler: TFn | BranchQrlRef<TFn>,
  container: ContainerContext | undefined
): ValueOrPromise<TFn> {
  if (isBranchQrlRef(handler)) {
    const resolved = handler.resolved;
    return resolved === undefined ? handler.resolve(container) : resolved;
  }

  return handler;
}

function resolveOptionalBranchHandler<TFn>(
  handler: TFn | BranchQrlRef<TFn> | undefined,
  container: ContainerContext | undefined
): ValueOrPromise<TFn> | undefined {
  if (handler === undefined) {
    return undefined;
  }

  return resolveBranchHandler(handler, container);
}

function getBranchContainer<TArgs extends unknown[]>(
  branch: Branch<TArgs>
): ContainerContext | undefined {
  return (
    branch.container ??
    branch.invokeContext?.container ??
    getBranchHandlerContainer(branch.condition) ??
    getBranchHandlerContainer(branch.then) ??
    getBranchHandlerContainer(branch.otherwise)
  );
}

function getBranchHandlerContainer<TFn>(
  handler: TFn | BranchQrlRef<TFn> | undefined
): ContainerContext | undefined {
  if (handler !== undefined && isBranchQrlRef(handler)) {
    return handler.$container$ ?? handler.$lazy$.$container$;
  }
  return undefined;
}

function getSsrBranchContainer(): ContainerContext | undefined {
  return getActiveInvokeContextOrNull()?.container;
}

function getActiveScheduler(): Scheduler {
  return getActiveInvokeContextOrNull()?.container?.scheduler ?? defaultScheduler;
}

function callBranchCondition<TArgs extends unknown[]>(call: BranchConditionCall<TArgs>): boolean {
  return call.fn(...call.args);
}

function callBranchRenderer<TArgs extends unknown[]>(
  call: BranchRenderCall<TArgs>
): readonly Node[] | void {
  return call.fn(call.ctx!, ...call.args);
}

function getBranchState(condition: boolean): BranchState {
  return condition ? BranchState.Then : BranchState.Else;
}

function renderEmpty(): string {
  return '';
}

function isBranchQrlRef<TFn>(handler: TFn | BranchQrlRef<TFn>): handler is BranchQrlRef<TFn> {
  return typeof (handler as BranchQrlRef<TFn>).resolve === 'function';
}
