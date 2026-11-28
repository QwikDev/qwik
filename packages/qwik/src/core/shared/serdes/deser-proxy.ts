import { TypeIds } from './constants';
import type { DomContainer } from '../../client/dom-container';
import { vnode_isVNode } from '../../client/vnode-utils';
import { isObject } from '../utils/types';
import { registerSingleton, qwikSymbol } from '../singletons';
import { allocate, beginDeserialization, endDeserialization } from './allocate';
import { inflate } from './inflate';
import {
  createYieldingIteratorState,
  scheduleYieldingIterator,
} from '../../client/yielding-iterator';
import type { BinaryStateReader } from './binary-state';

/** Arrays/Objects are special-cased so their identifiers is a single digit. */
export const needsInflation = (typeId: TypeIds) =>
  typeId >= TypeIds.Error || typeId === TypeIds.Array || typeId === TypeIds.Object;
const deserializedProxyMap = /*#__PURE__*/ registerSingleton(
  'deserializedProxyMap',
  () => new WeakMap<object, unknown[]>()
);
type DeserializerProxy<T extends object = object> = T & { [SERIALIZER_PROXY_UNWRAP]: object };

export const isDeserializerProxy = (value: unknown): value is DeserializerProxy => {
  return isObject(value) && SERIALIZER_PROXY_UNWRAP in value;
};

export const SERIALIZER_PROXY_UNWRAP: unique symbol = /*#__PURE__*/ qwikSymbol('UNWRAP');
/** Call this on the serialized root state */
export const wrapDeserializerProxy = (container: DomContainer, data: unknown): unknown[] => {
  if (
    !Array.isArray(data) || // must be an array
    vnode_isVNode(data) || // and not a VNode or Slot
    isDeserializerProxy(data) // and not already wrapped
  ) {
    return data as any;
  }
  let proxy = deserializedProxyMap.get(data);
  if (!proxy) {
    const target = Array(data.length / 2).fill(undefined);
    proxy = new Proxy(target, new DeserializationHandler(container, data)) as unknown[];
    deserializedProxyMap.set(data, proxy);
  }
  return proxy;
};
/** Returns a root only when it is already restored; never restores it. */
export const peekRestoredRoot = (rawStateData: unknown[], id: number): unknown => {
  const typeAt = id * 2;
  return rawStateData[typeAt] === TypeIds.Plain ? rawStateData[typeAt + 1] : undefined;
};

/** Call this on the binary root state */
export const wrapBinaryStateProxy = (
  container: DomContainer,
  reader: BinaryStateReader,
  /** Whether to restore the last roots in the background and release the state text. */
  releaseState = true
): unknown[] => {
  const restoredRoots = Array(reader.$rootEnds$.length).fill(undefined);
  return new Proxy(
    restoredRoots,
    new BinaryDeserializationHandler(container, reader, restoredRoots, releaseState)
  ) as unknown[];
};

const toRootIndex = (property: PropertyKey): number => {
  if (typeof property === 'number') {
    return property;
  }
  const index = typeof property === 'string' ? +property : NaN;
  // Only a canonical index is a root: '0note' or '1.5' are named properties.
  return String(index >>> 0) === property ? index : NaN;
};

class DeserializationHandler implements ProxyHandler<object> {
  constructor(
    public $container$: DomContainer,
    public $data$: unknown[]
  ) {}

  get(target: unknown[], property: PropertyKey, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      // Note that this will only be partially filled in
      return target;
    }
    const i = toRootIndex(property);
    if (Number.isNaN(i) || i < 0 || i >= this.$data$.length / 2) {
      return Reflect.get(target, property, receiver);
    }
    // The serialized data is an array with 2 values for each item
    const idx = i * 2;
    const typeId = this.$data$[idx] as number;
    const value = this.$data$[idx + 1];
    if (typeId === TypeIds.Plain) {
      // The value is already cached
      return value;
    }

    const container = this.$container$;
    const ownsPendingStoreTargets = beginDeserialization(container);
    try {
      const propValue = allocate(container, typeId, value);

      Reflect.set(target, property, propValue);
      this.$data$[idx] = TypeIds.Plain;
      this.$data$[idx + 1] = propValue;

      /** We stored the reference, so now we can inflate, allowing cycles */
      if (needsInflation(typeId)) {
        inflate(container, propValue, typeId, value);
      }

      return propValue;
    } finally {
      endDeserialization(container, ownsPendingStoreTargets);
    }
  }

  has(target: object, property: PropertyKey) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  set(target: object, property: PropertyKey, value: any, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return false;
    }
    const out = Reflect.set(target, property, value, receiver);
    const i = toRootIndex(property);
    if (Number.isNaN(i) || i < 0 || i >= this.$data$.length / 2) {
      return out;
    }
    const idx = i * 2;
    this.$data$[idx] = TypeIds.Plain;
    this.$data$[idx + 1] = value;
    return true;
  }
}

/** Once this much is restored, the rest is restored in the background and the text released. */
const RELEASE_STATE_AT = 0.9;

const whenIdle = (callback: () => void): void => {
  (globalThis.requestIdleCallback ?? setTimeout)(callback);
};

/** Restored roots live in the proxy target; the state text is never rewritten. */
class BinaryDeserializationHandler implements ProxyHandler<object> {
  private $isRestored$: Uint8Array;
  /** The roots restored by the read in progress; they can point at each other. */
  private $rootsBeingRestored$: number[] | null = null;
  /** Units of the roots that are not restored; the framing around roots is nobody's to restore. */
  private $unrestoredUnits$ = 0;
  private $isReleaseScheduled$: boolean;
  /** Null once every root is restored and the state text is released. */
  private $reader$: BinaryStateReader | null;

  constructor(
    private $container$: DomContainer,
    reader: BinaryStateReader,
    private $restoredRoots$: unknown[],
    releaseState: boolean
  ) {
    this.$isReleaseScheduled$ = !releaseState;
    this.$reader$ = reader;
    this.$countUnrestoredRoots$(0);
    reader.$onRootsAdded$ = () => this.$addRoots$();
    // Every root may be restored by now, and then no read would start the release.
    reader.$onPatchesEnded$ = () => this.$reader$ && this.$releaseStateWhenMostlyRestored$();
    this.$isRestored$ = new Uint8Array($restoredRoots$.length);
    reader.$onRootAllocated$ = (rootIndex, value) => this.$markRestored$(rootIndex, value);
  }

  private $markRestored$(rootIndex: number, value: unknown): void {
    if (!this.$isRestored$[rootIndex]) {
      this.$isRestored$[rootIndex] = 1;
      this.$unrestoredUnits$ -= this.$reader$!.$rootSizes$[rootIndex];
    }
    this.$restoredRoots$[rootIndex] = value;
    this.$rootsBeingRestored$?.push(rootIndex);
  }

  /** A state patch has added roots to the reader. */
  private $countUnrestoredRoots$(firstRoot: number): void {
    const rootSizes = this.$reader$!.$rootSizes$;
    for (let i = firstRoot; i < rootSizes.length; i++) {
      this.$unrestoredUnits$ += rootSizes[i];
    }
  }

  private $addRoots$(): void {
    const reader = this.$reader$!;
    const isRestored = new Uint8Array(reader.$rootEnds$.length);
    this.$countUnrestoredRoots$(this.$isRestored$.length);
    isRestored.set(this.$isRestored$);
    this.$isRestored$ = isRestored;
    while (this.$restoredRoots$.length < isRestored.length) {
      this.$restoredRoots$.push(undefined);
    }
  }

  /** Restores the remaining roots so that nothing needs the state text anymore. */
  private *$restoreRemainingRoots$(): Generator<void, void, void> {
    const isRestored = this.$isRestored$;
    const container = this.$container$;
    for (let i = 0; i < isRestored.length; i++) {
      const reader = this.$reader$;
      if (!reader) {
        return;
      }
      if (!isRestored[i]) {
        // Other code restores roots between the slices, so each root is its own pass.
        const ownsPendingStoreTargets = beginDeserialization(container);
        try {
          this.$markRestored$(i, reader.$restoreRoot$(container, i));
        } finally {
          endDeserialization(container, ownsPendingStoreTargets);
        }
        yield;
      }
    }
  }

  /** Lets go of the reader, and with it the state text, in both directions. */
  private $release$(): void {
    const reader = this.$reader$;
    if (reader) {
      reader.$onRootsAdded$ = reader.$onPatchesEnded$ = reader.$onRootAllocated$ = () => {};
      this.$reader$ = null;
    }
  }

  private $releaseStateWhenMostlyRestored$(): void {
    const unitCount = this.$reader$!.$unitCount$;
    const isMostlyRestored = this.$unrestoredUnits$ < unitCount * (1 - RELEASE_STATE_AT);
    // State patches refer to the text of the scripts before them.
    const canPatchesArrive = this.$reader$!.$restoredByOffset$ !== null;
    if (this.$isReleaseScheduled$ || canPatchesArrive || !isMostlyRestored) {
      return;
    }
    this.$isReleaseScheduled$ = true;
    whenIdle(() => {
      const restoring = createYieldingIteratorState(
        this.$restoreRemainingRoots$(),
        () => this.$release$(),
        // A root that cannot be restored must only fail for the code that asks for it.
        () => {}
      );
      scheduleYieldingIterator(restoring);
    });
  }

  has(target: object, property: PropertyKey) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return true;
    }
    return Object.prototype.hasOwnProperty.call(target, property);
  }

  get(target: unknown[], property: PropertyKey, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return target;
    }
    const reader = this.$reader$;
    const i = toRootIndex(property);
    if (!reader || Number.isNaN(i) || i < 0 || i >= this.$isRestored$.length) {
      return Reflect.get(target, property, receiver);
    }
    if (this.$isRestored$[i]) {
      return target[i];
    }
    const container = this.$container$;
    const isOutermost = beginDeserialization(container);
    const isOutermostRead = !this.$rootsBeingRestored$;
    const restoredByOffset = reader.$restoredByOffset$;
    const rememberedBefore = restoredByOffset ? restoredByOffset.size : 0;
    if (isOutermostRead) {
      this.$rootsBeingRestored$ = [];
    }
    try {
      const value = reader.$restoreRoot$(container, i);
      this.$markRestored$(i, value);
      if (isOutermost) {
        this.$releaseStateWhenMostlyRestored$();
      }
      return value;
    } catch (error) {
      if (isOutermostRead) {
        // Half-filled roots must not be handed out; the next read fails again.
        const tainted = this.$rootsBeingRestored$!;
        for (let j = 0; j < tainted.length; j++) {
          this.$isRestored$[tainted[j]] = 0;
          this.$unrestoredUnits$ += reader.$rootSizes$[tainted[j]];
          target[tainted[j]] = undefined;
        }
        // Keep what earlier reads remembered; a later patch may share it.
        const offsets = restoredByOffset ? Array.from(restoredByOffset.keys()) : [];
        for (let j = rememberedBefore; j < offsets.length; j++) {
          restoredByOffset!.delete(offsets[j]);
        }
      }
      throw error;
    } finally {
      if (isOutermostRead) {
        this.$rootsBeingRestored$ = null;
      }
      endDeserialization(container, isOutermost);
    }
  }

  set(target: object, property: PropertyKey, value: any, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return false;
    }
    const out = Reflect.set(target, property, value, receiver);
    if (property === 'length') {
      // A destroyed container empties its state; a restore in the background must not refill it.
      this.$release$();
    }
    const i = toRootIndex(property);
    if (this.$reader$ && !(Number.isNaN(i) || i < 0 || i >= this.$isRestored$.length)) {
      this.$markRestored$(i, value);
    }
    return out;
  }
}
