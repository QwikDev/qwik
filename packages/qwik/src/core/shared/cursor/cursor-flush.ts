import { vnode_journalToString, type VNodeJournal } from '../../client/vnode-utils';
import { runTask } from '../../use/use-task';
import { QContainerValue, type Container } from '../types';
import { directSetAttribute } from '../utils/attribute';
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

const DEBUG = false;

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
  DEBUG && console.warn('walkCursor: flushing journal', vnode_journalToString(journal));
  let batchParent: Node | null = null;
  let batchBefore: Node | null = null;
  let batchNodes: Node[] | null = null;
  const batchSet = new Set<Node>();

  const flush = () => {
    if (batchNodes) {
      if (batchNodes.length === 1) {
        fastInsertBefore(batchParent!, batchNodes[0], batchBefore);
      } else {
        const doc = batchParent!.ownerDocument || (batchParent as Document);
        const fragment = doc.createDocumentFragment();
        for (const node of batchNodes) {
          fragment.appendChild(node);
        }
        fastInsertBefore(batchParent!, fragment, batchBefore);
      }
      batchNodes = null;
      batchParent = null;
      batchBefore = null;
      batchSet.clear();
    }
  };

  for (const operation of journal) {
    if (operation instanceof InsertOrMoveOperation) {
      if (batchParent === operation.parent && batchBefore === operation.beforeTarget) {
        if (!batchNodes) {
          batchNodes = [];
        }
        batchNodes.push(operation.target);
        batchSet.add(operation.target);
        continue;
      }

      if (batchNodes) {
        // If we have an existing batch, we need to check if the new operation conflicts with it.
        // 1. If we are inserting into the same parent but with a different "before" reference, we must flush.
        if (batchParent === operation.parent) {
          flush();
          batchParent = operation.parent;
          batchBefore = operation.beforeTarget;
          batchNodes = [operation.target];
          batchSet.add(operation.target);
          continue;
        }
        // 2. If we are moving a node that is currently in the batch, or moving the node that is the reference for the batch.
        if (
          batchSet.has(operation.target) ||
          (batchBefore && operation.target === batchBefore) ||
          (batchParent && operation.target === batchParent)
        ) {
          flush();
          batchParent = operation.parent;
          batchBefore = operation.beforeTarget;
          batchNodes = [operation.target];
          batchSet.add(operation.target);
          continue;
        }
        // 3. Otherwise, we can execute this operation immediately without flushing the current batch.
        // This is important for "interleaved" inserts, e.g. inserting <tr> into <tbody> (batched)
        // and then inserting <td> into that <tr> (immediate).
        // The <tr> is in memory, so inserting <td> into it is fine and doesn't require the <tr> to be in the DOM.
      } else {
        batchParent = operation.parent;
        batchBefore = operation.beforeTarget;
        batchNodes = [operation.target];
        batchSet.add(operation.target);
        continue;
      }

      fastInsertBefore(operation.parent, operation.target, operation.beforeTarget);
      continue;
    }

    if (operation instanceof DeleteOperation) {
      if (
        batchSet.has(operation.target) ||
        (batchBefore && operation.target === batchBefore) ||
        (batchParent && operation.target === batchParent)
      ) {
        flush();
      }
      operation.target.remove();
      continue;
    }

    if (operation instanceof RemoveAllChildrenOperation) {
      if (
        batchSet.has(operation.target) ||
        (batchBefore && operation.target === batchBefore) ||
        (batchParent && operation.target === batchParent)
      ) {
        flush();
      }
      // Removing children of a node in the batch is safe (clears detached node)
      const removeParent = operation.target;
      removeParent.textContent = '';
      continue;
    }

    if (operation instanceof SetTextOperation) {
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
        if (batchParent === element) {
          flush();
        }
        (element as any).innerHTML = attrValue;
        element.setAttribute(QContainerAttr, QContainerValue.HTML);
      } else if (shouldRemove) {
        element.removeAttribute(attrName);
      } else if (attrName === 'value' && attrName in element) {
        (element as any).value = attrValue;
      } else {
        directSetAttribute(element, attrName, attrValue, operation.isSvg);
      }
    }
  }
  flush();
}

function executeAfterFlush(container: Container, cursorData: CursorData): void {
  const visibleTasks = cursorData.afterFlushTasks;
  if (!visibleTasks || visibleTasks.length === 0) {
    cursorData.afterFlushTasks = null;
    return;
  }
  DEBUG &&
    console.warn(
      'walkCursor: executeAfterFlush',
      visibleTasks.map((t) => t.$qrl$.$symbol$)
    );

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
