import { ELEMENT_ID } from '../../shared/utils/markers';
import { NodeType } from '../utils/consts';
import { fastFirstChild, fastNextSibling, fastPreviousSibling } from './fast-getters';

const ELEMENT_ID_SELECTOR = ELEMENT_ID.replace(':', '\\:');
const CONTEXT_OPEN = 'c=';
const CONTEXT_CLOSE = '/c';
const RANGE_TEXT_MARKER = 't';
const BRANCH_OPEN = 'b=';
const BRANCH_CLOSE = '/b';
const FOR_OPEN = 'f=';
const FOR_CLOSE = '/f';
const SLOT_OPEN = 's=';
const SLOT_CLOSE = '/s';
const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';
const ROW_ATTR = 'q:row';

export type BranchMarkerRange = readonly [Comment, Comment];
export type ForMarkerRange = readonly [Comment, Comment];
export type SlotMarkerRange = readonly [Comment, Comment];
export type RowMarkerRange = readonly [Comment, Comment];
export type ForRowRange = Element | RowMarkerRange;

export function findQwikElement(element: Element, elementId: string | number): Element | null {
  if (elementId == null) {
    // TODO: throw error?
    return null;
  }
  const stringId = String(elementId);
  if (element.getAttribute(ELEMENT_ID) === stringId) {
    return element;
  }
  return element.querySelector(`[${ELEMENT_ID_SELECTOR}="${stringId}"]`) ?? null;
}

export function findElementText(parentNode: Node): Text | null {
  const text = fastFirstChild(parentNode);
  return text !== null && text.nodeType === NodeType.Text ? (text as Text) : null;
}

export function findTextNode(parentNode: Node, markerIndex: number): Text | null {
  let index = 0;
  let currentNode = fastFirstChild(parentNode);
  while (currentNode) {
    if (
      currentNode.nodeType === NodeType.Comment &&
      (currentNode as Comment).data === RANGE_TEXT_MARKER
    ) {
      if (index === markerIndex) {
        const text = fastNextSibling(currentNode);
        return text !== null && text.nodeType === NodeType.Text ? (text as Text) : null;
      }
      index++;
    }
    currentNode = fastNextSibling(currentNode);
  }
  return null;
}

export function findBranchTextNode(range: BranchMarkerRange, markerIndex: number): Text | null {
  const [, end] = range;
  let index = 0;
  let currentNode = fastNextSibling(range[0]);
  while (currentNode && currentNode !== end) {
    if (
      currentNode.nodeType === NodeType.Comment &&
      (currentNode as Comment).data === RANGE_TEXT_MARKER
    ) {
      if (index === markerIndex) {
        const text = fastNextSibling(currentNode);
        return text !== null && text !== end && text.nodeType === NodeType.Text
          ? (text as Text)
          : null;
      }
      index++;
    }
    currentNode = fastNextSibling(currentNode);
  }
  return null;
}

export function findBranchRange(
  element: Element,
  rangeId: string | number
): BranchMarkerRange | null {
  const start = findComment(element, BRANCH_OPEN + String(rangeId));
  if (start === null) {
    return null;
  }
  const end = findBranchEnd(start);
  return end === null ? null : [start, end];
}

export function findForRange(element: Element, rangeId: string | number): ForMarkerRange | null {
  const start = findComment(element, FOR_OPEN + String(rangeId));
  if (start === null) {
    return null;
  }
  const end = findRangeEnd(start, FOR_OPEN, FOR_CLOSE);
  return end === null ? null : [start, end];
}

export function findSlotRange(element: Element, rangeId: string | number): SlotMarkerRange | null {
  const start = findComment(element, SLOT_OPEN + String(rangeId));
  if (start === null) {
    return null;
  }
  const end = findRangeEnd(start, SLOT_OPEN, SLOT_CLOSE);
  return end === null ? null : [start, end];
}

export function findForRowRange(element: Element, rowId: string | number): RowMarkerRange | null {
  const start = findComment(element, ROW_OPEN + '=' + String(rowId));
  if (start === null) {
    return null;
  }
  const end = findRangeEnd(start, ROW_OPEN, ROW_CLOSE);
  return end === null ? null : [start, end];
}

export function findForRowRanges(start: Comment, end: Comment): ForRowRange[] {
  const rows: ForRowRange[] = [];
  let rowStart: Comment | null = null;
  let forDepth = 0;
  let sibling = fastNextSibling(start);

  while (sibling !== null && sibling !== end) {
    if (sibling.nodeType === NodeType.Comment) {
      const comment = sibling as Comment;
      const data = comment.data;

      if (forDepth !== 0) {
        if (data.startsWith(FOR_OPEN)) {
          forDepth++;
        } else if (data === FOR_CLOSE) {
          forDepth--;
        }
      } else if (data.startsWith(FOR_OPEN)) {
        forDepth = 1;
      } else if (rowStart === null && isRowOpenMarker(data)) {
        rowStart = comment;
      } else if (rowStart !== null && data === ROW_CLOSE) {
        rows.push([rowStart, comment]);
        rowStart = null;
      }
    } else if (
      rowStart === null &&
      sibling.nodeType === NodeType.Element &&
      (sibling as Element).hasAttribute(ROW_ATTR)
    ) {
      rows.push(sibling as Element);
    }
    sibling = fastNextSibling(sibling);
  }
  return rows;
}

function isRowOpenMarker(data: string): boolean {
  return data === ROW_OPEN || data.startsWith(ROW_OPEN + '=');
}

function findComment(node: Node, data: string): Comment | null {
  if (!canHaveChildNodes(node)) {
    return null;
  }
  let child = fastFirstChild(node);
  while (child !== null) {
    if (child.nodeType === NodeType.Comment && (child as Comment).data === data) {
      return child as Comment;
    }
    const nested = findComment(child, data);
    if (nested !== null) {
      return nested;
    }
    child = fastNextSibling(child);
  }
  return null;
}

function findBranchEnd(start: Comment): Comment | null {
  return findRangeEnd(start, BRANCH_OPEN, BRANCH_CLOSE);
}

function findRangeEnd(start: Comment, open: string, close: string): Comment | null {
  let depth = 0;
  let sibling = fastNextSibling(start);
  while (sibling !== null) {
    if (sibling.nodeType === NodeType.Comment) {
      const data = (sibling as Comment).data;
      if (data.startsWith(open)) {
        depth++;
      } else if (data === close) {
        if (depth === 0) {
          return sibling as Comment;
        }
        depth--;
      }
    }
    sibling = fastNextSibling(sibling);
  }
  return null;
}

export function findContextScopeId(node: Node): string | null {
  let current: Node | null = node;
  while (current !== null) {
    const parent: ParentNode | null = current.parentNode;
    if (parent === null) {
      return null;
    }

    let depth = 0;
    let sibling = fastPreviousSibling(current);
    while (sibling !== null) {
      if (sibling.nodeType === NodeType.Comment) {
        const data = (sibling as Comment).data;
        if (data === CONTEXT_CLOSE) {
          depth++;
        } else if (data.startsWith(CONTEXT_OPEN)) {
          if (depth === 0) {
            return data.slice(CONTEXT_OPEN.length);
          }
          depth--;
        }
      }
      sibling = fastPreviousSibling(sibling);
    }

    current = parent;
  }
  return null;
}

function canHaveChildNodes(node: Node): boolean {
  return (
    node.nodeType === NodeType.Element ||
    node.nodeType === NodeType.Document ||
    node.nodeType === NodeType.DocumentFragment
  );
}
