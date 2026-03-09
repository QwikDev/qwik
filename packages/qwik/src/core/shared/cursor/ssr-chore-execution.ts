import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { runTask, Task, TaskFlags, type TaskFn } from '../../use/use-task';
import type { Container } from '../types';
import { ELEMENT_SEQ } from '../utils/markers';
import type { ValueOrPromise } from '../utils/types';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { logWarn } from '../utils/log';
import { serializeAttribute } from '../utils/styles';
import { NODE_PROPS_DATA_KEY, type CursorData } from './cursor-props';
import type { NodeProp } from '../../reactive-primitives/subscription-data';
import { isSignal, type Signal } from '../../reactive-primitives/signal.public';
import { executeCompute } from './chore-execution';
import { isPromise } from '../utils/promises';
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
 * Gets the component QRL, executes it, and processes the returned JSX into child SsrNodes. TODO:
 * Phase 1.2/1.3 will implement JSX-to-SsrNode processing.
 */
export function executeSsrComponent(
  _vNode: VNode,
  _container: Container,
  _cursorData: CursorData,
  _cursor: Cursor
): ValueOrPromise<void> {
  _vNode.dirty &= ~ChoreBits.COMPONENT;
  // TODO: Phase 1.2 — execute component and process JSX into child SsrNodes
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
 * signal-driven changes, it will process JSX into child SsrNodes (Phase 2).
 */
export function executeSsrNodeDiff(
  vNode: VNode,
  _container: Container,
  _cursorData: CursorData,
  _cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  // Check for a stored walk callback (set by SSRContainer.render for initial render)
  const walkFn = vNode.props?.[SSR_WALK_FN_KEY] as (() => Promise<void>) | undefined;
  if (walkFn) {
    delete vNode.props![SSR_WALK_FN_KEY];
    return walkFn();
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

// ============================================================================
// Legacy immediate-execution SSR chore handler
// Called from markVNodeDirty when isRunningOnServer is true.
// TODO: Phase 1.4 will remove this once cursor walker drives all SSR rendering.
// ============================================================================

/** @internal */
export function _executeSsrChores(
  container: SSRContainer,
  ssrNode: ISsrNode
): ValueOrPromise<void> {
  if (!ssrNode.updatable) {
    if (ssrNode.dirty & ChoreBits.NODE_PROPS) {
      executeSsrNodeProps(ssrNode as unknown as VNode, container);
    }
    if (ssrNode.dirty & ChoreBits.COMPUTE) {
      executeCompute(ssrNode, container);
    }
    if (ssrNode.dirty & ChoreBits.DIRTY_MASK) {
      const warningMessage = `A chore was scheduled on a host element that has already been streamed to the client.
        This can lead to inconsistencies between Server-Side Rendering (SSR) and Client-Side Rendering (CSR).

        Problematic chore:
          - Host: ${ssrNode.toString()}
          - Nearest element location: ${ssrNode.currentFile}

        This is often caused by modifying a signal in an already rendered component during SSR.`;
      logWarn(warningMessage);
    }
    ssrNode.dirty &= ~ChoreBits.DIRTY_MASK;
    return;
  }

  let promise: ValueOrPromise<void> | null = null;
  if (ssrNode.dirty & ChoreBits.TASKS) {
    const result = executeTasksChore(container, ssrNode);
    if (isPromise(result)) {
      promise = result;
    }
  }

  // In SSR, we don't handle the COMPONENT bit here.
  // During initial render, if a task completes and marks the component dirty,
  // we want to leave the COMPONENT bit set so that executeComponent can detect
  // it after $waitOn$ completes and re-execute the component function.
  // executeComponent will clear the bit after re-executing.

  // Clear all dirty bits EXCEPT COMPONENT
  ssrNode.dirty &= ~(ChoreBits.DIRTY_MASK & ~ChoreBits.COMPONENT);

  if (promise) {
    return promise;
  }
}

function executeTasksChore(container: Container, ssrNode: ISsrNode): ValueOrPromise<void> | null {
  ssrNode.dirty &= ~ChoreBits.TASKS;
  const elementSeq = ssrNode.getProp(ELEMENT_SEQ);
  if (!elementSeq || elementSeq.length === 0) {
    return null;
  }
  let promise: ValueOrPromise<void> | null = null;
  for (const item of elementSeq) {
    if (item instanceof Task) {
      const task = item as Task<TaskFn, TaskFn>;

      if (!(task.$flags$ & TaskFlags.DIRTY)) {
        continue;
      }

      const result = runTask(task, container, ssrNode);
      promise = promise ? promise.then(() => result as Promise<void>) : (result as Promise<void>);
    }
  }
  return promise;
}
