import { type VNodeJournal } from '../../client/vnode-utils';
import { runTask } from '../../use/use-task';
import { QContainerValue, type Container } from '../types';
import { dangerouslySetInnerHTML, QContainerAttr } from '../utils/markers';
import { isPromise } from '../utils/promises';
import { serializeAttribute } from '../utils/styles';
import {
  DeleteOperation,
  InsertOrMoveOperation,
  RemoveAllChildrenOperation,
  SetAttributeOperation,
  SetTextOperation,
} from '../vnode/types/dom-vnode-operation';
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

let _insertBefore: typeof Element.prototype.insertBefore | null = null;

const fastInsertBefore = (
  insertBeforeParent: Node,
  target: Node,
  insertBefore: Node | null
): void => {
  if (!_insertBefore) {
    _insertBefore = insertBeforeParent.insertBefore;
  }
  _insertBefore.call(insertBeforeParent, target, insertBefore);
};

export function _flushJournal(journal: VNodeJournal): void {
  // console.log(vnode_journalToString(journal));
  for (const operation of journal) {
    if (operation instanceof InsertOrMoveOperation) {
      const insertBefore = operation.beforeTarget;
      const insertBeforeParent = operation.parent;
      fastInsertBefore(insertBeforeParent, operation.target, insertBefore);
    } else if (operation instanceof SetTextOperation) {
      operation.target.nodeValue = operation.text;
    } else if (operation instanceof SetAttributeOperation) {
      const element = operation.target;
      const attrName = operation.attrName;
      const rawValue = operation.attrValue;
      const attrValue =
        rawValue != null
          ? serializeAttribute(attrName, rawValue, operation.scopedStyleIdPrefix)
          : null;
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
    } else if (operation instanceof DeleteOperation) {
      operation.target.remove();
    } else if (operation instanceof RemoveAllChildrenOperation) {
      const removeParent = operation.target;
      removeParent.textContent = '';
    }
  }
}

function executeAfterFlush(container: Container, cursorData: CursorData): void {
  const visibleTasks = cursorData.afterFlushTasks;
  if (!visibleTasks || visibleTasks.length === 0) {
    cursorData.afterFlushTasks = null;
    return;
  }
  let visibleTaskPromise: Promise<void> | undefined;
  for (const visibleTask of visibleTasks) {
    const task = visibleTask;
    const result = runTask(task, container, task.$el$);
    if (isPromise(result)) {
      visibleTaskPromise = visibleTaskPromise ? visibleTaskPromise.then(() => result) : result;
    }
  }
  if (visibleTaskPromise) {
    (cursorData.extraPromises ||= []).push(visibleTaskPromise);
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
