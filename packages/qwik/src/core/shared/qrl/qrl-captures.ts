import type { QrlArgs } from './qrl.public';

/**
 * The current captured scope during QRL invocation. This is used to provide the lexical scope for
 * QRL functions. It is used one time per invocation, synchronously, so it is safe to store it in
 * module scope.
 *
 * @internal
 */
export let _captures: Readonly<unknown[]> | null = null;

export const setCaptures = (captures: Readonly<unknown[]> | null) => {
  _captures = captures;
};

const setQrlCaptures = (captures: Readonly<unknown[]> | null | undefined) => {
  _captures = captures ?? null;
};

/** @internal */
export const withCaptures = <TYPE>(
  ref: TYPE,
  captures: Readonly<unknown[]> | null | undefined
): TYPE => {
  if (typeof ref !== 'function' || !captures) {
    return ref;
  }
  return function boundCaptures(this: unknown, ...args: QrlArgs<TYPE>) {
    setQrlCaptures(captures);
    return ref.apply(this, args);
  } as TYPE;
};
