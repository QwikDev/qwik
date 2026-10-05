import { qwikSymbol } from '../singletons';
/**
 * Class identity that survives duplicated Qwik copies. Each copy has its own class objects, so
 * plain `instanceof` would not recognize an instance made by another copy. A branded class stores
 * its brand bits (including its ancestors') on the prototype under a shared symbol and answers
 * `instanceof` from those bits instead of from the prototype chain.
 */
const BRAND: unique symbol = /*#__PURE__*/ qwikSymbol('brand');

export const enum Brand {
  Signal = 1 << 0,
  Computed = 1 << 1,
  ComputedQrl = 1 << 2,
  AsyncSignal = 1 << 3,
  SerializerSignal = 1 << 4,
  StorePropSource = 1 << 5,
  PropSource = 1 << 6,
  Owner = 1 << 7,
  ContextScope = 1 << 8,
  SlotScope = 1 << 9,
  Projection = 1 << 10,
  TaskSubscription = 1 << 11,
  VisibleTaskSubscription = 1 << 12,
  SsrDomEffect = 1 << 13,
  SsrDomSubscription = 1 << 14,
  SsrDomBatchEffect = 1 << 15,
  SsrBranchSubscription = 1 << 16,
  SsrForBlockSubscription = 1 << 17,
  SsrContentSubscription = 1 << 18,
  SsrSuspenseContentSubscription = 1 << 19,
  SerializationBackRef = 1 << 20,
  SsrProjectionSubscription = 1 << 21,
}

export const hasBrand = (value: unknown, brand: Brand): boolean =>
  value != null &&
  (typeof value === 'object' || typeof value === 'function') &&
  ((Object.getPrototypeOf(value)?.[BRAND] as number) & brand) !== 0;

type BrandedClass = abstract new (...args: any[]) => unknown;

/** Brands `cls` on top of its parent's brands and makes `instanceof cls` brand-based. */
export const brandClass = (cls: BrandedClass, brand: Brand): void => {
  const proto = cls.prototype as { [BRAND]?: number };
  proto[BRAND] = (proto[BRAND] || 0) | brand;
  Object.defineProperty(cls, Symbol.hasInstance, {
    value: (value: unknown) => hasBrand(value, brand),
  });
};
