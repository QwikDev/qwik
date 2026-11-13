import { ELEMENT_ID } from '../shared/utils/markers';
import { NodeType } from '../utils/consts';
import {
  fastFirstChild,
  fastGetAttribute,
  fastNextSibling,
  fastPreviousSibling,
} from './fast-getters';

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
const ROW_OPEN_PREFIX = 'r=';
const ROW_CLOSE = '/r';
const ROW_ATTR = 'q:row';

export type BranchMarkerRange = readonly [Comment, Comment];
export type ForMarkerRange = readonly [Comment, Comment];
export type ContentMarkerRange = readonly [Comment, Comment];
export type RowMarkerRange = readonly [Comment, Comment];
/** A row's DOM plus the key its marker carries; null when the collection is unkeyed. */
export type ForRow = { readonly dom: Element | RowMarkerRange; readonly key: string | null };
export type ForRowRange = Element | RowMarkerRange;

export function findQwikElement(
  element: Element | DocumentFragment,
  elementId: string | number
): Element | null {
  if (elementId == null) {
    // TODO: throw error?
    return null;
  }
  const stringId = String(elementId);
  if (
    element.nodeType === NodeType.Element &&
    fastGetAttribute(element as Element, ELEMENT_ID) === stringId
  ) {
    return element as Element;
  }
  for (const candidate of element.querySelectorAll(`[${ELEMENT_ID_SELECTOR}="${stringId}"]`)) {
    if (isOwnedBy(element, candidate)) {
      return candidate;
    }
  }
  return null;
}

/** A node under a nested container belongs to that container, not to `root`'s. */
function isOwnedBy(root: Element | DocumentFragment, element: Element | null): boolean {
  let ancestor = element;
  while (ancestor !== null && ancestor !== root && !ancestor.hasAttribute('q:container')) {
    ancestor = ancestor.parentElement;
  }
  return ancestor === root || ancestor === null;
}

function isOwnComment(root: Element | DocumentFragment, comment: Comment): boolean {
  return isOwnedBy(root, comment.parentElement);
}

/** No filter callback: only a matching comment pays for the nested-container check. */
function createMarkerWalker(root: Element | DocumentFragment): TreeWalker {
  // 128 = NodeFilter.SHOW_COMMENT
  return root.ownerDocument!.createTreeWalker(root, 128);
}

export function findElementText(parentNode: Node): Text {
  return ensureTextNode(parentNode, fastFirstChild(parentNode));
}

/** An empty value writes no text on the server, so resume creates the node the effect fills. */
function ensureTextNode(parentNode: Node, candidate: Node | null): Text {
  if (candidate !== null && candidate.nodeType === NodeType.Text) {
    return candidate as Text;
  }
  const text = parentNode.ownerDocument!.createTextNode('');
  parentNode.insertBefore(text, candidate);
  return text;
}

export function findTextNode(parentNode: Node, markerIndex: number): Text | null {
  return findMarkedText(fastFirstChild(parentNode), null, markerIndex);
}

export function findBranchTextNode(range: BranchMarkerRange, markerIndex: number): Text | null {
  return findMarkedText(fastNextSibling(range[0]), range[1], markerIndex);
}

/** The text after the `markerIndex`-th text marker among the siblings from `first` to `end`. */
function findMarkedText(first: Node | null, end: Node | null, markerIndex: number): Text | null {
  let index = 0;
  let currentNode = first;
  while (currentNode !== null && currentNode !== end) {
    if (
      currentNode.nodeType === NodeType.Comment &&
      (currentNode as Comment).data === RANGE_TEXT_MARKER
    ) {
      if (index === markerIndex) {
        return ensureTextNode(currentNode.parentNode!, fastNextSibling(currentNode));
      }
      index++;
    }
    currentNode = fastNextSibling(currentNode);
  }
  return null;
}

export function findBranchRange(
  element: Element | DocumentFragment,
  rangeId: string | number
): BranchMarkerRange | null {
  return findMarkerRange(element, BRANCH_OPEN + String(rangeId), BRANCH_OPEN, BRANCH_CLOSE);
}

export function findForRange(
  element: Element | DocumentFragment,
  rangeId: string | number
): ForMarkerRange | null {
  return findMarkerRange(element, FOR_OPEN + String(rangeId), FOR_OPEN, FOR_CLOSE);
}

export function findContentRange(
  element: Element | DocumentFragment,
  rangeId: string | number
): ContentMarkerRange | null {
  return findMarkerRange(element, CONTENT_OPEN + String(rangeId), CONTENT_OPEN, CONTENT_CLOSE);
}

export function findProjectionRange(
  element: Element | DocumentFragment,
  rangeId: number
): ContentMarkerRange | null {
  const marker = SLOT_OPEN + String(rangeId) + ',';
  const walker = createMarkerWalker(element);
  let comment: Comment | null;
  while ((comment = walker.nextNode() as Comment | null) !== null) {
    if (comment.data.startsWith(marker) && isOwnComment(element, comment)) {
      return toRange(comment, SLOT_OPEN, SLOT_CLOSE);
    }
  }
  return null;
}

function findMarkerRange(
  element: Element | DocumentFragment,
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

export function findForRows(start: Comment, end: Comment): ForRow[] {
  const rows: ForRow[] = [];
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
        rows.push({ dom: [rowStart, comment], key: rowMarkerKey(rowStart.data) });
        rowStart = null;
      }
    } else if (rowStart === null && sibling.nodeType === NodeType.Element) {
      const key = fastGetAttribute(sibling as Element, ROW_ATTR);
      if (key !== null) {
        rows.push({ dom: sibling as Element, key: key === '' ? null : key });
      }
    }
    sibling = fastNextSibling(sibling);
  }
  return rows;
}

/** `r=<id>,<key>` keeps the id addressable while the key rides along for resume. */
function rowMarkerKey(data: string): string | null {
  const comma = data.indexOf(',');
  return comma === -1 ? null : unescape(data.slice(comma + 1));
}

function isRowOpenMarker(data: string): boolean {
  return data === ROW_OPEN || data.startsWith(ROW_OPEN_PREFIX);
}

/** Matches `<prefix><id>`, plus the `,<key>` tail a keyed row's marker carries. */
function isMarkerFor(data: string, prefix: string, id: string): boolean {
  if (!data.startsWith(prefix) || !data.startsWith(id, prefix.length)) {
    return false;
  }
  const end = prefix.length + id.length;
  return end === data.length || data[end] === ',';
}

// 128 = NodeFilter.SHOW_COMMENT
export function createCommentWalker(element: Element | DocumentFragment): TreeWalker {
  return element.ownerDocument!.createTreeWalker(element, 129, {
    acceptNode(node) {
      if (node.nodeType === NodeType.Element) {
        return (node as Element).hasAttribute('q:container') ? 2 : 3;
      }
      return 1;
    },
  });
}

function findComment(element: Element | DocumentFragment, data: string): Comment | null {
  const walker = createMarkerWalker(element);
  let comment: Comment | null;
  while ((comment = walker.nextNode() as Comment | null) !== null) {
    if (comment.data === data && isOwnComment(element, comment)) {
      return comment;
    }
  }
  return null;
}

/**
 * Branch text sits in a branch, a for-row or a slot range. All three ids come from one
 * per-container counter, so at most one kind owns an id and the first match wins.
 */
export function findBranchTextRange(
  element: Element | DocumentFragment,
  rangeId: string | number
): readonly [Comment, Comment] | null {
  const id = String(rangeId);
  const walker = createMarkerWalker(element);
  let comment: Comment | null;
  while ((comment = walker.nextNode() as Comment | null) !== null) {
    const data = comment.data;
    if (isMarkerFor(data, BRANCH_OPEN, id) && isOwnComment(element, comment)) {
      return toRange(comment, BRANCH_OPEN, BRANCH_CLOSE);
    }
    if (isMarkerFor(data, ROW_OPEN_PREFIX, id) && isOwnComment(element, comment)) {
      return toRange(comment, ROW_OPEN, ROW_CLOSE);
    }
    if (isMarkerFor(data, SLOT_OPEN, id) && isOwnComment(element, comment)) {
      return toRange(comment, SLOT_OPEN, SLOT_CLOSE);
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

export function findContextScopeId(node: Node, boundary?: Node): string | null {
  let current: Node | null = node;
  while (current !== null && current !== boundary) {
    const parent: ParentNode | null = current.parentNode;
    if (parent === null) {
      return null;
    }

    let depth = 0;
    let sibling = fastPreviousSibling(current);
    while (sibling !== null) {
      if (sibling === boundary) {
        return null;
      }
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
