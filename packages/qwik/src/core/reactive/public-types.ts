import type { ValueOrPromise } from '../shared/utils/types';

/** @public */
export interface ReadonlySignal<T = unknown> {
  readonly value: T;
  readonly untrackedValue: T;
}

/** @public */
export type ComputedSignal<T = unknown> = ReadonlySignal<T>;

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
export type AsyncCtx<T = unknown> = {
  track: Tracker;
  cleanup(callback: () => ValueOrPromise<void>): void;
  readonly abortSignal: AbortSignal;
  readonly previous: T | undefined;
  readonly info?: unknown;
};

/** @public */
export interface AsyncSignalOptions<T> {
  initial?: T | (() => T);
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

/** @public */
export interface PublicAsyncSignal<T = unknown> extends PublicSignal<T> {
  loading: boolean;
  untrackedLoading: boolean;
  error: Error | undefined;
  untrackedError: Error | undefined;
  expires: number;
  poll: boolean;
  /** @deprecated Use `expires` and `poll` instead. */
  interval: number;
  promise(): Promise<void>;
  abort(reason?: unknown): void;
  invalidate(info?: unknown): void;
}

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
