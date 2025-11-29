import { vnode_isVNode, type VNodeJournal } from '../../client/vnode';
import { vnode_diff } from '../../client/vnode-diff';
import { clearAllEffects } from '../../reactive-primitives/cleanup';
import { runResource, type ResourceDescriptor } from '../../use/use-resource';
import { Task, TaskFlags, runTask, type TaskFn } from '../../use/use-task';
import { executeComponent } from '../component-execution';
import { isServerPlatform } from '../platform/platform';
import type { OnRenderFn } from '../component.public';
import type { Props } from '../jsx/jsx-runtime';
import type { QRLInternal } from '../qrl/qrl-class';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import {
  ELEMENT_SEQ,
  ELEMENT_PROPS,
  OnRenderProp,
  QScopedStyle,
  NODE_PROPS_DATA_KEY,
  NODE_DIFF_DATA_KEY,
} from '../utils/markers';
import { addComponentStylePrefix } from '../utils/scoped-styles';
import { isPromise, retryOnPromise, safeCall } from '../utils/promises';
import type { ValueOrPromise } from '../utils/types';
import type { Container, HostElement } from '../types';
import type { VNode } from '../vnode/vnode';
import { VNodeFlags, type ClientContainer } from '../../client/types';
import type { Cursor } from './cursor';
import type { NodeProp } from '../../reactive-primitives/subscription-data';
import { isSignal } from '../../reactive-primitives/utils';
import type { Signal } from '../../reactive-primitives/signal.public';
import { serializeAttribute } from '../utils/styles';
import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import type { ElementVNode } from '../vnode/element-vnode';
import { VNodeOperationType } from '../vnode/enums/vnode-operation-type.enum';
import type { JSXOutput } from '../jsx/types/jsx-node';
import { getAfterFlushTasks, setAfterFlushTasks, setExtraPromises } from './cursor-props';

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
  cursor: Cursor
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.TASKS;

  const elementSeq = container.getHostProp<unknown[] | null>(vNode, ELEMENT_SEQ);

  if (!elementSeq || elementSeq.length === 0) {
    // No tasks to execute, clear the bit
    return;
  }

  // Execute all tasks in sequence
  let taskPromise: Promise<void> | undefined;
  let extraPromises: Promise<void>[] | undefined;

  for (const item of elementSeq) {
    if (item instanceof Task) {
      const task = item as Task<TaskFn, TaskFn>;

      // Skip if task is not dirty
      if (!(task.$flags$ & TaskFlags.DIRTY)) {
        continue;
      }

      // Check if it's a resource
      if (task.$flags$ & TaskFlags.RESOURCE) {
        // Resources: just run, don't save promise anywhere
        runResource(task as ResourceDescriptor<TaskFn>, container, vNode);
      } else if (task.$flags$ & TaskFlags.VISIBLE_TASK) {
        // VisibleTasks: store for execution after flush (don't execute now)
        let visibleTasks = getAfterFlushTasks(cursor);
        if (!visibleTasks) {
          visibleTasks = [];
          setAfterFlushTasks(cursor, visibleTasks);
        }
        visibleTasks.push(task);
      } else {
        // Regular tasks: chain promises only between each other
        const result = runTask(task, container, vNode);
        if (isPromise(result)) {
          if (task.$flags$ & TaskFlags.RENDER_BLOCKING) {
            taskPromise = taskPromise
              ? taskPromise.then(() => result as Promise<void>)
              : (result as Promise<void>);
          } else {
            extraPromises ||= [];
            extraPromises.push(result as Promise<void>);
          }
        }
      }
    }
  }

  if (extraPromises) {
    setExtraPromises(isServerPlatform() ? vNode : cursor, extraPromises);
  }
  return taskPromise;
}

function getNodeDiffPayload(vNode: VNode): JSXOutput | null {
  const props = vNode.props as Props;
  return props[NODE_DIFF_DATA_KEY] as JSXOutput | null;
}

export function setNodeDiffPayload(vNode: VNode, payload: JSXOutput | Signal<JSXOutput>): void {
  const props = vNode.props as Props;
  props[NODE_DIFF_DATA_KEY] = payload;
}

export function executeNodeDiff(
  vNode: VNode,
  container: Container,
  journal: VNodeJournal
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.NODE_DIFF;

  const domVNode = vNode as ElementVNode;
  let jsx = getNodeDiffPayload(vNode);
  if (!jsx) {
    return;
  }
  if (isSignal(jsx)) {
    jsx = jsx.value as any;
  }
  const result = vnode_diff(container as ClientContainer, journal, jsx, domVNode, null);
  return result;
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
  journal: VNodeJournal
): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPONENT;
  const host = vNode as HostElement;
  const componentQRL = container.getHostProp<QRLInternal<OnRenderFn<unknown>> | null>(
    host,
    OnRenderProp
  );

  if (!componentQRL) {
    return;
  }

  const isServer = isServerPlatform();
  const props = container.getHostProp<Props | null>(host, ELEMENT_PROPS) || null;

  const result = safeCall(
    () => executeComponent(container, host, host, componentQRL, props),
    (jsx) => {
      if (isServer) {
        return jsx;
      } else {
        const styleScopedId = container.getHostProp<string>(host, QScopedStyle);
        return retryOnPromise(() =>
          vnode_diff(
            container as ClientContainer,
            journal,
            jsx,
            host,
            addComponentStylePrefix(styleScopedId)
          )
        );
      }
    },
    (err: any) => {
      container.handleError(err, host);
      throw err;
    }
  );

  if (isPromise(result)) {
    return result as Promise<void>;
  }

  return;
}

/**
 * Gets node prop data from a vNode.
 *
 * @param vNode - The vNode to get node prop data from
 * @returns Array of NodeProp, or null if none
 */
function getNodePropData(vNode: VNode): Map<string, NodeProp> | null {
  const props = vNode.props as Props;
  return (props[NODE_PROPS_DATA_KEY] as Map<string, NodeProp> | null) ?? null;
}

/**
 * Sets node prop data for a vNode.
 *
 * @param vNode - The vNode to set node prop data for
 * @param property - The property to set node prop data for
 * @param nodeProp - The node prop data to set
 */
export function setNodePropData(vNode: VNode, property: string, nodeProp: NodeProp): void {
  const props = vNode.props as Props;
  let data = props[NODE_PROPS_DATA_KEY] as Map<string, NodeProp> | null;
  if (!data) {
    data = new Map();
    props[NODE_PROPS_DATA_KEY] = data;
  }
  data.set(property, nodeProp);
}

/**
 * Clears node prop data from a vNode.
 *
 * @param vNode - The vNode to clear node prop data from
 */
function clearNodePropData(vNode: VNode): void {
  const props = vNode.props as Props;
  delete props[NODE_PROPS_DATA_KEY];
}

function setNodeProp(
  domVNode: ElementVNode,
  journal: VNodeJournal,
  property: string,
  value: string | boolean | null,
  isConst: boolean
): void {
  journal.push({
    operationType: VNodeOperationType.SetAttribute,
    target: domVNode.node!,
    attrName: property,
    attrValue: value,
  });
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
export function executeNodeProps(vNode: VNode, container: Container, journal: VNodeJournal): void {
  vNode.dirty &= ~ChoreBits.NODE_PROPS;
  if (!(vNode.flags & VNodeFlags.Element)) {
    return;
  }

  const allPropData = getNodePropData(vNode);
  if (!allPropData || allPropData.size === 0) {
    return;
  }

  const domVNode = vNode as ElementVNode;

  const isServer = isServerPlatform();

  // Process all pending node prop updates
  for (const [property, nodeProp] of allPropData.entries()) {
    let value: Signal<any> | string = nodeProp.value;
    if (isSignal(value)) {
      // TODO: Handle async signals (promises) - need to track pending async prop data
      value = value.value as any;
    }

    // Process synchronously (same logic as scheduler)
    const serializedValue = serializeAttribute(property, value, nodeProp.scopedStyleIdPrefix);
    if (isServer) {
      (container as SSRContainer).addBackpatchEntry(
        // TODO: type
        (vNode as unknown as ISsrNode).id,
        property,
        serializedValue
      );
    } else {
      const isConst = nodeProp.isConst;
      setNodeProp(domVNode, journal, property, serializedValue, isConst);
    }
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

  if (vnode_isVNode(vNode)) {
    // TODO I dont think this runs the cleanups of visible tasks
    // TODO add promises to extraPromises
    clearAllEffects(container, vNode);
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
export function executeCompute(vNode: VNode, container: Container): ValueOrPromise<void> {
  vNode.dirty &= ~ChoreBits.COMPUTE;

  // Compute chores are typically handled by the reactive system.
  // This is a placeholder for explicit compute chores if needed.

  // TODO remove or use

  return;
}
