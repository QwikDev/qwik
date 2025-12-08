import { vnode_journalToString, type VNodeJournal } from '../../client/vnode';
import { runTask } from '../../use/use-task';
import { QContainerValue, type Container } from '../types';
import { dangerouslySetInnerHTML, QContainerAttr } from '../utils/markers';
import { VNodeOperationType } from '../vnode/enums/vnode-operation-type.enum';
import type { Cursor } from './cursor';
import { getCursorData, type CursorData } from './cursor-props';

/**
 * Executes the flush phase for a cursor.
 *
 * @param cursor - The cursor to execute the flush phase for
 * @param container - The container to execute the flush phase for
 */
export function executeFlushPhase(cursor: Cursor, container: Container): void {
  const cursorData = getCursorData(cursor)!;
  const journal = cursorData.journal;
  if (journal && journal.length > 0) {
    _flushJournal(journal);
    cursorData.journal = null;
  }
  executeAfterFlush(container, cursorData);
}

export function _flushJournal(journal: VNodeJournal): void {
  // console.log(vnode_journalToString(journal));
  for (const operation of journal) {
    switch (operation.operationType) {
      case VNodeOperationType.InsertOrMove: {
        const insertBefore = operation.beforeTarget;
        const insertBeforeParent = operation.parent;
        insertBeforeParent.insertBefore(operation.target, insertBefore);
        break;
      }
      case VNodeOperationType.Delete: {
        operation.target.remove();
        break;
      }
      case VNodeOperationType.SetText: {
        operation.target.nodeValue = operation.text;
        break;
      }
      case VNodeOperationType.SetAttribute: {
        const element = operation.target;
        const attrName = operation.attrName;
        const attrValue = operation.attrValue;
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
        break;
      }
      case VNodeOperationType.RemoveAllChildren: {
        const removeParent = operation.target;
        if (removeParent.replaceChildren) {
          removeParent.replaceChildren();
        } else {
          // fallback if replaceChildren is not supported
          removeParent.textContent = '';
        }
        break;
      }
    }
  }
}

function executeAfterFlush(container: Container, cursorData: CursorData): void {
  const visibleTasks = cursorData.afterFlushTasks;
  if (!visibleTasks || visibleTasks.length === 0) {
    return;
  }
  for (const visibleTask of visibleTasks) {
    const task = visibleTask;
    runTask(task, container, task.$el$);
  }
  cursorData.afterFlushTasks = null;
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
