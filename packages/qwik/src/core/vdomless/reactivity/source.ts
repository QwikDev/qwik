import { SubscriberKind, type Subscriber } from './subscriber';

export interface Source<T = unknown> {
  v: T;
  version: number;
  subs: Subscriber[] | null;
}

export type Dependency<T = unknown> = Source<T>;

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
