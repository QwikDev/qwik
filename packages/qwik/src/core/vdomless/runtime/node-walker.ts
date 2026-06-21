import { ELEMENT_ID } from '../../shared/utils/markers';
import { fastFirstChild, fastNextSibling } from './fast-getters';

const ELEMENT_ID_SELECTOR = ELEMENT_ID.replace(':', '\\:');
const CONTEXT_OPEN = 'c=';
const CONTEXT_CLOSE = '/c';
const ELEMENT_NODE = 1;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const TEXT_NODE = 3;
const DOCUMENT_FRAGMENT_NODE = 11;
const RANGE_TEXT_MARKER = 't';
const BRANCH_OPEN = 'b=';
const BRANCH_CLOSE = '/b';

export type BranchMarkerRange = readonly [Comment, Comment];

export class NodeWalker {
  static #instance: NodeWalker;

  private constructor() {}

  public static get instance(): NodeWalker {
    if (!NodeWalker.#instance) {
      NodeWalker.#instance = new NodeWalker();
    }
    return NodeWalker.#instance;
  }

  findQwikElement(element: Element, elementId: string | number): Element | null {
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

  findElementText(parentNode: Node): Text | null {
    const text = fastFirstChild(parentNode);
    return text !== null && text.nodeType === TEXT_NODE ? (text as Text) : null;
  }

  findTextNode(parentNode: Node, markerIndex: number): Text | null {
    let index = 0;
    let currentNode = fastFirstChild(parentNode);
    while (currentNode) {
      if (
        currentNode.nodeType === COMMENT_NODE &&
        (currentNode as Comment).data === RANGE_TEXT_MARKER
      ) {
        if (index === markerIndex) {
          const text = fastNextSibling(currentNode);
          return text !== null && text.nodeType === TEXT_NODE ? (text as Text) : null;
        }
        index++;
      }
      currentNode = fastNextSibling(currentNode);
    }
    return null;
  }

  findBranchTextNode(range: BranchMarkerRange, markerIndex: number): Text | null {
    const [, end] = range;
    let index = 0;
    let currentNode = fastNextSibling(range[0]);
    while (currentNode && currentNode !== end) {
      if (
        currentNode.nodeType === COMMENT_NODE &&
        (currentNode as Comment).data === RANGE_TEXT_MARKER
      ) {
        if (index === markerIndex) {
          const text = fastNextSibling(currentNode);
          return text !== null && text !== end && text.nodeType === TEXT_NODE
            ? (text as Text)
            : null;
        }
        index++;
      }
      currentNode = fastNextSibling(currentNode);
    }
    return null;
  }

  findBranchRange(element: Element, rangeId: string | number): BranchMarkerRange | null {
    const start = this.findComment(element, BRANCH_OPEN + String(rangeId));
    if (start === null) {
      return null;
    }
    const end = this.findBranchEnd(start);
    return end === null ? null : [start, end];
  }

  replaceBranchRange(range: BranchMarkerRange, nodes: readonly Node[]): void {
    const [start, end] = range;
    const parent = this.getBranchRangeParent(start, end);
    const ownerDocument = start.ownerDocument;
    if (ownerDocument === null) {
      throw new Error('Branch range start marker must have an owner document');
    }

    let child = fastNextSibling(start);
    while (child !== null && child !== end) {
      const next = fastNextSibling(child);
      parent.removeChild(child);
      child = next;
    }
    if (child !== end) {
      throw new Error('Branch range end marker not found');
    }

    if (nodes.length === 0) {
      return;
    }

    if (nodes.length === 1) {
      parent.insertBefore(nodes[0], end);
      return;
    }

    const fragment = ownerDocument.createDocumentFragment();
    for (let i = 0; i < nodes.length; i++) {
      fragment.appendChild(nodes[i]);
    }
    parent.insertBefore(fragment, end);
  }

  private getBranchRangeParent(start: Comment, end: Comment): Node {
    const parent = start.parentNode as Node | null;
    if (parent === null || parent !== end.parentNode) {
      throw new Error('Branch range markers must share a parent');
    }

    return parent;
  }

  private findComment(node: Node, data: string): Comment | null {
    if (!canHaveChildNodes(node)) {
      return null;
    }
    let child = fastFirstChild(node);
    while (child !== null) {
      if (child.nodeType === COMMENT_NODE && (child as Comment).data === data) {
        return child as Comment;
      }
      const nested = this.findComment(child, data);
      if (nested !== null) {
        return nested;
      }
      child = fastNextSibling(child);
    }
    return null;
  }

  private findBranchEnd(start: Comment): Comment | null {
    let depth = 0;
    let sibling = fastNextSibling(start);
    while (sibling !== null) {
      if (sibling.nodeType === COMMENT_NODE) {
        const data = (sibling as Comment).data;
        if (data.startsWith(BRANCH_OPEN)) {
          depth++;
        } else if (data === BRANCH_CLOSE) {
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

  findContextScopeId(node: Node): string | null {
    let current: Node | null = node;
    while (current !== null) {
      const parent: ParentNode | null = current.parentNode;
      if (parent === null) {
        return null;
      }

      let depth = 0;
      let sibling = current.previousSibling;
      while (sibling !== null) {
        if (sibling.nodeType === COMMENT_NODE) {
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
        sibling = sibling.previousSibling;
      }

      current = parent;
    }
    return null;
  }
}

function canHaveChildNodes(node: Node): boolean {
  return (
    node.nodeType === ELEMENT_NODE ||
    node.nodeType === DOCUMENT_NODE ||
    node.nodeType === DOCUMENT_FRAGMENT_NODE
  );
}
