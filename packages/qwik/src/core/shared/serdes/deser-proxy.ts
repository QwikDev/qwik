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
  const target = Array(reader.$rootEnds$.length).fill(undefined);
  return new Proxy(
    target,
    new BinaryDeserializationHandler(container, reader, target)
  ) as unknown[];
};

class DeserializationHandler implements ProxyHandler<object> {
  constructor(
    public $container$: DomContainer,
    public $data$: unknown[]
  ) {}

  $rootCount$(): number {
    return this.$data$.length / 2;
  }

  $typeId$(index: number): TypeIds {
    return this.$data$[index * 2] as TypeIds;
  }

  /** The serialized value, or the restored one when the typeId is Plain. */
  $value$(index: number): unknown {
    return this.$data$[index * 2 + 1];
  }

  $markRestored$(index: number, value: unknown): void {
    this.$data$[index * 2] = TypeIds.Plain;
    this.$data$[index * 2 + 1] = value;
  }

  get(target: unknown[], property: PropertyKey, receiver: object) {
    if (property === SERIALIZER_PROXY_UNWRAP) {
      // Note that this will only be partially filled in
      return target;
    }
    const i =
      typeof property === 'number'
        ? property
        : typeof property === 'string'
          ? parseInt(property as string, 10)
          : NaN;
    if (Number.isNaN(i) || i < 0 || i >= this.$rootCount$()) {
      return Reflect.get(target, property, receiver);
    }
    const typeId = this.$typeId$(i);
    const value = this.$value$(i);
    if (typeId === TypeIds.Plain) {
      // The value is already cached
      return value;
    }

    const container = this.$container$;
    const ownsPendingStoreTargets = beginDeserialization(container);
    try {
      const propValue = allocate(container, typeId, value);

      Reflect.set(target, property, propValue);
      this.$markRestored$(i, propValue);

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
    if (Number.isNaN(i) || i < 0 || i >= this.$rootCount$()) {
      return out;
    }
    this.$markRestored$(i, value);
    return true;
  }
}

/** Restored roots live in the proxy target; the bytes are never rewritten. */
class BinaryDeserializationHandler extends DeserializationHandler {
  private $isRestored$: Uint8Array;
  /** The root read by the last `$typeId$()` call. */
  private $pending$: unknown[] = [0, 0];

  constructor(
    container: DomContainer,
    public $reader$: BinaryStateReader,
    /** The proxy target, which holds the restored roots. */
    private $restored$: unknown[]
  ) {
    super(container, []);
    this.$isRestored$ = new Uint8Array($restored$.length);
  }

  $rootCount$(): number {
    return this.$isRestored$.length;
  }

  $typeId$(index: number): TypeIds {
    if (this.$isRestored$[index]) {
      return TypeIds.Plain;
    }
    this.$reader$.$readRoot$(index, this.$pending$);
    return this.$pending$[0] as TypeIds;
  }

  $value$(index: number): unknown {
    return this.$isRestored$[index] ? this.$restored$[index] : this.$pending$[1];
  }

  $markRestored$(index: number, value: unknown): void {
    this.$isRestored$[index] = 1;
    this.$restored$[index] = value;
  }
}
