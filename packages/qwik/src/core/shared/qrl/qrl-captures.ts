import { registerSingleton } from '../singletons';

/** @internal */
export const _capturesObj = /*#__PURE__*/ registerSingleton('qrlCaptures', () => ({
  _: null as Readonly<unknown[]> | null,
}));

/** @deprecated Compiled segments read `_capturesObj._` instead. @internal */
export let _captures: Readonly<unknown[]> | null = null;

export const setCaptures = (captures: Readonly<unknown[]> | null) => {
  _captures = _capturesObj._ = captures;
};

/** @internal */
export function invokeCaptured<T, TArgs extends unknown[]>(
  fn: (...args: TArgs) => T,
  captures: Readonly<unknown[]> | null | undefined,
  receiver: unknown,
  args: TArgs
): T {
  if (captures) {
    setCaptures(captures);
  }
  return fn.apply(receiver, args);
}

/** @internal */
export const withCaptures = <TYPE>(
  ref: TYPE,
  captures: Readonly<unknown[]> | null | undefined
): TYPE => {
  if (typeof ref !== 'function' || !captures) {
    return ref;
  }
  return function boundCaptures(this: unknown, ...args: unknown[]) {
    return invokeCaptured(ref as (...args: unknown[]) => unknown, captures, this, args);
  } as TYPE;
};
