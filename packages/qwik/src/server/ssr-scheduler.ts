import {
  maybeThen,
  runTaskSubscriber,
  type PhaseSubscriber,
  type TaskScheduler,
  type TaskSubscriber,
} from '@qwik.dev/core';
import { OwnerFlags, SubscriberFlags, SubscriberKind } from './qwik-copy';

export interface SsrLaneSerializationContext {
  $addRoot$(value: unknown): number;
}

const NO_ERROR = Symbol();

export class SsrScheduler {
  private nextLaneId = 0;

  createLane(
    serializationCtx: SsrLaneSerializationContext,
    parent: SsrLane | null = null
  ): SsrLane {
    return new SsrLane(this.nextLaneId++, parent?.id ?? null, serializationCtx);
  }
}

export class SsrLane implements TaskScheduler {
  private queue: TaskSubscriber[] | null = null;
  private queueIndex = 0;
  private pending: Promise<void> | null = null;
  private running = false;
  private error: unknown = NO_ERROR;

  constructor(
    readonly id: number,
    readonly parentId: number | null,
    readonly serializationCtx: SsrLaneSerializationContext
  ) {}

  notify(subscriber: PhaseSubscriber): void {
    if (subscriber.kind !== SubscriberKind.Task) {
      return;
    }
    const owner = subscriber.owner;
    if (owner === null || owner.flags & OwnerFlags.Disposed || this.error !== NO_ERROR) {
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
    const pending = this.pending;
    if (pending === null) {
      this.throwIfFailed();
      return;
    }
    return maybeThen(pending, () => this.flush());
  }

  private start(first: TaskSubscriber): void {
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

    if (result instanceof Promise) {
      this.observe(result);
    }
  }

  private drain(current: TaskSubscriber | null): void | Promise<void> {
    while (current !== null) {
      const result = runTaskSubscriber(current);
      if (result instanceof Promise) {
        return result.then(() => this.drain(this.takeNext()));
      }
      current = this.takeNext();
    }
  }

  private observe(result: Promise<void>): void {
    this.pending = result.then(
      () => {
        this.pending = null;
        const next = this.takeNext();
        if (next !== null) {
          this.start(next);
        }
      },
      (error) => {
        this.pending = null;
        this.fail(error);
      }
    );
  }

  private takeNext(): TaskSubscriber | null {
    const queue = this.queue;
    if (queue === null || this.queueIndex >= queue.length) {
      this.queue = null;
      this.queueIndex = 0;
      return null;
    }
    return queue[this.queueIndex++];
  }

  private fail(error: unknown): void {
    this.error = error;
    this.queue = null;
    this.queueIndex = 0;
  }

  private throwIfFailed(): void {
    if (this.error !== NO_ERROR) {
      throw this.error;
    }
  }
}
