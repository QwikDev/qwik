import type { ReactiveFlags } from './flags';
import type { Phase, TaskGroup } from './scheduler';
import type { ComputedSource, Dependency } from './source';

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

// TODO(vdomless): replace with the real Task runtime type.
export interface TaskRecord {
  readonly phase: Phase.BlockingTask | Phase.DeferredTask;
  readonly group: TaskGroup;
  readonly index: number;
  readonly seq: number;
  run: () => unknown;
}

// TODO(vdomless): replace with the real VisibleTask runtime type.
export interface VisibleTaskRecord {
  readonly seq: number;
  run: () => unknown;
}

// TODO(vdomless): replace with the real DomEffect runtime type.
export interface DomEffectRecord {
  readonly phase: Phase.StructuralDom | Phase.ScalarDom;
  readonly order: number;
  readonly seq: number;
  run: () => unknown;
}

// TODO(vdomless): replace with the real IdleJob runtime type.
export interface IdleJobRecord {
  readonly seq: number;
  run: () => unknown;
  dispose?: () => void;
}

export interface TaskSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Task;
  readonly task: TaskRecord;
}

export interface VisibleTaskSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.VisibleTask;
  readonly task: VisibleTaskRecord;
}

export interface DomSubscriber extends Collector, ScheduledSubscriber {
  readonly kind: SubscriberKind.Dom;
  readonly effect: DomEffectRecord;
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
