import { VNodeFlags } from '../../client/types';
import type { VNode } from '../vnode/vnode';
import type { Props } from '../jsx/jsx-runtime';
import { isCursor } from './cursor';
import { removeCursorFromQueue } from './cursor-queue';
import type { Container } from '../types';
import type { VNodeJournal } from '../../client/vnode';
import type { Task } from '../../use/use-task';
import { resolveCursor } from './cursor-walker';

/**
 * Keys used to store cursor-related data in vNode props. These are internal properties that should
 * not conflict with user props.
 */
const CURSOR_PRIORITY_KEY = ':priority';
const CURSOR_POSITION_KEY = ':position';
const CURSOR_CHILD_KEY = ':childIndex';
const CURSOR_CONTAINER_KEY = ':cursorContainer';
const VNODE_PROMISE_KEY = ':promise';
const CURSOR_EXTRA_PROMISES_KEY = ':extraPromises';
const CURSOR_JOURNAL_KEY = ':journal';
const CURSOR_AFTER_FLUSH_TASKS_KEY = ':afterFlushTasks';

/**
 * Gets the priority of a cursor vNode.
 *
 * @param vNode - The cursor vNode
 * @returns The priority, or null if not a cursor
 */
export function getCursorPriority(vNode: VNode): number | null {
  if (!(vNode.flags & VNodeFlags.Cursor)) {
    return null;
  }
  const props = vNode.props as Props;
  return (props[CURSOR_PRIORITY_KEY] as number) ?? null;
}

/**
 * Sets the priority of a cursor vNode.
 *
 * @param vNode - The vNode to set priority on
 * @param priority - The priority value
 */
export function setCursorPriority(vNode: VNode, priority: number): void {
  const props = (vNode.props ||= {});
  props[CURSOR_PRIORITY_KEY] = priority;
}

/**
 * Gets the current cursor position from a cursor vNode.
 *
 * @param vNode - The cursor vNode
 * @returns The cursor position, or null if at root or not a cursor
 */
export function getCursorPosition(vNode: VNode): VNode | null {
  if (!(vNode.flags & VNodeFlags.Cursor)) {
    return null;
  }
  const props = vNode.props;
  return (props?.[CURSOR_POSITION_KEY] as VNode | null) ?? null;
}

/**
 * Set the next child to process index in a vNode.
 *
 * @param vNode - The vNode
 * @param childIndex - The child index to set
 */
export function setNextChildIndex(vNode: VNode, childIndex: number): void {
  const props = vNode.props as Props;
  // We could also add a dirtycount to avoid checking all children after completion
  // perf: we could also use dirtychild index 0 for the index instead
  props[CURSOR_CHILD_KEY] = childIndex;
}

/** Gets the next child to process index from a vNode. */
export function getNextChildIndex(vNode: VNode): number | null {
  const props = vNode.props as Props;
  return (props[CURSOR_CHILD_KEY] as number) ?? null;
}

/**
 * Sets the cursor position in a cursor vNode.
 *
 * @param vNode - The cursor vNode
 * @param position - The vNode position to set, or null for root
 */
export function setCursorPosition(
  container: Container,
  vNode: VNode,
  position: VNode | null
): void {
  const props = vNode.props as Props;
  props[CURSOR_POSITION_KEY] = position;
  if (position && isCursor(position)) {
    mergeCursors(container, vNode, position);
  }
}

function mergeCursors(container: Container, newCursor: VNode, oldCursor: VNode): void {
  // delete from global cursors queue
  removeCursorFromQueue(oldCursor);
  resolveCursor(container);
  // merge after flush tasks
  const oldAfterFlushTasks = getAfterFlushTasks(oldCursor);
  if (oldAfterFlushTasks && oldAfterFlushTasks.length > 0) {
    const newAfterFlushTasks = getAfterFlushTasks(newCursor);
    if (newAfterFlushTasks) {
      newAfterFlushTasks.push(...oldAfterFlushTasks);
    } else {
      setAfterFlushTasks(newCursor, oldAfterFlushTasks);
    }
  }
  // merge extra promises
  const oldExtraPromises = getExtraPromises(oldCursor);
  if (oldExtraPromises && oldExtraPromises.length > 0) {
    const newExtraPromises = getExtraPromises(newCursor);
    if (newExtraPromises) {
      newExtraPromises.push(...oldExtraPromises);
    } else {
      setExtraPromises(newCursor, oldExtraPromises);
    }
  }
  // merge journal
  const oldJournal = getCursorJournal(oldCursor);
  if (oldJournal && oldJournal.length > 0) {
    const newJournal = getCursorJournal(newCursor);
    if (newJournal) {
      newJournal.push(...oldJournal);
    } else {
      setCursorJournal(newCursor, oldJournal);
    }
  }
}

/**
 * Gets the blocking promise from a vNode.
 *
 * @param vNode - The vNode
 * @returns The promise, or null if none or not a cursor
 */
export function getVNodePromise(vNode: VNode): Promise<void> | null {
  const props = vNode.props;
  return (props?.[VNODE_PROMISE_KEY] as Promise<void> | null) ?? null;
}

/**
 * Sets the blocking promise on a vNode.
 *
 * @param vNode - The vNode
 * @param promise - The promise to set, or null to clear
 */
export function setVNodePromise(vNode: VNode, promise: Promise<void> | null): void {
  const props = (vNode.props ||= {});
  props[VNODE_PROMISE_KEY] = promise;
}

/**
 * Gets extra promises from a vNode.
 *
 * @param vNode - The vNode
 * @returns The extra promises set
 */
export function getExtraPromises(vNode: VNode): Promise<void>[] | null {
  const props = vNode.props;
  return (props?.[CURSOR_EXTRA_PROMISES_KEY] as Promise<void>[] | null) ?? null;
}

/**
 * Sets extra promises on a vNode.
 *
 * @param vNode - The vNode
 * @param extraPromises - The extra promises set, or null to clear
 */
export function setExtraPromises(vNode: VNode, extraPromises: Promise<void>[] | null): void {
  const props = (vNode.props ||= {});
  props[CURSOR_EXTRA_PROMISES_KEY] = extraPromises;
}

/**
 * Sets the cursor container on a vNode.
 *
 * @param vNode - The vNode
 * @param container - The container to set
 */
export function setCursorContainer(vNode: VNode, container: Container): void {
  const props = (vNode.props ||= {});
  props[CURSOR_CONTAINER_KEY] = container;
}

/**
 * Gets the cursor container from a vNode.
 *
 * @param vNode - The vNode
 * @returns The container, or null if none or not a cursor
 */
export function getCursorContainer(vNode: VNode): Container | null {
  const props = vNode.props;
  return (props?.[CURSOR_CONTAINER_KEY] as Container | null) ?? null;
}

/**
 * Sets the cursor journal on a vNode.
 *
 * @param vNode - The vNode
 * @param journal - The journal to set
 */
export function setCursorJournal(vNode: VNode, journal: VNodeJournal): void {
  const props = (vNode.props ||= {});
  props[CURSOR_JOURNAL_KEY] = journal;
}

/**
 * Gets the cursor journal from a vNode.
 *
 * @param vNode - The vNode
 * @returns The journal, or null if none or not a cursor
 */
export function getCursorJournal(vNode: VNode): VNodeJournal | null {
  const props = vNode.props;
  return (props?.[CURSOR_JOURNAL_KEY] as VNodeJournal | null) ?? null;
}

/**
 * Gets the after flush tasks from a vNode.
 *
 * @param vNode - The vNode
 * @returns The after flush tasks, or null if none or not a cursor
 */
export function getAfterFlushTasks(vNode: VNode): Task[] | null {
  const props = vNode.props;
  return (props?.[CURSOR_AFTER_FLUSH_TASKS_KEY] as Task[] | null) ?? null;
}

/**
 * Sets the after flush tasks on a vNode.
 *
 * @param vNode - The vNode
 * @param afterFlushTasks - The after flush tasks to set, or null to clear
 */
export function setAfterFlushTasks(vNode: VNode, afterFlushTasks: Task[] | null): void {
  const props = (vNode.props ||= {});
  props[CURSOR_AFTER_FLUSH_TASKS_KEY] = afterFlushTasks;
}
