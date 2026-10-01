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

const setQrlCaptures = (captures: Readonly<unknown[]> | null | undefined) => {
  setCaptures(captures ?? null);
};

/** @internal */
export const withCaptures = <TYPE>(
  ref: TYPE,
  captures: Readonly<unknown[]> | null | undefined
): TYPE => {
  if (typeof ref !== 'function' || !captures) {
    return ref;
  }
  return function boundCaptures(this: unknown, ...args: unknown[]) {
    setQrlCaptures(captures);
    return (ref as Function).apply(this, args);
  } as TYPE;
};
