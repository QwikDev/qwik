import { verifySerializable } from '../state/common';
import { getContext, QContext } from '../state/context';
import { qDev } from '../util/qdev';
import { RenderInvokeContext, useInvokeContext } from './use-core';

export interface SequentialScope<T> {
  readonly get: T | undefined;
  readonly set: (v: T) => T;
  readonly i: number;
  readonly rCtx: RenderInvokeContext;
  readonly elCtx: QContext;
}

export const useSequentialScope = <T>(): SequentialScope<T> => {
  const ctx = useInvokeContext();
  const i = ctx.$seq$;
  const hostElement = ctx.$hostElement$;
  const elCtx = getContext(hostElement, ctx.$renderCtx$.$static$.$containerState$);
  const seq = elCtx.$seq$ ? elCtx.$seq$ : (elCtx.$seq$ = []);

  ctx.$seq$++;
  const set = (value: T) => {
    if (qDev) {
      verifySerializable(value);
    }
    return (seq[i] = value);
  };
  return {
    get: seq[i],
    set,
    i,
    rCtx: ctx,
    elCtx,
  };
};
