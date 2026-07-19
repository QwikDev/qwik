import type { ValueOrPromise } from '../shared/utils/types';
import type { SerializationStrategy } from '../shared/types';

/** @public */
export interface ReadonlySignal<T = unknown> {
  readonly value: T;
  readonly untrackedValue: T;
}

/** @public */
export interface ComputedSignal<T = unknown> extends ReadonlySignal<T> {
  readonly pending: boolean;
  readonly untrackedPending: boolean;
  /** @deprecated Use `pending` instead. */
  readonly loading: boolean;
  /** @deprecated Use `untrackedPending` instead. */
  readonly untrackedLoading: boolean;
  readonly error: Error | undefined;
  readonly untrackedError: Error | undefined;
  expires: number;
  poll: boolean;
  /** @deprecated Use `expires` and `poll` instead. */
  interval: number;
  promise(): Promise<void>;
  abort(reason?: unknown): void;
  invalidate(info?: unknown): void;
  trigger(): void;
}

/** @public */
export interface PublicSignal<T = unknown> {
  value: T;
  untrackedValue: T;
  trigger(): void;
}

/** @public */
export interface Tracker {
  <T>(fn: () => T): T;
  <T extends object>(obj: T): T extends PublicSignal<infer U> ? U : T;
  <T extends object, P extends keyof T>(obj: T, prop: P): T[P];
}

/** @public */
export type ComputeCtx<T = unknown> = {
  track: Tracker;
  cleanup(callback: () => ValueOrPromise<void>): void;
  readonly abortSignal: AbortSignal;
  readonly previous: T | undefined;
  readonly info?: unknown;
};

/** @deprecated Use `ComputeCtx` instead. @public */
export type AsyncCtx<T = unknown> = ComputeCtx<T>;

/** @public */
export interface ComputedOptions<T = unknown> {
  initial?: T | (() => T);
  serializationStrategy?: SerializationStrategy;
  concurrency?: number;
  eagerCleanup?: boolean;
  expires?: number;
  poll?: boolean;
  /** @deprecated Use `expires` and `poll` instead. */
  interval?: number;
  clientOnly?: boolean;
  allowStale?: boolean;
  timeout?: number;
}

/** @deprecated Use `ComputedOptions` instead. @public */
export type AsyncSignalOptions<T = unknown> = ComputedOptions<T>;

/** @deprecated Use `ComputedSignal` instead. @public */
export type PublicAsyncSignal<T = unknown> = ComputedSignal<T>;

/** @public */
export type SerializerArgObject<T, S> = {
  deserialize(data: Awaited<S>): T;
  initial?: S;
  serialize?(obj: T): S;
};

/** @public */
export type SerializerArg<T, S> =
  | SerializerArgObject<T, S>
  | (() => SerializerArgObject<T, S> & {
      update?(current: T): T | void;
    });
