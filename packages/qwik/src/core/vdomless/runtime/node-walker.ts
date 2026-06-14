import { ELEMENT_ID } from '../../shared/utils/markers';
import { fastFirstChild, fastNextSibling } from './fast-getters';

const ELEMENT_ID_SELECTOR = ELEMENT_ID.replace(':', '\\:');
const CONTEXT_OPEN = 'c=';
const CONTEXT_CLOSE = '/c';
const COMMENT_NODE = 8;
const TEXT_NODE = 3;
const RANGE_TEXT_MARKER = 't';

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
    return element.querySelector(`[${ELEMENT_ID_SELECTOR}="${stringId}"]`);
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
