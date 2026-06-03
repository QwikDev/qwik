import type { ReactiveFlags } from './flags';
import type { DomEffect } from './dom-effect';
import type { ComputedSource, Dependency } from './source';
import type { Task, VisibleTask } from './task';

export const enum SubscriberKind {
  Computed = 0,
  Task = 1,
  VisibleTask = 2,
  Dom = 3,
  Idle = 4,
}

export interface Collector {
  deps: Dependency[] | null;
  depVersions: number[] | null;
  flags: ReactiveFlags;
}

export interface ScheduledSubscriber {
  flags: ReactiveFlags;
  schedulerEpoch: number;
  notify(): void;
}

export interface ComputedSubscriber<T = unknown> extends Collector, ComputedSource<T> {
  readonly kind: SubscriberKind.Computed;
  compute: () => T;
  notify(): void;
}

// TODO(vdomless): replace with the real IdleJob runtime type.
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

export interface IdleSubscriber extends ScheduledSubscriber {
  readonly kind: SubscriberKind.Idle;
  readonly job: IdleJobRecord;
}

// Work scheduled into one of the runtime phases.
export type PhaseSubscriber =
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber
  | IdleSubscriber;
// Work/value currently allowed to collect dependencies through track().
export type CollectorSubscriber =
  | ComputedSubscriber
  | TaskSubscriber
  | VisibleTaskSubscriber
  | DomSubscriber;
export type Subscriber = ComputedSubscriber | PhaseSubscriber;
