import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';
import { StoreHandler } from '../reactive-primitives/impl/store';
import { assertFalse } from '../shared/error/assert';
import { isQrl } from '../shared/qrl/qrl-utils';
import type { Chore } from '../shared/scheduler';
import {
  ssrNodeDocumentPosition,
  vnode_documentPosition,
} from '../shared/scheduler-document-position';
import { ChoreType } from '../shared/util-chore-type';
import type { ISsrNode } from '../ssr/ssr-types';
import { vnode_isVNode } from './vnode';

export class ChoreArray extends Array<Chore> {
  add(value: Chore): number {
    /// We need to ensure that the `queue` is sorted by priority.
    /// 1. Find a place where to insert into.
    const idx = sortedFindIndex(this, value);

    if (idx < 0) {
      /// 2. Insert the chore into the queue.
      this.splice(~idx, 0, value);
      return idx;
    }

    const existing = this[idx];
    /**
     * When a derived signal is updated we need to run vnode_diff. However the signal can update
     * multiple times during component execution. For this reason it is necessary for us to update
     * the chore with the latest result of the signal.
     */
    if (existing.$payload$ !== value.$payload$) {
      existing.$payload$ = value.$payload$;
    }
    return idx;
  }

  delete(value: Chore) {
    // const idx = this.sortedFindIndex(this, value);
    // if (idx >= 0) {
    //   this.splice(idx, 1);
    // }
    // return idx;
    const idx = this.indexOf(value);
    if (idx >= 0) {
      this.splice(idx, 1);
    }
    return idx;
  }
}

export function sortedFindIndex(sortedArray: Chore[], value: Chore): number {
  /// We need to ensure that the `queue` is sorted by priority.
  /// 1. Find a place where to insert into.
  let bottom = 0;
  let top = sortedArray.length;
  while (bottom < top) {
    const middle = bottom + ((top - bottom) >> 1);
    const midChore = sortedArray[middle];
    const comp = choreComparator(value, midChore);
    if (comp < 0) {
      top = middle;
    } else if (comp > 0) {
      bottom = middle + 1;
    } else {
      // We already have the host in the queue.
      return middle;
    }
  }
  return ~bottom;
}

/**
 * Compares two chores to determine their execution order in the scheduler's queue.
 *
 * @param a - The first chore to compare
 * @param b - The second chore to compare
 * @returns A number indicating the relative order of the chores. A negative number means `a` runs
 *   before `b`.
 */
export function choreComparator(a: Chore, b: Chore): number {
  const macroTypeDiff = (a.$type$ & ChoreType.MACRO) - (b.$type$ & ChoreType.MACRO);
  if (macroTypeDiff !== 0) {
    return macroTypeDiff;
  }

  const aHost = a.$host$;
  const bHost = b.$host$;

  if (aHost !== bHost && aHost !== null && bHost !== null) {
    if (vnode_isVNode(aHost) && vnode_isVNode(bHost)) {
      // we are running on the client.
      const hostDiff = vnode_documentPosition(aHost, bHost);
      if (hostDiff !== 0) {
        return hostDiff;
      }
    } else {
      assertFalse(vnode_isVNode(aHost), 'expected aHost to be SSRNode but it is a VNode');
      assertFalse(vnode_isVNode(bHost), 'expected bHost to be SSRNode but it is a VNode');
      const hostDiff = ssrNodeDocumentPosition(aHost as ISsrNode, bHost as ISsrNode);
      if (hostDiff !== 0) {
        return hostDiff;
      }
    }
  }

  const microTypeDiff = (a.$type$ & ChoreType.MICRO) - (b.$type$ & ChoreType.MICRO);
  if (microTypeDiff !== 0) {
    return microTypeDiff;
  }
  // types are the same

  const idxDiff = toNumber(a.$idx$) - toNumber(b.$idx$);
  if (idxDiff !== 0) {
    return idxDiff;
  }

  // If the host is the same (or missing), and the type is the same,  we need to compare the target.
  if (a.$target$ !== b.$target$) {
    if (isQrl(a.$target$) && isQrl(b.$target$) && a.$target$.$hash$ === b.$target$.$hash$) {
      return 0;
    }
    // 1 means that we are going to process chores as FIFO
    return 1;
  }

  // ensure that the effect chores are scheduled for the same target
  // TODO: can we do this better?
  if (
    a.$type$ === ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS &&
    b.$type$ === ChoreType.RECOMPUTE_AND_SCHEDULE_EFFECTS &&
    ((a.$target$ instanceof StoreHandler && b.$target$ instanceof StoreHandler) ||
      (a.$target$ instanceof AsyncComputedSignalImpl &&
        b.$target$ instanceof AsyncComputedSignalImpl)) &&
    a.$payload$ !== b.$payload$
  ) {
    return 1;
  }

  // The chores are the same and will run only once
  return 0;
}

function toNumber(value: number | string): number {
  return typeof value === 'number' ? value : -1;
}
