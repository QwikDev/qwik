import { verifySerializable } from '../object/q-object';
import { getContext } from '../props/props';
import { qDev } from '../util/qdev';
import { RenderInvokeContext, useInvokeContext } from './use-core';

export interface SequentialScope<T> {
  readonly get: T | undefined;
  readonly set: (v: T) => T;
  readonly i: number;
  readonly ctx: RenderInvokeContext;
}

export const useSequentialScope = <T>(): SequentialScope<T> => {
  const ctx = useInvokeContext();
  const i = ctx.$seq$;
  const hostElement = ctx.$hostElement$;
  const elementCtx = getContext(hostElement);
  ctx.$seq$++;
  const set = (value: T) => {
    if (qDev) {
      verifySerializable(value);
    }
    return (elementCtx.$seq$[i] = value);
  };
  return {
    get: elementCtx.$seq$[i],
    set,
    i,
    ctx,
  };
};
