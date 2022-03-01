import { getTransient, setTransient } from '../object/q-object';

// <docs markdown="https://hackmd.io/lQ8v7fyhR-WD3b-2aRUpyw#useTransient">
// !!DO NOT EDIT THIS COMMENT DIRECTLY!!!
// (edit https://hackmd.io/@qwik-docs/BkxpSz80Y/%2FlQ8v7fyhR-WD3b-2aRUpyw%3Fboth#useTransient instead)
/**
 * @public
 */
// </docs>
export function useTransient<OBJ, ARGS extends any[], RET>(
  obj: OBJ,
  factory: (this: OBJ, ...args: ARGS) => RET,
  ...args: ARGS
): RET {
  const existing = getTransient<RET>(obj, factory);
  return existing || setTransient(obj, factory, factory.apply(obj, args));
}
