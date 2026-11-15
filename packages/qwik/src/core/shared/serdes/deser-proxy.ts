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

const toRootIndex = (property: PropertyKey): number =>
  typeof property === 'number'
    ? property
    : typeof property === 'string'
      ? parseInt(property as string, 10)
      : NaN;

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
    const i = typeof property === 'number' ? property : parseInt(property as string, 10);
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
class BinaryDeserializationHandler extends DeserializationHandler {
  private $isRestored$: Uint8Array;
  private $unrestoredUnits$: number;
  private $isReleaseScheduled$: boolean;
  /** Units of the stream that `$unrestoredUnits$` accounts for. */
  private $knownUnits$: number;
  /** Null once every root is restored and the state text is released. */
  private $reader$: BinaryStateReader | null;

  constructor(
    container: DomContainer,
    reader: BinaryStateReader,
    private $restoredRoots$: unknown[],
    releaseState: boolean
  ) {
    super(container, []);
    this.$isReleaseScheduled$ = !releaseState;
    this.$reader$ = reader;
    this.$unrestoredUnits$ = this.$knownUnits$ = reader.$unitCount$;
    reader.$onRootsAdded$ = () => this.$addRoots$();
    this.$isRestored$ = new Uint8Array($restoredRoots$.length);
    reader.$onRootAllocated$ = (rootIndex, value) => this.$markRestored$(rootIndex, value);
  }

  private $markRestored$(rootIndex: number, value: unknown): void {
    if (!this.$isRestored$[rootIndex]) {
      this.$isRestored$[rootIndex] = 1;
      this.$unrestoredUnits$ -= this.$reader$!.$rootSizes$[rootIndex];
    }
    this.$restoredRoots$[rootIndex] = value;
  }

  /** A state patch has added roots to the reader. */
  private $addRoots$(): void {
    const reader = this.$reader$!;
    const isRestored = new Uint8Array(reader.$rootEnds$.length);
    isRestored.set(this.$isRestored$);
    this.$isRestored$ = isRestored;
    while (this.$restoredRoots$.length < isRestored.length) {
      this.$restoredRoots$.push(undefined);
    }
    this.$unrestoredUnits$ += reader.$unitCount$ - this.$knownUnits$;
    this.$knownUnits$ = reader.$unitCount$;
  }

  /** Restores the remaining roots so that nothing needs the state text anymore. */
  private *$restoreRemainingRoots$(): Generator<void, void, void> {
    const reader = this.$reader$!;
    const isRestored = this.$isRestored$;
    const container = this.$container$;
    for (let i = 0; i < isRestored.length; i++) {
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
        () => (this.$reader$ = null),
        // A root that cannot be restored must only fail for the code that asks for it.
        () => {}
      );
      scheduleYieldingIterator(restoring);
    });
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
    try {
      const value = reader.$restoreRoot$(container, i);
      this.$markRestored$(i, value);
      if (isOutermost) {
        this.$releaseStateWhenMostlyRestored$();
      }
      return value;
    } finally {
      endDeserialization(container, isOutermost);
    }
  }

  set(target: object, property: PropertyKey, value: any, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      return false;
    }
    const out = Reflect.set(target, property, value, receiver);
    const i = toRootIndex(property);
    if (this.$reader$ && !(Number.isNaN(i) || i < 0 || i >= this.$isRestored$.length)) {
      this.$isRestored$[i] = 1;
    }
    return out;
  }
}
