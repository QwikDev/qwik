import type { ComputedFlags, SubscriberFlags } from '../reactive/flags';
import type { Branch, SsrBranchEffect } from '../dom/branch/branch';
import type { ValueOrPromise } from '../../shared/utils/types';
import type { DomEffect } from '../dom/effect/effect';
import type { ComputedSource, Dependency } from '../reactive/source';
import type { Task, VisibleTask } from './task';
import type { SsrDomEffect } from '../dom/effect/ssr-effect';
import type { Owner } from './owner';

export const enum SubscriberKind {
  Computed = 0,
  Task = 1,
  VisibleTask = 2,
  Dom = 3,
  Branch = 4,
  Idle = 5,
}

export interface Collector {
  deps: Dependency[] | null;
  depVersions: number[] | null;
}

export interface OwnedSubscriber {
  owner: Owner | null;
}

export interface ScheduledSubscriber extends OwnedSubscriber {
  flags: SubscriberFlags;
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
}

export interface VisibleTaskSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.VisibleTask;
  readonly task: VisibleTask;
}

export interface DomSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Dom;
  readonly effect: DomEffect;
}

export interface BranchSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Branch;
  readonly branch: Branch;
  run(): ValueOrPromise<void>;
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
  readonly effect: SsrBranchEffect;
}

// Work scheduled into one of the runtime phases.
export type PhaseSubscriber =
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber
  | BranchSubscriber
  | IdleSubscriber;
// Work/value currently allowed to collect dependencies through track().
export type CollectorSubscriber =
  | ComputedSubscriber
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber
  | BranchSubscriber
  | SsrDomSubscriber
  | SsrBranchSubscriber;

export type Subscriber =
  | ComputedSubscriber
  | PhaseSubscriber
  | SsrDomSubscriber
  | SsrBranchSubscriber;
