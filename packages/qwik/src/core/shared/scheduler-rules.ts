import { vnode_isDescendantOf, vnode_isVNode } from '../client/vnode';
import { Task, TaskFlags } from '../use/use-task';
import type { QRLInternal } from './qrl/qrl-class';
import type { Chore } from './scheduler';
import type { Container, HostElement } from './types';
import { ChoreType } from './util-chore-type';
import { ELEMENT_SEQ } from './utils/markers';
import { isNumber } from './utils/types';

type BlockingRule = {
  blockedType: ChoreType;
  blockingType: ChoreType;
  match: (blocked: Chore, blocking: Chore, container: Container) => boolean;
};

/**
 * Rules for determining if a chore is blocked by another chore. Some chores can block other chores.
 * They cannot run until the blocking chore has completed.
 *
 * The match function is used to determine if the blocked chore is blocked by the blocking chore.
 * The match function is called with the blocked chore, the blocking chore, and the container.
 */

const VISIBLE_BLOCKING_RULES: BlockingRule[] = [
  // NODE_DIFF blocks VISIBLE on same host,
  // if the blocked chore is a child of the blocking chore
  // or the blocked chore is a sibling of the blocking chore
  {
    blockedType: ChoreType.VISIBLE,
    blockingType: ChoreType.NODE_DIFF,
    match: (blocked, blocking) =>
      blockIfBlockingIsChild(blocked, blocking) || blockIfBlockingIsChild(blocking, blocked),
  },
  // COMPONENT blocks VISIBLE on same host
  // if the blocked chore is a child of the blocking chore
  // or the blocked chore is a sibling of the blocking chore
  {
    blockedType: ChoreType.VISIBLE,
    blockingType: ChoreType.COMPONENT,
    match: (blocked, blocking) =>
      blockIfBlockingIsChild(blocked, blocking) || blockIfBlockingIsChild(blocking, blocked),
  },
];

const BLOCKING_RULES: BlockingRule[] = [
  // QRL_RESOLVE blocks RUN_QRL, TASK, VISIBLE on same host
  {
    blockedType: ChoreType.RUN_QRL,
    blockingType: ChoreType.QRL_RESOLVE,
    match: (blocked, blocking) => {
      const blockedQrl = blocked.$target$ as QRLInternal<unknown>;
      const blockingQrl = blocking.$target$ as QRLInternal<unknown>;
      return blockIfSameHost(blocked, blocking) && blockIfSameQRL(blockedQrl, blockingQrl);
    },
  },
  {
    blockedType: ChoreType.TASK,
    blockingType: ChoreType.QRL_RESOLVE,
    match: (blocked, blocking) => {
      const blockedTask = blocked.$payload$ as Task;
      const blockingQrl = blocking.$target$ as QRLInternal<unknown>;
      return blockIfSameHost(blocked, blocking) && blockIfSameQRL(blockedTask.$qrl$, blockingQrl);
    },
  },
  {
    blockedType: ChoreType.VISIBLE,
    blockingType: ChoreType.QRL_RESOLVE,
    match: (blocked, blocking) => {
      const blockedTask = blocked.$payload$ as Task;
      const blockingQrl = blocking.$target$ as QRLInternal<unknown>;
      return blockIfSameHost(blocked, blocking) && blockIfSameQRL(blockedTask.$qrl$, blockingQrl);
    },
  },
  // COMPONENT blocks NODE_DIFF, NODE_PROP on same host
  {
    blockedType: ChoreType.NODE_DIFF,
    blockingType: ChoreType.COMPONENT,
    match: (blocked, blocking) => blocked.$host$ === blocking.$host$,
  },
  {
    blockedType: ChoreType.NODE_PROP,
    blockingType: ChoreType.COMPONENT,
    match: (blocked, blocking) => blocked.$host$ === blocking.$host$,
  },
  ...VISIBLE_BLOCKING_RULES,
  // TASK blocks subsequent TASKs in the same component
  {
    blockedType: ChoreType.TASK,
    blockingType: ChoreType.TASK,
    match: (blocked, blocking, container) => {
      if (blocked.$host$ !== blocking.$host$) {
        return false;
      }

      const blockedIdx = blocked.$idx$ as number;
      if (!isNumber(blockedIdx) || blockedIdx <= 0) {
        return false;
      }
      const previousTask = findPreviousTaskInComponent(blocked.$host$, blockedIdx, container);
      return previousTask === blocking.$payload$;
    },
  },
];

function blockIfBlockingIsChild(blocked: Chore, blocking: Chore) {
  const blockingHost = blocking.$host$;
  const blockedHost = blocked.$host$;
  if (!vnode_isVNode(blockingHost) || !vnode_isVNode(blockedHost)) {
    return false;
  }
  return vnode_isDescendantOf(blockingHost, blockedHost);
}

function blockIfSameHost(blocked: Chore, blocking: Chore) {
  return blocked.$host$ === blocking.$host$;
}

function blockIfSameQRL(blockedQRL: QRLInternal<unknown>, blockingQRL: QRLInternal<unknown>) {
  return blockedQRL.$symbol$ === blockingQRL.$symbol$;
}

export function findBlockingChore(
  chore: Chore,
  choreQueue: Chore[],
  blockedChores: Set<Chore>,
  container: Container
): Chore | null {
  // TODO: should we do this?
  // for (const candidate of choreQueue) {
  //   if (blockIfBlockingIsChild(chore, candidate)) {
  //     return candidate;
  //   }
  // }

  // for (const candidate of blockedChores) {
  //   if (blockIfBlockingIsChild(chore, candidate)) {
  //     return candidate;
  //   }
  // }

  for (const rule of BLOCKING_RULES) {
    if (chore.$type$ !== rule.blockedType) {
      continue;
    }

    // Check in choreQueue
    // TODO(perf): better to iterate in reverse order?
    for (const candidate of choreQueue) {
      if (candidate.$type$ === rule.blockingType && rule.match(chore, candidate, container)) {
        return candidate;
      }
    }
    // Check in blockedChores
    for (const candidate of blockedChores) {
      if (candidate.$type$ === rule.blockingType && rule.match(chore, candidate, container)) {
        return candidate;
      }
    }
  }
  return null;
}

function findPreviousTaskInComponent(
  host: HostElement,
  currentTaskIdx: number,
  container: Container
): Task | null {
  const elementSeq = container.getHostProp<unknown[] | null>(host, ELEMENT_SEQ);
  if (!elementSeq || elementSeq.length <= currentTaskIdx) {
    return null;
  }

  for (let i = currentTaskIdx - 1; i >= 0; i--) {
    const candidate = elementSeq[i];
    if (candidate instanceof Task && candidate.$flags$ & TaskFlags.TASK) {
      return candidate;
    }
  }
  return null;
}

export function findBlockingChoreForVisible(
  chore: Chore,
  runningChores: Set<Chore>,
  container: Container
): Chore | null {
  for (const rule of VISIBLE_BLOCKING_RULES) {
    if (chore.$type$ !== rule.blockedType) {
      continue;
    }

    for (const candidate of runningChores) {
      if (candidate.$type$ === rule.blockingType && rule.match(chore, candidate, container)) {
        return candidate;
      }
    }
  }
  return null;
}
