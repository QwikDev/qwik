import { VNodeFlags } from '../../client/types';
import type { VNode } from '../vnode/vnode';
import type { Props } from '../jsx/jsx-runtime';
import { isCursor } from './cursor';
import { removeCursorFromQueue } from './cursor-queue';

/**
 * Keys used to store cursor-related data in vNode props. These are internal properties that should
 * not conflict with user props.
 */
const CURSOR_PRIORITY_KEY = 'q:priority';
const CURSOR_POSITION_KEY = 'q:position';
const CURSOR_CHILD_KEY = 'q:childIndex';
const VNODE_PROMISE_KEY = 'q:promise';
const CURSOR_EXTRA_PROMISES_KEY = 'q:extraPromises';

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
export function setCursorPosition(vNode: VNode, position: VNode | null): void {
  const props = vNode.props as Props;
  props[CURSOR_POSITION_KEY] = position;
  if (position && isCursor(position)) {
    // delete from global cursors queue
    removeCursorFromQueue(position);
    // TODO: merge extraPromises
    // const extraPromises = getCursorExtraPromises(position);
    // if (extraPromises) {
    // }
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
