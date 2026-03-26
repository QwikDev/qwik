import { VNodeFlags, type ClientContainer } from '../../client/types';
import { vnode_diff } from '../../client/vnode-diff';
import { type VNodeJournal } from '../../client/vnode-utils';
import type { JSXOutput } from '../jsx/types/jsx-node';
import type { WrappedSignalImpl } from '../../reactive-primitives/impl/wrapped-signal-impl';
import { SignalFlags } from '../../reactive-primitives/types';
import { isSignal, scheduleEffects } from '../../reactive-primitives/utils';
import type { ISsrNode } from '../../ssr/ssr-types';
import { invoke, newInvokeContext, untrack } from '../../use/use-core';
import { Task, TaskFlags, runTask, type TaskFn } from '../../use/use-task';
import { cleanupDestroyable } from '../../use/utils/destroyable';
import type { Container, HostElement } from '../types';
import { ELEMENT_PROPS, ELEMENT_SEQ } from '../utils/markers';
import { maybeThen, retryOnPromise } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import type { ElementVNode } from '../vnode/element-vnode';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { createSetAttributeOperation } from '../vnode/types/dom-vnode-operation';
import type { VNode } from '../vnode/vnode';
import { markVNodeDirty } from '../vnode/vnode-dirty';
import {
  clearNodePropData,
  executeTaskSequence,
  forEachPendingNodeProp,
  getComponentChoreData,
  getElementSequenceFromContainer,
  getNodeDiffPayload,
  readHostScopedStylePrefix,
  runComponentChore,
  setNodeDiffPayload,
  setNodePropData,
} from './chore-helpers';
import type { Cursor } from './cursor';
import { HOST_SIGNAL, type CursorData } from './cursor-props';
import { reconcileKeyedLoopToParent } from '../../client/reconcile-keyed-loop';
import { _getProps } from '../jsx/props-proxy';
import type { Props } from '../jsx/jsx-runtime';
import type { EachProps } from '../../control-flow/each';
import type { QRLInternal } from '../qrl/qrl-class';

/**
 * Executes tasks for a vNode if the TASKS dirty bit is set. Tasks are stored in the ELEMENT_SEQ
 * property and executed in order.
 *
 * Behavior:
 *
 * - Resources: Just run, don't save promise anywhere
 * - Tasks: Chain promises only between each other
 * - VisibleTasks: Store promises in afterFlush on cursor root for client, we need to wait for all
 *   visible tasks to complete before flushing changes to the DOM. On server, we keep them on vNode
 *   for streaming.
 *
 * @param vNode - The vNode to execute tasks for
 * @param container - The container
 * @param cursor - The cursor root vNode, should be set on client only
 * @returns Promise if any regular task returns a promise, void otherwise
 */
export function executeTasks(
  vNode: VNode,
  container: Container,
  cursorData: CursorData
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.TASKS;
  return executeTaskSequence(vNode, container, cursorData, {
    getElementSeq: getElementSequenceFromContainer,
    isRenderBlocking(task) {
      return !!(task.$flags$ & TaskFlags.RENDER_BLOCKING);
    },
    treatVisibleTaskAsAfterFlush: true,
    collectNonBlockingPromise(data, promise) {
      (data.extraPromises ||= []).push(promise);
    },
    runTask,
  });
}

export { setNodeDiffPayload, setNodePropData };

export function executeNodeDiff(
  vNode: VNode,
  container: Container,
  journal: VNodeJournal,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  let jsx = getNodeDiffPayload(vNode);
  if (jsx == null) {
    return;
  }
  // cleanup payload
  setNodeDiffPayload(vNode, null);
  if (isSignal(jsx)) {
    jsx = jsx.value as any;
  }

  // For component hosts, ensure projections are resolved before diffing.
  // This was previously handled implicitly when vnode_diff ran inline
  // inside executeComponentChore → executeComponent.
  container.ensureProjectionResolved?.(vNode as HostElement);

  return retryOnPromise(() =>
    vnode_diff(
      container as ClientContainer,
      journal,
      jsx,
      vNode,
      cursor,
      readHostScopedStylePrefix(container, vNode as HostElement)
    )
  );
}

/**
 * Executes a component for a vNode if the COMPONENT dirty bit is set. Gets the component QRL from
 * OnRenderProp and executes it.
 *
 * @param vNode - The vNode to execute component for
 * @param container - The container
 * @returns Promise if component execution is async, void otherwise
 */
export function executeComponentChore(
  vNode: VNode,
  container: Container,
  _journal: VNodeJournal,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPONENT;
  const component = getComponentChoreData(vNode, container);
  if (!component) {
    return;
  }
  return runComponentChore(container, component, (jsx) => {
    setNodeDiffPayload(component.host as VNode, jsx);
    markVNodeDirty(container, component.host as VNode, ChoreBits.NODE_DIFF, cursor);
  });
}

function setNodeProp(
  domVNode: ElementVNode,
  journal: VNodeJournal,
  property: string,
  value: any,
  isConst: boolean,
  scopedStyleIdPrefix: string | null = null
): void {
  journal.push(
    createSetAttributeOperation(
      domVNode.node!,
      property,
      value,
      scopedStyleIdPrefix,
      (domVNode.flags & VNodeFlags.NS_svg) !== 0
    )
  );
  if (!isConst) {
    if (domVNode.props && value == null) {
      delete domVNode.props[property];
    } else {
      (domVNode.props ||= {})[property] = value;
    }
  }
}

/**
 * Executes node prop updates for a vNode if the NODE_PROPS dirty bit is set. Processes all pending
 * node prop updates that were stored via addPendingNodeProp.
 *
 * @param vNode - The vNode to execute node props for
 * @param container - The container
 * @returns Void
 */
export function executeNodeProps(vNode: VNode, journal: VNodeJournal): void {
  vNode.dirty &= ~ChoreBits.NODE_PROPS;
  if (!(vNode.flags & VNodeFlags.Element)) {
    return;
  }

  const domVNode = vNode as ElementVNode;
  const hasPropData = forEachPendingNodeProp(vNode, (property, value, nodeProp) => {
    setNodeProp(domVNode, journal, property, value, nodeProp.isConst, nodeProp.scopedStyleIdPrefix);
  });
  if (!hasPropData) {
    return;
  }

  // Clear pending prop data after processing
  clearNodePropData(vNode);
}

/**
 * Execute visible task cleanups and add promises to extraPromises.
 *
 * @param vNode - The vNode to cleanup
 * @param container - The container
 * @returns Void
 */
export function executeCleanup(vNode: VNode, container: Container): void {
  vNode.dirty &= ~ChoreBits.CLEANUP;

  // TODO add promises to extraPromises

  const elementSeq = container.getHostProp<unknown[] | null>(vNode, ELEMENT_SEQ);

  if (!elementSeq || elementSeq.length === 0) {
    // No tasks to execute, clear the bit
    return;
  }

  for (const item of elementSeq) {
    if (item instanceof Task) {
      if (item.$flags$ & TaskFlags.NEEDS_CLEANUP) {
        item.$flags$ &= ~TaskFlags.NEEDS_CLEANUP;
        const task = item as Task<TaskFn, TaskFn>;
        cleanupDestroyable(task);
      }
    }
  }
}

/**
 * Executes compute/recompute chores for a vNode if the COMPUTE dirty bit is set. This handles
 * signal recomputation and effect scheduling.
 *
 * @param vNode - The vNode to execute compute for
 * @param container - The container
 * @returns Promise if computation is async, void otherwise
 */
export function executeCompute(
  vNode: VNode | ISsrNode,
  container: Container
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPUTE;
  const target = container.getHostProp<WrappedSignalImpl<unknown> | null>(
    vNode as VNode,
    HOST_SIGNAL
  );
  if (!target) {
    return;
  }
  const effects = target.$effects$;

  const ctx = newInvokeContext();
  ctx.$container$ = container;
  // needed for computed signals and throwing QRLs
  return maybeThen(
    retryOnPromise(() =>
      invoke.call(target, ctx, (target as WrappedSignalImpl<unknown>).$computeIfNeeded$)
    ),
    () => {
      if ((target as WrappedSignalImpl<unknown>).$flags$ & SignalFlags.RUN_EFFECTS) {
        (target as WrappedSignalImpl<unknown>).$flags$ &= ~SignalFlags.RUN_EFFECTS;
        return scheduleEffects(container, target, effects);
      }
    }
  );
}

/**
 * Executes a reconcile chore for a vNode if the RECONCILE dirty bit is set. This handles the
 * reconciliation of a keyed loop.
 *
 * @param container - The container
 * @param journal - The journal
 * @param vNode - The vNode
 * @returns Promise if reconcile is async, void otherwise
 */
export function executeReconcile(
  vNode: VNode,
  container: Container,
  journal: VNodeJournal,
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.RECONCILE;
  const host = vNode as ElementVNode;
  const props = container.getHostProp<Props | null>(host, ELEMENT_PROPS) || null;
  if (!props) {
    return;
  }
  let items = _getProps(props, 'items' satisfies keyof EachProps<any>) as any[];
  if (isSignal(items)) {
    items = untrack(items) as any[];
  }
  const keyQrl = _getProps(props, 'key$' satisfies keyof EachProps<any>) as QRLInternal<
    (item: any, index: number) => string
  >;
  const itemQrl = _getProps(props, 'item$' satisfies keyof EachProps<any>) as QRLInternal<
    (item: any, index: number) => JSXOutput
  >;
  const keyOf = keyQrl.resolved;
  const itemFn = itemQrl.resolved;

  if (keyOf !== undefined && itemFn !== undefined) {
    return reconcileKeyedLoopToParent(container, journal, host, cursor, items, keyOf, itemFn);
  }

  return maybeThen(keyQrl.resolve(), (resolvedKeyOf) =>
    maybeThen(itemQrl.resolve(), (resolvedItemFn) =>
      reconcileKeyedLoopToParent(
        container,
        journal,
        host,
        cursor,
        items,
        resolvedKeyOf,
        resolvedItemFn
      )
    )
  );
}
