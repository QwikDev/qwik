import { fastGetter } from '../../client/prototype-utils';

let _fastNextSibling: ((this: Node) => Node | null) | null = null;
export const fastNextSibling = (node: Node): Node | null => {
  if (!_fastNextSibling) {
    _fastNextSibling = fastGetter<typeof _fastNextSibling>(node, 'nextSibling')!;
  }
  return _fastNextSibling.call(node) ?? null;
};

let _fastPreviousSibling: ((this: Node) => Node | null) | null = null;
export const fastPreviousSibling = (node: Node): Node | null => {
  if (!_fastPreviousSibling) {
    _fastPreviousSibling = fastGetter<typeof _fastPreviousSibling>(node, 'previousSibling')!;
  }
  return _fastPreviousSibling.call(node) ?? null;
};

let _fastFirstChild: ((this: Node) => Node | null) | null = null;
export const fastFirstChild = (node: Node): Node | null => {
  if (!_fastFirstChild) {
    _fastFirstChild = fastGetter<typeof _fastFirstChild>(node, 'firstChild')!;
  }
  return _fastFirstChild.call(node) ?? null;
};

let _fastLastChild: ((this: Node) => Node | null) | null = null;
export const fastLastChild = (node: Node): Node | null => {
  if (!_fastLastChild) {
    _fastLastChild = fastGetter<typeof _fastLastChild>(node, 'lastChild')!;
  }
  return _fastLastChild.call(node) ?? null;
};

let _fastGetAttribute: ((this: Element, name: string) => string | null) | null = null;
export const fastGetAttribute = (element: Element, key: string): string | null => {
  if (!_fastGetAttribute) {
    _fastGetAttribute = element.getAttribute;
  }
  return _fastGetAttribute.call(element, key);
};
