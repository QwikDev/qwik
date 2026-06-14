import { fastGetter } from '../../client/prototype-utils';

let _fastNextSibling: ((this: Node) => Node | null) | null = null;
export const fastNextSibling = (node: Node): Node | null => {
  if (!_fastNextSibling) {
    _fastNextSibling = fastGetter<typeof _fastNextSibling>(node, 'nextSibling')!;
  }
  return _fastNextSibling.call(node);
};

let _fastFirstChild: ((this: Node) => Node | null) | null = null;
export const fastFirstChild = (node: Node): Node | null => {
  if (!_fastFirstChild) {
    _fastFirstChild = fastGetter<typeof _fastFirstChild>(node, 'firstChild')!;
  }
  return _fastFirstChild.call(node);
};

let _fastGetAttribute: ((this: Element, name: string) => string | null) | null = null;
export const fastGetAttribute = (element: Element, key: string): string | null => {
  if (!_fastGetAttribute) {
    _fastGetAttribute = element.getAttribute;
  }
  return _fastGetAttribute.call(element, key);
};
