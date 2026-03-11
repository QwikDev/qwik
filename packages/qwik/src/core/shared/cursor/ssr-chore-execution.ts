import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { ssrDiff } from '../../ssr/ssr-diff';
import { runTask, Task, TaskFlags, type TaskFn } from '../../use/use-task';
import { executeComponent } from '../component-execution';
import type { Container, HostElement } from '../types';
import type { OnRenderFn } from '../component.public';
import type { Props } from '../jsx/jsx-runtime';
import type { QRLInternal } from '../qrl/qrl-class';
import { ELEMENT_PROPS, ELEMENT_SEQ, OnRenderProp, QScopedStyle } from '../utils/markers';
import { isPromise, safeCall } from '../utils/promises';
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
 * Executes the component QRL and stores the resulting JSX as `:nodeDiff` on the vNode, then marks
 * NODE_DIFF dirty so the cursor walker processes it in the next chore cycle. This two-phase
 * approach (COMPONENT → NODE_DIFF) matches the client-side pattern and enables the cursor walker to
 * handle cascading task dependencies naturally via its TASKS → COMPONENT → NODE_DIFF ordering.
 */
export function executeSsrComponent(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  _cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPONENT;

  const host = vNode as unknown as HostElement;
  const componentQRL = container.getHostProp<QRLInternal<OnRenderFn<unknown>> | null>(
    host,
    OnRenderProp
  );

  if (!componentQRL) {
    // No QRL means this was just dirtied during initial inline execution — nothing to do.
    return;
  }

  const props = container.getHostProp<Props | null>(host, ELEMENT_PROPS) || null;

  const result = safeCall(
    () => executeComponent(container, host, host, componentQRL, props),
    (jsx) => {
      // Store JSX for NODE_DIFF processing
      (vNode.props ||= {})[':nodeDiff'] = jsx;
      vNode.dirty |= ChoreBits.NODE_DIFF;
    },
    (err: any) => {
      container.handleError(err, host);
    }
  );

  if (isPromise(result)) {
    return result as Promise<void>;
  }
}

/**
 * Execute node diff for an SSR node. Mirrors client `executeNodeDiff`.
 *
 * Processes stored JSX (from render() or signal-driven re-diffs) into child SsrNodes via ssrDiff.
 * The cursor walker drives traversal through the resulting tree.
 */
export function executeSsrNodeDiff(
  vNode: VNode,
  container: Container,
  _cursorData: CursorData,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  const jsx = vNode.props?.[':nodeDiff'] as any;
  if (jsx) {
    delete vNode.props![':nodeDiff'];
    const ssrNode = vNode as unknown as ISsrNode;
    const styleScopedId = addComponentStylePrefix(ssrNode.getProp?.(QScopedStyle));
    return ssrDiff(container as SSRContainer, jsx, vNode, cursor, styleScopedId, null);
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
