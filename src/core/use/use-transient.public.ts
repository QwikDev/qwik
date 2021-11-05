import { getTransient, setTransient } from '../object/q-object';

/**
 * @public
 */
export function useTransient<OBJ, ARGS extends any[], RET>(
  obj: OBJ,
  factory: (this: OBJ, ...args: ARGS) => RET,
  ...args: ARGS
): RET {
  const existing = getTransient<RET>(obj, factory);
  return existing || setTransient(obj, factory, factory.apply(obj, args));
}
