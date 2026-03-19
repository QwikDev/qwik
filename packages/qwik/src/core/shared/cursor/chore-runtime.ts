import type { VNodeJournal } from '../../client/vnode-utils';
import type { ValueOrPromise } from '../utils/types';
import type { Container } from '../types';
import type { VNode } from '../vnode/vnode';
import {
  executeCleanup,
  executeComponentChore,
  executeCompute,
  executeNodeDiff,
  executeNodeProps,
  executeTasks,
} from './chore-execution';
import {
  executeSsrComponent,
  executeSsrNodeDiff,
  executeSsrNodeProps,
  executeSsrTasks,
  executeSsrUnclaimedProjections,
} from './ssr-chore-execution';
import { executeFlushPhase } from './cursor-flush';
import type { Cursor } from './cursor';
import type { CursorData } from './cursor-props';

export interface CursorChoreRuntime {
  needsJournal: boolean;
  hasCleanNodeLeave: boolean;
  tasks(vNode: VNode, container: Container, cursorData: CursorData): ValueOrPromise<void>;
  component(
    vNode: VNode,
    container: Container,
    cursorData: CursorData,
    cursor: Cursor,
    journal: VNodeJournal | null
  ): ValueOrPromise<void>;
  nodeDiff(
    vNode: VNode,
    container: Container,
    cursorData: CursorData,
    cursor: Cursor,
    journal: VNodeJournal | null
  ): ValueOrPromise<void>;
  nodeProps(
    vNode: VNode,
    container: Container,
    cursorData: CursorData,
    journal: VNodeJournal | null
  ): void;
  cleanup(vNode: VNode, container: Container): void;
  compute(vNode: VNode, container: Container): ValueOrPromise<void>;
  onCleanNodeLeave(
    vNode: VNode,
    container: Container,
    cursorData: CursorData,
    cursor: Cursor
  ): ValueOrPromise<void>;
  onCursorFinish(cursor: Cursor, container: Container, cursorData: CursorData): void;
}

export const domCursorChoreRuntime: CursorChoreRuntime = {
  needsJournal: true,
  hasCleanNodeLeave: false,
  tasks: executeTasks,
  component(vNode, container, _cursorData, cursor, journal) {
    return executeComponentChore(vNode, container, journal!, cursor);
  },
  nodeDiff(vNode, container, _cursorData, cursor, journal) {
    return executeNodeDiff(vNode, container, journal!, cursor);
  },
  nodeProps(vNode, _container, _cursorData, journal) {
    executeNodeProps(vNode, journal!);
  },
  cleanup: executeCleanup,
  compute: executeCompute,
  onCleanNodeLeave() {},
  onCursorFinish(cursor, container) {
    executeFlushPhase(cursor, container);
  },
};

export const ssrCursorChoreRuntime: CursorChoreRuntime = {
  needsJournal: false,
  hasCleanNodeLeave: true,
  tasks: executeSsrTasks,
  component: executeSsrComponent,
  nodeDiff: executeSsrNodeDiff,
  nodeProps(vNode, container) {
    executeSsrNodeProps(vNode, container);
  },
  cleanup: executeCleanup,
  compute: executeCompute,
  onCleanNodeLeave: executeSsrUnclaimedProjections,
  onCursorFinish() {},
};

export function getCursorChoreRuntime(isServer: boolean): CursorChoreRuntime {
  return isServer ? ssrCursorChoreRuntime : domCursorChoreRuntime;
}
