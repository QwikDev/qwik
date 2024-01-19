import { verifySerializable } from '../state/common';
import { getContext, type QContext } from '../state/context';
import { EMPTY_OBJ } from '../util/flyweight';
import { ELEMENT_SEQ } from '../util/markers';
import { qDev, qSerialize } from '../util/qdev';
import type { VirtualVNode } from '../v2/client/types';
import { vnode_getProp, vnode_setProp } from '../v2/client/vnode';
import type { fixMeAny } from '../v2/shared/types';
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
  const SEQ_IDX = ':seqIdx';
  const iCtx = useInvokeContext();
  const hostElement = iCtx.$hostElement$;
  if (iCtx.$container2$) {
    // V2 implementation
    const host: VirtualVNode = hostElement as any;
    let seq = vnode_getProp<any[]>(host, ELEMENT_SEQ, iCtx.$container2$.getObjectById);
    if (seq === null) {
      seq = [];
      vnode_setProp(host, ELEMENT_SEQ, seq);
    }
    let seqIdx = vnode_getProp<number>(host, SEQ_IDX, null!);
    if (seqIdx === null) {
      seqIdx = 0;
      vnode_setProp(host, SEQ_IDX, seqIdx);
    }
    while (seq.length < seqIdx) {
      seq.push(null);
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
    } as fixMeAny;
  } else {
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
  }
};
