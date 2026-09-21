/**
 * Class identity that survives duplicated Qwik copies. Each copy has its own class objects, so
 * plain `instanceof` would not recognize an instance made by another copy. A branded class stores
 * its brand bits (including its ancestors') on the prototype under a shared symbol and answers
 * `instanceof` from those bits instead of from the prototype chain.
 */
const BRAND = Symbol.for('qwik.brand');

export const enum Brand {
  Signal = 1 << 0,
  WrappedSignal = 1 << 1,
  ComputedSignal = 1 << 2,
  AsyncSignal = 1 << 3,
  SerializerSignal = 1 << 4,
  Task = 1 << 5,
  JSXNode = 1 << 6,
  SubscriptionData = 1 << 7,
  VNode = 1 << 8,
  VirtualVNode = 1 << 9,
  ElementVNode = 1 << 10,
  TextVNode = 1 << 11,
  DomContainer = 1 << 12,
  StoreHandler = 1 << 13,
  SetTextOperation = 1 << 14,
  SetAttributeOperation = 1 << 15,
  DeleteOperation = 1 << 16,
  RemoveAllChildrenOperation = 1 << 17,
  InsertOrMoveOperation = 1 << 18,
  EffectSubscription = 1 << 19,
  SubscriptionPatch = 1 << 20,
  SerializationBackRef = 1 << 21,
}

export const hasBrand = (value: unknown, brand: Brand): boolean =>
  value != null &&
  (typeof value === 'object' || typeof value === 'function') &&
  ((value as any)[BRAND] & brand) !== 0;

type BrandedClass = abstract new (...args: any[]) => unknown;

/** Brands `cls` on top of its parent's brands and makes `instanceof cls` brand-based. */
export const brandClass = (cls: BrandedClass, brand: Brand): void => {
  const proto = cls.prototype as { [BRAND]?: number };
  proto[BRAND] = (proto[BRAND] || 0) | brand;
  Object.defineProperty(cls, Symbol.hasInstance, {
    value: (value: unknown) => hasBrand(value, brand),
  });
};
