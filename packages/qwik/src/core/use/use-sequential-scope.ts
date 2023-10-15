import { verifySerializable } from '../state/common';
import { getContext, type QContext } from '../state/context';
import { qDev, qSerialize } from '../util/qdev';
import { type RenderInvokeContext, useInvokeContext } from './use-core';

export interface SequentialScope<T> {
  /** The currently stored data for the hook that calls this */
  readonly val: T | undefined;
  /** Store new data for the hook that calls this */
  readonly set: (v: T) => T;
  /** Index of the hook */
  readonly i: number;
  readonly iCtx: RenderInvokeContext;
  readonly elCtx: QContext;
}

/**
 * @internal
 * The storage provider for hooks. Each invocation increases index i. Data is stored in an array.
 */
export const useSequentialScope = <T>(): SequentialScope<T> => {
  const iCtx = useInvokeContext();
  const hostElement = iCtx.$hostElement$;
  const elCtx = getContext(hostElement, iCtx.$renderCtx$.$static$.$containerState$);
  const seq = (elCtx.$seq$ ||= []);
  const i = iCtx.$i$++;

  const set = (value: T) => {
    if (qDev && qSerialize) {
      verifySerializable(value);
    }
    return (seq[i] = value);
  };

  return {
    val: seq[i],
    set,
    i,
    iCtx,
    elCtx,
  };
};
