import { vnode_isElementOrTextVNode, vnode_isVirtualVNode } from '../../client/vnode';
import { runTask, Task, TaskFlags } from '../../use/use-task';
import { QContainerValue, type Container } from '../types';
import { dangerouslySetInnerHTML, ELEMENT_SEQ, QContainerAttr } from '../utils/markers';
import type { ElementVNode } from '../vnode/element-vnode';
import { ChoreBits } from '../vnode/enums/chore-bits.enum';
import { VNodeOperationType } from '../vnode/enums/vnode-operation-type.enum';
import type { TextVNode } from '../vnode/text-vnode';
import type { TargetAndParentDomVNodeOperation } from '../vnode/types/dom-vnode-operation';
import type { VNode } from '../vnode/vnode';
import type { Cursor } from './cursor';

/**
 * Executes the flush phase for a cursor.
 *
 * @param cursor - The cursor to execute the flush phase for
 * @param container - The container to execute the flush phase for
 */
export function executeFlushPhase(cursor: Cursor, container: Container): void {
  const visibleTasks: Task[] = [];
  flushChanges(cursor, container, visibleTasks);
  executeAfterFlush(container, visibleTasks);
}

function flushChanges(
  vNode: VNode,
  container: Container,
  visibleTasks: Task[],
  skipRender?: boolean
): void {
  if (!skipRender) {
    if (vnode_isVirtualVNode(vNode)) {
      if (vNode.dirty & ChoreBits.VISIBLE_TASKS) {
        vNode.dirty &= ~ChoreBits.VISIBLE_TASKS;

        const sequence = container.getHostProp<unknown[] | null>(vNode, ELEMENT_SEQ);
        if (sequence) {
          for (const sequenceItem of sequence) {
            if (
              sequenceItem instanceof Task &&
              sequenceItem.$flags$ & TaskFlags.VISIBLE_TASK &&
              sequenceItem.$flags$ & TaskFlags.DIRTY
            ) {
              visibleTasks.push(sequenceItem);
            }
          }
        }
      }
      if (vNode.operation && vNode.operation.operationType & VNodeOperationType.SkipRender) {
        skipRender = true;
      }
    } else if (vnode_isElementOrTextVNode(vNode) && vNode.operation) {
      if (vNode.operation.operationType & VNodeOperationType.RemoveAllChildren) {
        const removeParent = (vNode as ElementVNode).node!;
        if (removeParent.replaceChildren) {
          removeParent.replaceChildren();
        } else {
          // fallback if replaceChildren is not supported
          removeParent.textContent = '';
        }
      }

      if (vNode.operation.operationType & VNodeOperationType.SetText) {
        (vNode as TextVNode).node!.nodeValue = (vNode as TextVNode).text!;
      }

      if (vNode.operation.operationType & VNodeOperationType.InsertOrMove) {
        const operation = vNode.operation as TargetAndParentDomVNodeOperation;
        const insertBefore = operation.target;
        const insertBeforeParent = operation.parent;
        insertBeforeParent.insertBefore(vNode.node!, insertBefore);
      } else if (vNode.operation.operationType & VNodeOperationType.Delete) {
        vNode.node!.remove();
      }

      if (vNode.operation.attrs) {
        const element = (vNode as ElementVNode).node!;
        for (const [attrName, attrValue] of Object.entries(vNode.operation.attrs)) {
          const shouldRemove = attrValue == null || attrValue === false;
          if (isBooleanAttr(element, attrName)) {
            (element as any)[attrName] = parseBoolean(attrValue);
          } else if (attrName === dangerouslySetInnerHTML) {
            (element as any).innerHTML = attrValue;
            element.setAttribute(QContainerAttr, QContainerValue.HTML);
          } else if (shouldRemove) {
            element.removeAttribute(attrName);
          } else if (attrName === 'value' && attrName in element) {
            (element as any).value = attrValue;
          } else {
            element.setAttribute(attrName, attrValue as string);
          }
        }
      }
      vNode.operation = null;
      vNode.dirty &= ~ChoreBits.OPERATION;
    }
  }

  if (vNode.dirtyChildren) {
    for (const child of vNode.dirtyChildren) {
      flushChanges(child, container, visibleTasks, skipRender);
    }
    vNode.dirtyChildren = null;
  }
}

function executeAfterFlush(container: Container, visibleTasks: Task[]): void {
  if (!visibleTasks.length) {
    return;
  }
  for (const visibleTask of visibleTasks) {
    const task = visibleTask;
    runTask(task, container, task.$el$);
  }
}

const isBooleanAttr = (element: Element, key: string): boolean => {
  const isBoolean =
    key == 'allowfullscreen' ||
    key == 'async' ||
    key == 'autofocus' ||
    key == 'autoplay' ||
    key == 'checked' ||
    key == 'controls' ||
    key == 'default' ||
    key == 'defer' ||
    key == 'disabled' ||
    key == 'formnovalidate' ||
    key == 'inert' ||
    key == 'ismap' ||
    key == 'itemscope' ||
    key == 'loop' ||
    key == 'multiple' ||
    key == 'muted' ||
    key == 'nomodule' ||
    key == 'novalidate' ||
    key == 'open' ||
    key == 'playsinline' ||
    key == 'readonly' ||
    key == 'required' ||
    key == 'reversed' ||
    key == 'selected';
  return isBoolean && key in element;
};

const parseBoolean = (value: string | boolean | null): boolean => {
  if (value === 'false') {
    return false;
  }
  return Boolean(value);
};
