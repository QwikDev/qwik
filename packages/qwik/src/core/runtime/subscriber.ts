import { SubscriberFlags, type ComputedFlags } from '../reactive/flags';
import type { Branch, SSRBranch } from '../dom/branch/branch';
import type { ContentBlock, SSRContent } from '../dom/content/content';
import type { ForBlock, SSRForBlock } from '../dom/for/for';
import type { ValueOrPromise } from '../shared/utils/types';
import type { DomEffect } from '../dom/effect/effect';
import type { ComputedSource, Source } from '../reactive/source';
import type { Task, VisibleTask } from './task';
import type { SsrDomEffect } from '../dom/effect/ssr-effect';
import type { Owner } from './owner';
import type { TaskScheduler } from './scheduler';

export const enum SubscriberKind {
  Computed = 0,
  Task = 1,
  VisibleTask = 2,
  Dom = 3,
  Branch = 4,
  Idle = 5,
  ForBlock = 6,
  Content = 7,
}

export interface Collector {
  deps: Source[] | null;
  depVersions: number[] | null;
}

export interface OwnedSubscriber {
  owner: Owner | null;
}

export interface ScheduledSubscriber extends OwnedSubscriber {
  flags: SubscriberFlags;
}

export function takeDirty(subscriber: ScheduledSubscriber): boolean {
  if (subscriber.owner === null || !(subscriber.flags & SubscriberFlags.Dirty)) {
    return false;
  }

  subscriber.flags &= ~SubscriberFlags.Dirty;
  return true;
}

export interface ComputedSubscriber<T = unknown>
  extends Collector, ComputedSource<T>, OwnedSubscriber {
  readonly kind: SubscriberKind.Computed;
  flags: ComputedFlags;
  compute: () => T;
}

// TODO: replace with the real IdleJob runtime type.
export interface IdleJobRecord {
  run: () => unknown;
  dispose?: () => void;
}

export interface TaskSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Task;
  readonly task: Task;
  readonly scheduler: TaskScheduler;
  runPromise: Promise<void> | null;
}

export interface VisibleTaskSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.VisibleTask;
  readonly task: VisibleTask;
  readonly scheduler: TaskScheduler;
  runPromise: Promise<void> | null;
}

export interface DomSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Dom;
  readonly effect: DomEffect;
  invalidate(): void;
  run(): ValueOrPromise<void>;
  trackPromise<T>(promise: Promise<T>, commit: (value: T) => void): Promise<void>;
}

export interface BranchSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Branch;
  readonly branch: Branch;
  run(): ValueOrPromise<void>;
}

export interface ForBlockSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.ForBlock;
  readonly block: ForBlock<any>;
  run(): ValueOrPromise<void>;
}

export interface ContentSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Content;
  readonly block: ContentBlock<any>;
  run(): ValueOrPromise<readonly Node[]>;
}

export interface IdleSubscriber extends ScheduledSubscriber {
  readonly kind: SubscriberKind.Idle;
  readonly job: IdleJobRecord;
}

// SSR-only

export interface SsrDomSubscriber extends Collector {
  readonly kind: SubscriberKind.Dom;
  owner: Owner | null;
  readonly effect: SsrDomEffect;
}

export interface SsrBranchSubscriber extends Collector {
  readonly kind: SubscriberKind.Branch;
  owner: Owner | null;
  readonly effect: SSRBranch;
}

export interface SsrForBlockSubscriber extends Collector {
  readonly kind: SubscriberKind.ForBlock;
  owner: Owner | null;
  readonly effect: SSRForBlock<any>;
}

export interface SsrContentSubscriber extends Collector {
  readonly kind: SubscriberKind.Content;
  owner: Owner | null;
  readonly content: SSRContent<any>;
}

// Work scheduled into one of the runtime phases.
export type PhaseSubscriber =
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber
  | BranchSubscriber
  | ForBlockSubscriber
  | ContentSubscriber
  | IdleSubscriber;
// Work/value currently allowed to collect dependencies through track().
export type CollectorSubscriber =
  | ComputedSubscriber
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber
  | BranchSubscriber
  | ForBlockSubscriber
  | ContentSubscriber
  | SsrDomSubscriber
  | SsrBranchSubscriber
  | SsrForBlockSubscriber
  | SsrContentSubscriber;

export type Subscriber =
  | ComputedSubscriber
  | PhaseSubscriber
  | SsrDomSubscriber
  | SsrBranchSubscriber
  | SsrForBlockSubscriber
  | SsrContentSubscriber;
