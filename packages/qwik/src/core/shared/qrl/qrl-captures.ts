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

/** Brands capture-bound segment functions: framework-created, never serialized from the client. */
export const BOUND_CAPTURES = Symbol('bound-captures');

export const isBoundCapturesFunction = (value: unknown): boolean => {
  return typeof value === 'function' && (value as any)[BOUND_CAPTURES] === true;
};

/** @internal */
export const withCaptures = <TYPE>(
  ref: TYPE,
  captures: Readonly<unknown[]> | null | undefined
): TYPE => {
  if (typeof ref !== 'function' || !captures) {
    return ref;
  }
  const bound = function boundCaptures(this: unknown) {
    setQrlCaptures(captures);
    return (ref as Function).apply(this, arguments);
  };
  (bound as any)[BOUND_CAPTURES] = true;
  return bound as TYPE;
};
