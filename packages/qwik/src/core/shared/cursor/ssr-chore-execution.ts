import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { ssrVNodeDiff } from '../../ssr/ssr-vnode-diff';
import { runTask, Task, TaskFlags, type TaskFn } from '../../use/use-task';
import type { Container } from '../types';
import { ELEMENT_SEQ, QScopedStyle } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { addComponentStylePrefix } from '../utils/scoped-styles';
import type { ValueOrPromise } from '../utils/types';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { serializeAttribute } from '../utils/styles';
import { NODE_PROPS_DATA_KEY, type CursorData } from './cursor-props';
import type { NodeProp } from '../../reactive-primitives/subscription-data';
import { isSignal, type Signal } from '../../reactive-primitives/signal.public';
import type { VNode } from '../vnode/vnode';
import type { Cursor } from './cursor';

// ============================================================================
// Cursor-walker SSR chore implementations
// These are called by walkCursor when isRunningOnServer is true.
// They mirror the client chore functions but operate on SsrNodes.
// ============================================================================

/**
 * Execute tasks for an SSR node. Mirrors client `executeTasks`.
 *
 * Tasks are stored in the ELEMENT_SEQ property and executed in order. Render-blocking tasks return
 * promises that pause the cursor. Non-blocking tasks go into extraPromises on cursorData.
 */
export function executeSsrTasks(
  vNode: VNode,
  container: Container,
  cursorData: CursorData
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.TASKS;

  const ssrNode = vNode as unknown as ISsrNode;
  const elementSeq = ssrNode.getProp(ELEMENT_SEQ);
  if (!elementSeq || elementSeq.length === 0) {
    return;
  }

  let taskPromise: Promise<void> | undefined;

  for (const item of elementSeq) {
    if (item instanceof Task) {
      const task = item as Task<TaskFn, TaskFn>;

      // Skip if task is not dirty
      if (!(task.$flags$ & TaskFlags.DIRTY)) {
        continue;
      }

      // On SSR, all tasks are render-blocking (no visible tasks on server)
      const result = runTask(task, container, ssrNode);
      if (isPromise(result)) {
        taskPromise = taskPromise
          ? taskPromise.then(() => result as Promise<void>)
          : (result as Promise<void>);
      }
    }
  }

  return taskPromise;
}

/**
 * Execute component rendering for an SSR node. Mirrors client `executeComponentChore`.
 *
 * Currently, SSR components are executed inline by _walkJSX during the initial render. This
 * function handles the case where a component gets re-dirtied (e.g., by a signal change during
 * execution), which creates a new cursor. Since _walkJSX already handles the retry via
 * executeComponent's built-in retry logic, we just clear the dirty bit here.
 *
 * When render() is rewritten to use ssrVNodeDiff directly (Phase 7 Step 6), this function will
 * properly execute the component QRL and process the returned JSX via ssrVNodeDiff.
 */
export function executeSsrComponent(
  vNode: VNode,
  _container: Container,
  _cursorData: CursorData,
  _cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPONENT;
  // Component execution is currently handled inline by _walkJSX.
  // Full implementation will come with Step 6 (chore-driven render).
}

/**
 * Key for storing the SSR walk callback on a cursor root's props. The callback is a () =>
 * Promise<void> that calls _walkJSX with the stored JSX.
 */
export const SSR_WALK_FN_KEY = ':ssrWalkFn';

/**
 * Execute node diff for an SSR node. Mirrors client `executeNodeDiff`.
 *
 * For the initial render, this calls the stored walk callback (which calls _walkJSX). For
 * signal-driven changes, it will process JSX into child SsrNodes via ssrVNodeDiff.
 */
export function executeSsrNodeDiff(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  // Check for a stored walk callback (set by SSRContainer.render for initial render)
  const walkFn = vNode.props?.[SSR_WALK_FN_KEY] as (() => Promise<void>) | undefined;
  if (walkFn) {
    delete vNode.props![SSR_WALK_FN_KEY];
    // The callback wraps _walkJSX. We call it directly since the render() method
    // already configured the WalkContext and options. ssrVNodeDiff will be used
    // when render() is updated to use NODE_DIFF_DATA_KEY in Step 6.
    return walkFn();
  }

  // NODE_DIFF_DATA_KEY path (for signal-driven re-diffs)
  const jsx = vNode.props?.[':nodeDiff'] as any;
  if (jsx) {
    delete vNode.props![':nodeDiff'];
    const ssrNode = vNode as unknown as ISsrNode;
    const styleScopedId = addComponentStylePrefix(ssrNode.getProp?.(QScopedStyle));
    return ssrVNodeDiff(container as SSRContainer, jsx, vNode, cursor, {
      currentStyleScoped: styleScopedId,
      parentComponentFrame: null,
    });
  }
}

/**
 * Execute node prop updates for an SSR node. Mirrors client `executeNodeProps`.
 *
 * For already-streamed nodes, adds backpatch entries. For not-yet-streamed nodes, the attrs are
 * already on the SsrNode and will be emitted normally.
 */
export function executeSsrNodeProps(vNode: VNode, container: Container): void {
  vNode.dirty &= ~ChoreBits.NODE_PROPS;

  const ssrNode = vNode as unknown as ISsrNode;
  const allPropData = ssrNode.getProp(NODE_PROPS_DATA_KEY) as Map<string, NodeProp> | null;
  if (!allPropData || allPropData.size === 0) {
    return;
  }

  // Only backpatch if the node has already been streamed
  if (!ssrNode.updatable) {
    for (const [property, nodeProp] of allPropData.entries()) {
      let value: Signal<any> | string = nodeProp.value;
      if (isSignal(value)) {
        value = value.value as any;
      }
      const serializedValue = serializeAttribute(property, value, nodeProp.scopedStyleIdPrefix);
      (container as SSRContainer).addBackpatchEntry(ssrNode.id, property, serializedValue);
    }
  }
  // If still updatable, attrs are already stored on the SsrNode via setProp
  // and will be emitted when the node is streamed.
}

// Legacy _executeSsrChores removed — markVNodeDirty now propagates dirty bits
// on both client and server. The cursor walker drives all SSR chore execution.
