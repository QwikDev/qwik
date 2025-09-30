import { TypeIds } from './constants';
import type { DomContainer } from '../../client/dom-container';
import { vnode_isVNode } from '../../client/vnode';
import { isObject } from '../utils/types';
import { allocate } from './allocate';
import { inflate } from './inflate';

/** Arrays/Objects are special-cased so their identifiers is a single digit. */
export const needsInflation = (typeId: TypeIds) =>
  typeId >= TypeIds.Error || typeId === TypeIds.Array || typeId === TypeIds.Object;
const deserializedProxyMap = new WeakMap<object, unknown[]>();
type DeserializerProxy<T extends object = object> = T & { [SERIALIZER_PROXY_UNWRAP]: object };

export const isDeserializerProxy = (value: unknown): value is DeserializerProxy => {
  return isObject(value) && SERIALIZER_PROXY_UNWRAP in value;
};

export const SERIALIZER_PROXY_UNWRAP = Symbol('UNWRAP');
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
class DeserializationHandler implements ProxyHandler<object> {
  public $length$: number;

  constructor(
    public $container$: DomContainer,
    public $data$: unknown[]
  ) {
    this.$length$ = this.$data$.length / 2;
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
    if (Number.isNaN(i) || i < 0 || i >= this.$length$) {
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
    const propValue = allocate(container, typeId, value);

    Reflect.set(target, property, propValue);
    this.$data$[idx] = TypeIds.Plain;
    this.$data$[idx + 1] = propValue;

    /** We stored the reference, so now we can inflate, allowing cycles */
    if (needsInflation(typeId)) {
      inflate(container, propValue, typeId, value);
    }

    return propValue;
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
