import { _qwikSymbol } from '@qwik.dev/core/internal';

/**
 * Makes `instanceof cls` also match instances made by another copy of the router, such as the one a
 * Qwik library kept external on the server evaluates. Subclasses need their own call.
 */
export const shareClassIdentity = (
  cls: abstract new (...args: any[]) => unknown,
  name: string
): void => {
  const tag = _qwikSymbol(`router.${name}`);
  (cls.prototype as Record<symbol, boolean>)[tag] = true;
  Object.defineProperty(cls, Symbol.hasInstance, {
    value(this: Function, value: unknown) {
      // A user subclass inherits this method, so it keeps the prototype-chain check.
      if (this !== cls) {
        return Function.prototype[Symbol.hasInstance].call(this, value);
      }
      return value != null && typeof value === 'object' && tag in value;
    },
  });
};
