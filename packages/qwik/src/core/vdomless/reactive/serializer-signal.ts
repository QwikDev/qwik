import type { QRLInternal } from '../../shared/qrl/qrl-class';
import type { QRL } from '../../shared/qrl/qrl.public';
import { implicit$FirstArg } from '../../shared/qrl/implicit_dollar';
import { isPromise } from '../../shared/utils/promises';
import type { SerializerArg, SerializerArgObject } from '../../reactive-primitives/types';
import { registerSubscriberToOwner } from '../runtime/owner';
import { getActiveInvokeContextOrNull } from '../runtime/invoke-context';
import type { ContainerContext } from '../runtime/container-context';
import { Computed, markComputedDirty, readComputed, readComputedUntracked } from './computed';
import { ComputedFlags } from './flags';
import { NEEDS_COMPUTATION } from '../../reactive-primitives/types';
import { getFunctionOrResolve } from '../utils/qrl';

export type SerializerSignalQrl<T, S> = QRLInternal<SerializerArg<T, S>>;
type SerializerArgObjectWithInitial<T, S> = SerializerArgObject<T, S> & { initial: S };
type SerializerArgFactoryWithInitial<T, S> = () => SerializerArgObjectWithInitial<T, S> & {
  update?: (current: T) => T | void;
};
type CreateSerializerDollar = {
  <T, S>(arg: SerializerArgObjectWithInitial<T, S>): SerializerSignal<T, S>;
  <T, S>(arg: SerializerArgFactoryWithInitial<T, S>): SerializerSignal<T, S>;
  <T, S>(arg: SerializerArg<T, S>): SerializerSignal<T, S>;
};

export class SerializerSignal<T, S = unknown> extends Computed<T> {
  didInitialize = false;

  constructor(
    public argQrl: SerializerSignalQrl<T, S> | null,
    public container?: ContainerContext,
    public arg: SerializerArg<T, S> | null = null
  ) {
    super(computeSerializerValue);
    this.v = NEEDS_COMPUTATION as T;
  }

  override get value(): T {
    if (!this.didInitialize) {
      this.flags |= ComputedFlags.Dirty;
    }
    return readComputed(this);
  }

  override get untrackedValue(): T {
    if (!this.didInitialize) {
      this.flags |= ComputedFlags.Dirty;
    }
    return readComputedUntracked(this);
  }

  set untrackedValue(value: T) {
    this.v = value;
    this.flags = (this.flags & ~ComputedFlags.Dirty) | ComputedFlags.HasValue;
  }

  invalidate(): void {
    if (this.owner === null) {
      this.flags |= ComputedFlags.Dirty;
      return;
    }
    markComputedDirty(this);
  }

  force(): void {
    this.invalidate();
  }

  trigger(): void {
    this.invalidate();
  }
}

export function createSerializerQrl<T, S>(
  argQrl: QRL<SerializerArg<T, S>>
): SerializerSignal<T, S> {
  const container = getActiveInvokeContextOrNull()?.container;
  const signal = new SerializerSignal<T, S>(argQrl as SerializerSignalQrl<T, S>, container);
  void signal.argQrl!.resolve(container).catch(() => {});
  return registerSubscriberToOwner(signal);
}

export function createSerializer<T, S>(
  arg: SerializerArgObjectWithInitial<T, S>
): SerializerSignal<T, S>;
export function createSerializer<T, S>(
  arg: SerializerArgFactoryWithInitial<T, S>
): SerializerSignal<T, S>;
export function createSerializer<T, S>(arg: SerializerArg<T, S>): SerializerSignal<T, S>;
export function createSerializer<T, S>(arg: SerializerArg<T, S>): SerializerSignal<T, S> {
  return registerSubscriberToOwner(
    new SerializerSignal<T, S>(null, getActiveInvokeContextOrNull()?.container, arg)
  );
}

export const createSerializer$: CreateSerializerDollar = /*#__PURE__*/ implicit$FirstArg(
  createSerializerQrl as any
);

function computeSerializerValue<T, S>(this: SerializerSignal<T, S>): T {
  const argQrl = this.argQrl;
  let arg = this.arg;
  if (arg === null && argQrl === null) {
    throw new Error('Serializer QRL is not initialized');
  }

  if (arg === null) {
    const resolved = getFunctionOrResolve(argQrl!, this.container);
    if (isPromise(resolved)) {
      throw resolved;
    }
    arg = resolved as SerializerArg<T, S>;
  }

  const serializerArg = resolveSerializerArg(arg);
  const currentValue = this.v === NEEDS_COMPUTATION ? serializerArg.initial : this.v;
  if (this.didInitialize) {
    return ((serializerArg as any).update?.(currentValue as T) || currentValue) as T;
  }
  this.didInitialize = true;
  return serializerArg.deserialize(currentValue as Awaited<S>);
}

function resolveSerializerArg<T, S>(arg: SerializerArg<T, S>): SerializerArgObject<T, S> {
  return typeof arg === 'function' ? arg() : arg;
}
