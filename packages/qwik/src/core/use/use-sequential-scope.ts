import { verifySerializable } from '../shared/serdes/verify';
import { ELEMENT_SEQ, ELEMENT_SEQ_IDX } from '../shared/utils/markers';
import { qDev, qSerialize } from '../shared/utils/qdev';
import type { HostElement } from '../shared/types';
import { useInvokeContext, type RenderInvokeContext } from './use-core';

export interface SequentialScope<T> {
  /** The currently stored data for the hook that calls this */
  readonly val: T | undefined;
  /** Store new data for the hook that calls this */
  readonly set: (v: T) => T;
  /** Index of the hook */
  readonly i: number;
  readonly iCtx: RenderInvokeContext;
}

/**
 * @internal
 * The storage provider for hooks. Each invocation increases index i. Data is stored in an array.
 */
export const useSequentialScope = <T>(): SequentialScope<T> => {
  const iCtx = useInvokeContext();
  const hostElement = iCtx.$hostElement$;
  const host: HostElement = hostElement as any;
  let seq = iCtx.$container$.getHostProp<any[]>(host, ELEMENT_SEQ);
  if (seq === null) {
    seq = [];
    iCtx.$container$.setHostProp(host, ELEMENT_SEQ, seq);
  }
  let seqIdx = iCtx.$container$.getHostProp<number>(host, ELEMENT_SEQ_IDX);
  if (seqIdx === null) {
    seqIdx = 0;
  }
  iCtx.$container$.setHostProp(host, ELEMENT_SEQ_IDX, seqIdx + 1);
  while (seq.length <= seqIdx) {
    seq.push(undefined);
  }
  const set = (value: T) => {
    if (qDev && qSerialize) {
      verifySerializable(value);
    }
    return (seq![seqIdx!] = value);
  };

  return {
    val: seq[seqIdx],
    set,
    i: seqIdx,
    iCtx,
  };
};
