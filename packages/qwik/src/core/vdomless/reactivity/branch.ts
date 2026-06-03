import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { Container } from '../../shared/types';
import type { ValueOrPromise } from '../../shared/utils/types';
import { ReactiveFlags } from './flags';
import {
  createOwner,
  disposeOwner,
  getActiveOwner,
  registerSubscriberToOwner,
  runWithOwner,
  type Owner,
} from './owner';
import { defaultScheduler, type Scheduler } from './scheduler';
import { SubscriberKind, type BranchSubscriber } from './subscriber';
import type { Dependency } from './source';
import { runWithCollector } from './tracking';

export type BranchConditionFn<TArgs extends unknown[] = unknown[]> = (...args: TArgs) => boolean;
export type BranchRenderFn<TArgs extends unknown[] = unknown[]> = (
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

export type BranchMarkerRange = readonly [Comment, Comment];

export interface BranchOptions {
  scheduler?: Scheduler;
  order?: number;
  container?: Container;
  mountedBranch?: BranchState;
}

export interface BranchQrlOptions {
  container?: Container;
}

export interface BranchSubscriberOptions {
  scheduler?: Scheduler;
  order?: number;
  mountedBranch?: BranchState;
}

const EMPTY_NODES: readonly Node[] = [];

interface BranchConditionCall<TArgs extends unknown[]> {
  fn: BranchConditionFn<TArgs>;
  args: TArgs;
}

interface BranchRenderCall<TArgs extends unknown[]> {
  fn: BranchRenderFn<TArgs>;
  args: TArgs;
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
    readonly parentOwner: Owner | null,
    mountedBranch: BranchState | undefined,
    readonly container?: Container
  ) {
    this.currentBranch = mountedBranch ?? null;
    // Resumed branch DOM already exists; create its child owner now so a later
    // branch switch can dispose subscriptions restored under that mounted branch.
    this.currentOwner = mountedBranch === undefined ? null : runWithOwner(parentOwner, createOwner);
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
    readonly container?: Container
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

  notify(): void {
    this.scheduler.notify(this);
  }

  run(): ValueOrPromise<void> {
    return runBranchSubscription(this);
  }
}

export class CommentBranchRange extends BranchRange {
  constructor(
    readonly start: Comment,
    readonly end: Comment
  ) {
    super();
  }

  replace(nodes: readonly Node[]): void {
    const start = this.start;
    const end = this.end;
    const parent = getBranchRangeParent(start, end);
    const ownerDocument = start.ownerDocument;
    if (ownerDocument === null) {
      throw new Error('Branch range start marker must have an owner document');
    }

    const range = ownerDocument.createRange();
    range.setStartAfter(start);
    range.setEndBefore(end);
    range.deleteContents();

    if (nodes.length === 0) {
      return;
    }

    if (nodes.length === 1) {
      parent.insertBefore(nodes[0], end);
      return;
    }

    const fragment = ownerDocument.createDocumentFragment();
    for (let i = 0; i < nodes.length; i++) {
      fragment.appendChild(nodes[i]);
    }
    parent.insertBefore(fragment, end);
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
      getActiveOwner(),
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
      getActiveOwner(),
      options?.mountedBranch,
      branchQrl.container
    ),
    options?.scheduler
  );
}

function createBranchSubscription<TArgs extends unknown[]>(
  branch: Branch<TArgs>,
  scheduler: Scheduler | undefined
): BranchSubscriber {
  return registerSubscriberToOwner(new BranchSubscription(branch, scheduler));
}

function getBranchRangeParent(start: Comment, end: Comment): Node {
  const parent = start.parentNode as Node | null;
  if (parent === null || parent !== end.parentNode) {
    throw new Error('Branch range markers must share a parent');
  }

  return parent;
}

function runBranchSubscription<TArgs extends unknown[]>(
  subscription: BranchSubscription<TArgs>
): ValueOrPromise<void> {
  const branch = subscription.branch;
  const condition = resolveBranchHandler(branch.condition, branch.container);

  if (isPromiseLike(condition)) {
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
  const value = runWithCollector(subscription, callBranchCondition, {
    fn: condition,
    args: subscription.branch.args,
  });

  if (isPromiseLike(value)) {
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
      ? resolveBranchHandler(branch.then, branch.container)
      : resolveOptionalBranchHandler(branch.otherwise, branch.container);

  if (renderer === undefined) {
    branch.range.replace(EMPTY_NODES);
    return;
  }

  if (isPromiseLike(renderer)) {
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
  const owner = runWithOwner(branch.parentOwner, createOwner);
  branch.currentOwner = owner;

  const nodes = runWithOwner(owner, callBranchRenderer, {
    fn: renderer,
    args: branch.args,
  });

  if (isPromiseLike(nodes)) {
    throw new Error('Branch renderer must be synchronous');
  }

  branch.range.replace(nodes ?? EMPTY_NODES);
}

function resolveBranchHandler<TFn>(
  handler: TFn | BranchQrlRef<TFn>,
  container: Container | undefined
): ValueOrPromise<TFn> {
  if (isBranchQrlRef(handler)) {
    const resolved = handler.resolved;
    return resolved === undefined ? handler.resolve(container) : resolved;
  }

  return handler;
}

function resolveOptionalBranchHandler<TFn>(
  handler: TFn | BranchQrlRef<TFn> | undefined,
  container: Container | undefined
): ValueOrPromise<TFn> | undefined {
  if (handler === undefined) {
    return undefined;
  }

  return resolveBranchHandler(handler, container);
}

function callBranchCondition<TArgs extends unknown[]>(call: BranchConditionCall<TArgs>): boolean {
  return call.fn(...call.args);
}

function callBranchRenderer<TArgs extends unknown[]>(
  call: BranchRenderCall<TArgs>
): readonly Node[] | void {
  return call.fn(...call.args);
}

function getBranchState(condition: boolean): BranchState {
  return condition ? BranchState.Then : BranchState.Else;
}

function isBranchQrlRef<TFn>(handler: TFn | BranchQrlRef<TFn>): handler is BranchQrlRef<TFn> {
  return typeof (handler as BranchQrlRef<TFn>).resolve === 'function';
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === 'function';
}
