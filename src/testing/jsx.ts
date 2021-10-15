import type { h } from '@builder.io/qwik';
import { createGlobal } from './document';

// TODO(docs)
// TODO(tests)
export function toDOM(jsx: h.JSX.Element, parent?: HTMLElement): HTMLElement {
  const doc = parent ? parent.ownerDocument : createGlobal().document;
  let element = doc.createElement(jsx.type) as HTMLElement;
  for (const attrName in jsx.props) {
    if (attrName !== 'children') {
      element.setAttribute(attrName, jsx.props[attrName]);
    }
  }
  if (parent) {
    parent.appendChild(element);
    if (isTemplate(element)) {
      element = element.content as any;
    }
  }
  jsx.children.forEach((child: any) => {
    if (isJSXNode(child)) {
      toDOM(child, element);
    } else {
      element.appendChild(doc.createTextNode(String(child)));
    }
  });

  return element;
}

const isJSXNode = (n: any): boolean => {
  return n && typeof n === 'object' && n.constructor.name === 'JSXNodeImpl';
};

export function isTemplate(node: Node | null | undefined): node is HTMLTemplateElement {
  const tagName = (node && (node as Element).tagName) || '';
  return tagName.toUpperCase() == 'TEMPLATE';
}
