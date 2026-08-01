import { ELEMENT_ID } from '../shared/utils/markers';
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
const CONTENT_OPEN = 'd=';
const CONTENT_CLOSE = '/d';
const SLOT_OPEN = 's=';
const SLOT_CLOSE = '/s';
const ROW_OPEN = 'r';
const ROW_CLOSE = '/r';
const ROW_ATTR = 'q:row';

export type BranchMarkerRange = readonly [Comment, Comment];
export type ForMarkerRange = readonly [Comment, Comment];
export type ContentMarkerRange = readonly [Comment, Comment];
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
  return findMarkerRange(element, BRANCH_OPEN + String(rangeId), BRANCH_OPEN, BRANCH_CLOSE);
}

export function findForRange(element: Element, rangeId: string | number): ForMarkerRange | null {
  return findMarkerRange(element, FOR_OPEN + String(rangeId), FOR_OPEN, FOR_CLOSE);
}

export function findContentRange(
  element: Element,
  rangeId: string | number
): ContentMarkerRange | null {
  return findMarkerRange(element, CONTENT_OPEN + String(rangeId), CONTENT_OPEN, CONTENT_CLOSE);
}

function findMarkerRange(
  element: Element,
  marker: string,
  open: string,
  close: string
): readonly [Comment, Comment] | null {
  const start = findComment(element, marker);
  if (start === null) {
    return null;
  }
  const end = findRangeEnd(start, open, close);
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

// 128 = NodeFilter.SHOW_COMMENT
function createCommentWalker(element: Element): TreeWalker {
  return element.ownerDocument!.createTreeWalker(element, 128);
}

function findComment(element: Element, data: string): Comment | null {
  const walker = createCommentWalker(element);
  let comment: Node | null;
  while ((comment = walker.nextNode()) !== null) {
    if ((comment as Comment).data === data) {
      return comment as Comment;
    }
  }
  return null;
}

/**
 * Branch text sits in a branch, a for-row or a slot range. All three ids come from one
 * per-container counter, so at most one kind owns an id and the first match wins.
 */
export function findBranchTextRange(
  element: Element,
  rangeId: string | number
): readonly [Comment, Comment] | null {
  const id = String(rangeId);
  const branchMarker = BRANCH_OPEN + id;
  const rowMarker = ROW_OPEN + '=' + id;
  const slotMarker = SLOT_OPEN + id;
  const walker = createCommentWalker(element);
  let comment: Node | null;
  while ((comment = walker.nextNode()) !== null) {
    const data = (comment as Comment).data;
    if (data === branchMarker) {
      return toRange(comment as Comment, BRANCH_OPEN, BRANCH_CLOSE);
    }
    if (data === rowMarker) {
      return toRange(comment as Comment, ROW_OPEN, ROW_CLOSE);
    }
    if (data === slotMarker) {
      return toRange(comment as Comment, SLOT_OPEN, SLOT_CLOSE);
    }
  }
  return null;
}

function toRange(start: Comment, open: string, close: string): readonly [Comment, Comment] | null {
  const end = findRangeEnd(start, open, close);
  return end === null ? null : [start, end];
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
