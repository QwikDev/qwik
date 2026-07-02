import { SubscriberKind, type Subscriber } from '../runtime/subscriber';
import type { LazySerialized } from './lazy-serialized';

export type SourceSub = Subscriber | LazySerialized<Subscriber>;
export type SourceSubs = SourceSub[] | null;

export interface Source<T = unknown> {
  v: T;
  version: number;
  subs: SourceSubs;
}

export interface ComputedSource<T = unknown> extends Source<T> {
  readonly kind: SubscriberKind.Computed;
  readonly value: T;
}

export function isComputedSource<T>(source: Source<T>): source is ComputedSource<T> {
  return (source as { kind?: unknown }).kind === SubscriberKind.Computed;
}

export function readSourceValue<T>(source: Source<T>): T {
  return isComputedSource(source) ? source.value : source.v;
}

export function peekSourceValue<T>(source: Source<T>): T {
  return source.v;
}
