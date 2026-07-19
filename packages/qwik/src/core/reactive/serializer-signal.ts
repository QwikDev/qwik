import type { QRLInternal } from '../shared/qrl/qrl-class';
import { isPromise } from '../shared/utils/promises';
import type { ContainerContext } from '../runtime/container-context';
import { Computed, readComputed, readComputedUntracked } from './computed';
import { ComputedFlags } from './flags';
import { markComputedDirty } from './notify';
import { getFunctionOrResolve } from '../utils/qrl';
import type { SerializerArg, SerializerArgObject } from './public-types';
import { NEEDS_COMPUTATION } from './constants';

export type SerializerSignalQrl<T, S> = QRLInternal<SerializerArg<T, S>>;
export type SerializerArgObjectWithInitial<T, S> = SerializerArgObject<T, S> & { initial: S };
export type SerializerArgFactoryWithInitial<T, S> = () => SerializerArgObjectWithInitial<T, S> & {
  update?: (current: T) => T | void;
};
export type UseSerializerDollar = {
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
    super(null, computeSerializerValue);
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
