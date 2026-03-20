import type { JSXOutput } from '../jsx/types/jsx-node';
import type { Props } from '../jsx/jsx-runtime';
import type { QRLInternal } from '../qrl/qrl-class';
import type { Signal } from '../../reactive-primitives/signal.public';
import type { NodeProp } from '../../reactive-primitives/subscription-data';
import { isSignal } from '../../reactive-primitives/utils';
import { executeComponent } from '../component-execution';
import type { OnRenderFn } from '../component.public';
import { ELEMENT_PROPS, ELEMENT_SEQ, OnRenderProp, QScopedStyle } from '../utils/markers';
import { safeCall, isPromise } from '../utils/promises';
import { addComponentStylePrefix } from '../utils/scoped-styles';
import type { ValueOrPromise } from '../utils/types';
import type { Container, HostElement } from '../types';
import type { VNode } from '../vnode/vnode';
import { Task, TaskFlags, type TaskFn } from '../../use/use-task';
import type { CursorData } from './cursor-props';
import { vnode_getProp, vnode_removeProp, vnode_setProp } from '../../client/vnode-utils';

export const NODE_PROPS_DATA_KEY = ':nodeProps';
export const NODE_DIFF_DATA_KEY = ':nodeDiff';
export const HOST_SIGNAL = ':signal';

export function getNodeDiffPayload(vNode: VNode): JSXOutput | Signal<JSXOutput> | null {
  return vnode_getProp(vNode, NODE_DIFF_DATA_KEY, null) as JSXOutput | Signal<JSXOutput> | null;
}

export function setNodeDiffPayload(vNode: VNode, payload: JSXOutput | Signal<JSXOutput>): void {
  vnode_setProp(vNode, NODE_DIFF_DATA_KEY, payload);
}

export function takeNodeDiffPayload(vNode: VNode): JSXOutput | Signal<JSXOutput> | null {
  const payload = vnode_getProp(vNode, NODE_DIFF_DATA_KEY, null) as
    | JSXOutput
    | Signal<JSXOutput>
    | null;
  if (payload == null) {
    return null;
  }
  vnode_removeProp(vNode, NODE_DIFF_DATA_KEY);
  return payload ?? null;
}

function getNodePropData(vNode: VNode): Map<string, NodeProp> | null {
  return vnode_getProp(vNode, NODE_PROPS_DATA_KEY, null) as Map<string, NodeProp> | null;
}

export function setNodePropData(vNode: VNode, property: string, nodeProp: NodeProp): void {
  let data = vnode_getProp(vNode, NODE_PROPS_DATA_KEY, null) as Map<string, NodeProp> | null;
  if (!data) {
    data = new Map();
    vnode_setProp(vNode, NODE_PROPS_DATA_KEY, data);
  }
  data.set(property, nodeProp);
}

export function clearNodePropData(vNode: VNode): void {
  vnode_removeProp(vNode, NODE_PROPS_DATA_KEY);
}

export function forEachPendingNodeProp(
  vNode: VNode,
  fn: (property: string, value: any, nodeProp: NodeProp) => void
): boolean {
  const allPropData = getNodePropData(vNode);
  if (!allPropData || allPropData.size === 0) {
    return false;
  }

  for (const [property, nodeProp] of allPropData.entries()) {
    let value: Signal<any> | string = nodeProp.value;
    if (isSignal(value)) {
      value = value.value as any;
    }
    fn(property, value, nodeProp);
  }

  return true;
}

export interface TaskRunnerPolicy {
  getElementSeq(vNode: VNode, container: Container): unknown[] | null;
  isRenderBlocking(task: Task<TaskFn, TaskFn>): boolean;
  treatVisibleTaskAsAfterFlush: boolean;
  collectNonBlockingPromise(cursorData: CursorData, promise: Promise<void>): void;
  runTask(
    task: Task<TaskFn, TaskFn>,
    container: Container,
    host: HostElement
  ): ValueOrPromise<void>;
}

export function executeTaskSequence(
  vNode: VNode,
  container: Container,
  cursorData: CursorData,
  policy: TaskRunnerPolicy
): ValueOrPromise<void> {
  const elementSeq = policy.getElementSeq(vNode, container);

  if (!elementSeq || elementSeq.length === 0) {
    return;
  }

  let taskPromise: Promise<void> | undefined;

  for (const item of elementSeq) {
    if (!(item instanceof Task)) {
      continue;
    }

    const task = item as Task<TaskFn, TaskFn>;
    if (!(task.$flags$ & TaskFlags.DIRTY)) {
      continue;
    }

    if (policy.treatVisibleTaskAsAfterFlush && task.$flags$ & TaskFlags.VISIBLE_TASK) {
      (cursorData.afterFlushTasks ||= []).push(task);
      continue;
    }

    const result = policy.runTask(task, container, vNode as HostElement);
    if (!isPromise(result)) {
      continue;
    }

    if (policy.isRenderBlocking(task)) {
      taskPromise = taskPromise
        ? taskPromise.then(() => result as Promise<void>)
        : (result as Promise<void>);
    } else {
      policy.collectNonBlockingPromise(cursorData, result as Promise<void>);
    }
  }

  return taskPromise;
}

export interface ComponentChoreData {
  host: HostElement;
  componentQRL: QRLInternal<OnRenderFn<unknown>>;
  props: Props | null;
}

export function getComponentChoreData(
  vNode: VNode,
  container: Container
): ComponentChoreData | null {
  const host = vNode as HostElement;
  const componentQRL = container.getHostProp<QRLInternal<OnRenderFn<unknown>> | null>(
    host,
    OnRenderProp
  );

  if (!componentQRL) {
    return null;
  }

  return {
    host,
    componentQRL,
    props: container.getHostProp<Props | null>(host, ELEMENT_PROPS) || null,
  };
}

export function getScopedStylePrefix(styleScopedId: string | null): string | null {
  return addComponentStylePrefix(styleScopedId);
}

export function readComponentScopedStylePrefix(
  container: Container,
  component: ComponentChoreData
): string | null {
  return getScopedStylePrefix(container.getHostProp<string>(component.host, QScopedStyle));
}

export function readHostScopedStylePrefix(container: Container, host: HostElement): string | null {
  return getScopedStylePrefix(container.getHostProp<string>(host, QScopedStyle));
}

export function runComponentChore(
  container: Container,
  component: ComponentChoreData,
  onJsx: (jsx: JSXOutput, component: ComponentChoreData) => ValueOrPromise<void>
): ValueOrPromise<void> {
  return safeCall(
    () =>
      executeComponent(
        container,
        component.host,
        component.host,
        component.componentQRL,
        component.props
      ),
    (jsx) => onJsx(jsx, component),
    (err: any) => {
      container.handleError(err, component.host);
    }
  );
}

export function getElementSequenceFromContainer(
  vNode: VNode,
  container: Container
): unknown[] | null {
  return container.getHostProp<unknown[] | null>(vNode as HostElement, ELEMENT_SEQ);
}
