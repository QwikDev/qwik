import type { ISsrNode, SSRContainer } from '../../ssr/ssr-types';
import { runResource, type ResourceDescriptor } from '../../use/use-resource';
import { runTask, Task, TaskFlags, type TaskFn } from '../../use/use-task';
import { SsrNodeFlags, type Container } from '../types';
import { ELEMENT_SEQ } from '../utils/markers';
import type { ValueOrPromise } from '../utils/types';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { logWarn } from '../utils/log';
import { serializeAttribute } from '../utils/styles';
import { NODE_PROPS_DATA_KEY } from './cursor-props';
import type { NodeProp } from '../../reactive-primitives/subscription-data';
import { isSignal, type Signal } from '../../reactive-primitives/signal.public';
import { executeCompute } from './chore-execution';
import { isPromise } from '../utils/promises';

/** @internal */
export function _executeSsrChores(
  container: SSRContainer,
  ssrNode: ISsrNode
): ValueOrPromise<void> {
  if (!(ssrNode.flags & SsrNodeFlags.Updatable)) {
    if (ssrNode.dirty & ChoreBits.NODE_PROPS) {
      executeNodePropChore(container, ssrNode);
    }
    if (ssrNode.dirty & ChoreBits.COMPUTE) {
      executeCompute(ssrNode, container);
    }
    if (ssrNode.dirty & ChoreBits.DIRTY_MASK) {
      // We are running on the server.
      // On server we can't schedule task for a different host!
      // Server is SSR, and therefore scheduling for anything but the current host
      // implies that things need to be re-run and that is not supported because of streaming.
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
  if (ssrNode.dirty & ChoreBits.COMPONENT) {
    // should not happen on SSR with non-streamed node
  }
  ssrNode.dirty &= ~ChoreBits.DIRTY_MASK;
  if (promise) {
    return promise;
  }
}

function executeTasksChore(container: Container, ssrNode: ISsrNode): ValueOrPromise<void> | null {
  ssrNode.dirty &= ~ChoreBits.TASKS;
  const elementSeq = ssrNode.getProp(ELEMENT_SEQ);
  if (!elementSeq || elementSeq.length === 0) {
    // No tasks to execute, clear the bit
    return null;
  }
  let promise: ValueOrPromise<void> | null = null;
  for (const item of elementSeq) {
    if (item instanceof Task) {
      const task = item as Task<TaskFn, TaskFn>;

      // Skip if task is not dirty
      if (!(task.$flags$ & TaskFlags.DIRTY)) {
        continue;
      }

      let result: ValueOrPromise<void>;
      // Check if it's a resource
      if (task.$flags$ & TaskFlags.RESOURCE) {
        result = runResource(task as ResourceDescriptor<TaskFn>, container, ssrNode);
      } else {
        result = runTask(task, container, ssrNode);
      }
      promise = promise ? promise.then(() => result as Promise<void>) : (result as Promise<void>);
    }
  }
  return promise;
}

export function executeNodePropChore(container: SSRContainer, ssrNode: ISsrNode): void {
  ssrNode.dirty &= ~ChoreBits.NODE_PROPS;

  const allPropData = ssrNode.getProp(NODE_PROPS_DATA_KEY) as Map<string, NodeProp> | null;
  if (!allPropData || allPropData.size === 0) {
    return;
  }

  for (const [property, nodeProp] of allPropData.entries()) {
    let value: Signal<any> | string = nodeProp.value;
    if (isSignal(value)) {
      // TODO: Handle async signals (promises) - need to track pending async prop data
      value = value.value as any;
    }
    const serializedValue = serializeAttribute(property, value, nodeProp.scopedStyleIdPrefix);
    container.addBackpatchEntry(ssrNode.id, property, serializedValue);
  }
}
