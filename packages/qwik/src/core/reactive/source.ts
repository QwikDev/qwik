import { SubscriberKind, type Subscriber } from '../runtime/subscriber';
import type { LazySerialized } from './lazy-serialized';

export type SourceSub = Subscriber | LazySerialized<Subscriber>;
export type SourceSubs = SourceSub | SourceSub[] | null;

export interface Source<T = unknown> {
  v: T;
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

export function appendSourceSubscriber(source: Source, subscriber: SourceSub): void {
  const subs = source.subs;
  if (subs === null) {
    source.subs = subscriber;
  } else if (Array.isArray(subs)) {
    subs.push(subscriber);
  } else {
    source.subs = [subs, subscriber];
  }
}
