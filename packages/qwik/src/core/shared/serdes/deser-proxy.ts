import { TypeIds } from './constants';
import type { DomContainer } from '../../client/dom-container';
import { vnode_isVNode } from '../../client/vnode-utils';
import { isObject } from '../utils/types';
import { registerSingleton, qwikSymbol } from '../singletons';
import { allocate, beginDeserialization, endDeserialization } from './allocate';
import { inflate } from './inflate';
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
  reader: BinaryStateReader
): unknown[] => {
  const restoredRoots = Array(reader.$rootEnds$.length).fill(undefined);
  return new Proxy(
    restoredRoots,
    new BinaryDeserializationHandler(container, reader, restoredRoots)
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

/** Restored roots live in the proxy target; the state text is never rewritten. */
class BinaryDeserializationHandler implements ProxyHandler<object> {
  private $isRestored$: Uint8Array;

  constructor(
    private $container$: DomContainer,
    private $reader$: BinaryStateReader,
    private $restoredRoots$: unknown[]
  ) {
    const reader = $reader$;
    reader.$onRootsAdded$ = () => this.$addRoots$();
    this.$isRestored$ = new Uint8Array($restoredRoots$.length);
    reader.$onRootAllocated$ = (rootIndex, value) => this.$markRestored$(rootIndex, value);
  }

  private $markRestored$(rootIndex: number, value: unknown): void {
    this.$isRestored$[rootIndex] = 1;
    this.$restoredRoots$[rootIndex] = value;
  }

  /** A state patch has added roots to the reader. */
  private $addRoots$(): void {
    const reader = this.$reader$;
    const isRestored = new Uint8Array(reader.$rootEnds$.length);
    isRestored.set(this.$isRestored$);
    this.$isRestored$ = isRestored;
    while (this.$restoredRoots$.length < isRestored.length) {
      this.$restoredRoots$.push(undefined);
    }
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
    if (Number.isNaN(i) || i < 0 || i >= this.$isRestored$.length) {
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
      return value;
    } catch (error) {
      // A half-filled root must not be handed out; the next read fails again.
      this.$isRestored$[i] = 0;
      target[i] = undefined;
      reader.$restoredByOffset$?.clear();
      throw error;
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
    if (!(Number.isNaN(i) || i < 0 || i >= this.$isRestored$.length)) {
      this.$markRestored$(i, value);
    }
    return out;
  }
}
