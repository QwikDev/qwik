import {
  isPromise,
  SsrDomSubscription,
  type PhaseSubscriber,
  type SsrAttributePatch,
  type TaskScheduler,
  type TaskSubscriber,
  type ValueOrPromise,
} from '@qwik.dev/core';
import { OwnerFlags, SubscriberFlags, SubscriberKind } from './qwik-copy';

export interface SsrLaneSerializationContext {
  $addRoot$(value: unknown): number;
}

const NO_ERROR = Symbol();
const NOOP = () => {};
type SsrWork = TaskSubscriber | SsrDomSubscription;
interface SsrSchedulerState {
  error: unknown;
  notifyRenderer: () => void;
}

export class SsrScheduler {
  readonly lanes: SsrLane[] = [];
  private readonly state: SsrSchedulerState;

  constructor(notifyRenderer: () => void = NOOP) {
    this.state = { error: NO_ERROR, notifyRenderer };
  }

  createLane(
    serializationCtx: SsrLaneSerializationContext,
    parent: SsrLane | null = null
  ): SsrLane {
    const lane = new SsrLane(this.lanes.length, parent?.id ?? null, serializationCtx, this.state);
    this.lanes.push(lane);
    return lane;
  }

  settle(): ValueOrPromise<void> {
    let pending: Promise<void>[] | null = null;
    for (let i = 0; i < this.lanes.length; i++) {
      const result = this.lanes[i].settle();
      if (isPromise(result)) {
        (pending ??= []).push(result);
      }
    }
    return pending === null ? undefined : Promise.all(pending).then(() => this.settle());
  }

  cancel(lane: SsrLane): void {
    for (let i = lane.id; i < this.lanes.length; i++) {
      const candidate = this.lanes[i];
      let laneId: number | null = candidate.id;
      while (laneId !== null) {
        if (laneId === lane.id) {
          candidate.cancel();
          break;
        }
        laneId = this.lanes[laneId].parentId;
      }
    }
  }

  throwIfFailed(): void {
    if (this.state.error !== NO_ERROR) {
      throw this.state.error;
    }
  }
}

export class SsrLane implements TaskScheduler {
  private queue: SsrWork[] | null = null;
  private queueIndex = 0;
  private pendingDom: Set<Promise<void>> | null = null;
  private patches: SsrAttributePatch[] | null = null;
  private pending: Promise<void> | null = null;
  private running = false;
  private cancelled = false;

  constructor(
    readonly id: number,
    readonly parentId: number | null,
    readonly serializationCtx: SsrLaneSerializationContext,
    private readonly state: SsrSchedulerState
  ) {}

  notify(subscriber: PhaseSubscriber): void {
    const owner = subscriber.owner;
    if (
      this.cancelled ||
      owner === null ||
      owner.flags & OwnerFlags.Disposed ||
      this.state.error !== NO_ERROR
    ) {
      return;
    }
    // backpatching attributes
    if (subscriber instanceof SsrDomSubscription) {
      subscriber.invalidate();
      if (!(subscriber.flags & SubscriberFlags.Dirty)) {
        subscriber.flags |= SubscriberFlags.Dirty;
        (this.queue ??= []).push(subscriber);
      }
      return;
    }
    if (subscriber.kind !== SubscriberKind.Task) {
      return;
    }
    if (subscriber.flags & SubscriberFlags.Dirty) {
      return;
    }

    subscriber.flags |= SubscriberFlags.Dirty;
    this.serializationCtx.$addRoot$(subscriber);

    if (this.running || this.pending !== null) {
      (this.queue ??= []).push(subscriber);
      return;
    }
    this.start(subscriber);
  }

  flush(): void | Promise<void> {
    if (this.state.error !== NO_ERROR) {
      throw this.state.error;
    }
    if (this.cancelled) {
      return;
    }
    const pending = this.pending;
    if (pending !== null) {
      return pending.then(() => this.flush());
    }
    const next = this.takeNext();
    if (next !== null) {
      this.start(next);
      return this.flush();
    }
  }

  settle(): void | Promise<void> {
    const blocking = this.flush();
    if (isPromise(blocking)) {
      return blocking.then(() => this.settle());
    }
    const dom = this.pendingDom?.values().next().value;
    return dom === undefined ? undefined : dom.then(() => this.settle());
  }

  get hasPatches(): boolean {
    return this.patches !== null;
  }

  cancel(): void {
    this.cancelled = true;
    this.queue = null;
    this.pending = null;
    this.pendingDom = null;
    this.patches = null;
    this.state.notifyRenderer();
  }

  takePatches(): SsrAttributePatch[] | null {
    const patches = this.patches;
    this.patches = null;
    return patches;
  }

  private start(first: SsrWork): void {
    this.running = true;
    let result: void | Promise<void>;
    try {
      result = this.drain(first);
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.running = false;
    }

    if (isPromise(result)) {
      this.pending = result.then(
        () => {
          if (this.cancelled) {
            return;
          }
          this.pending = null;
          const next = this.takeNext();
          if (next !== null) {
            this.start(next);
          }
        },
        (error) => {
          if (this.cancelled) {
            return;
          }
          this.pending = null;
          this.fail(error);
        }
      );
    }
  }

  private drain(current: SsrWork | null): void | Promise<void> {
    while (current !== null) {
      const subscriber = current;
      if (subscriber instanceof SsrDomSubscription) {
        const result = subscriber.run();
        if (isPromise(result)) {
          this.observeDom(result, subscriber);
        } else {
          this.collectPatch(subscriber);
        }
        current = this.takeNext();
        continue;
      }
      const result = subscriber.run();
      if (isPromise(result)) {
        return result.then(() => this.drain(this.takeNext()));
      }
      current = this.takeNext();
    }
  }

  private observeDom(result: Promise<void>, subscriber: SsrDomSubscription): void {
    const pending = result
      .then(
        () => {
          if (!this.cancelled) {
            this.collectPatch(subscriber);
          }
        },
        (error) => {
          if (!this.cancelled) {
            this.fail(error);
          }
        }
      )
      .catch((error) => this.fail(error))
      .then(() => {
        const pendingDom = this.pendingDom;
        pendingDom?.delete(pending);
        if (pendingDom?.size === 0) {
          this.pendingDom = null;
        }
      });
    (this.pendingDom ??= new Set()).add(pending);
  }

  private takeNext(): SsrWork | null {
    const queue = this.queue;
    if (queue === null || this.queueIndex >= queue.length) {
      this.queue = null;
      this.queueIndex = 0;
      return null;
    }
    return queue[this.queueIndex++];
  }

  private collectPatch(subscriber: SsrDomSubscription): void {
    const patch = subscriber.patch;
    subscriber.patch = null;
    if (patch === null) {
      return;
    }
    const patches = (this.patches ??= []);
    for (let i = patches.length - 1; i >= 0; i--) {
      const previous = patches[i];
      if (previous[0] === patch[0] && previous[1] === patch[1]) {
        patches[i] = patch;
        this.state.notifyRenderer();
        return;
      }
    }
    patches.push(patch);
    this.state.notifyRenderer();
  }

  private fail(error: unknown): void {
    if (this.state.error === NO_ERROR) {
      this.state.error = error;
    }
    this.queue = null;
    this.state.notifyRenderer();
  }
}
