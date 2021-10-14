import type { h } from '@builder.io/qwik';
import { isJSXNode } from '../core/render/jsx/jsx-runtime';
import { isComment, isElement, isText } from '../core/util/element';
import { isTemplateElement } from '../core/util/types';

export function expectDOM(actual: Element, expected: h.JSX.Element, expectedErrors: string[] = []) {
  const diffs: string[] = [];
  expectMatchElement('', diffs, actual, expected);
  expect(diffs).toEqual(expectedErrors);
}

function expectMatchElement(
  path: string,
  diffs: string[],
  actual: Element,
  expected: h.JSX.Element
) {
  if (actual) {
    const actualTag = actual.tagName ? actual.tagName.toLowerCase() : '#text';
    path += actualTag;
    if (actualTag !== expected.type) {
      diffs.push(`${path}: expected '${toHTML(expected)}', was '${toHTML(actual)}'.`);
    }
    Object.keys(expected.props).forEach((key) => {
      if (key !== 'children') {
        const expectedValue = expected.props[key] as any;
        const actualValue = actual.getAttribute ? actual.getAttribute(key) : '';
        if (!(actualValue == expectedValue || (expectedValue === true && actualValue !== null))) {
          diffs.push(`${path}: expected '${toHTML(expected)}', was '${toHTML(actual)}'.`);
        }
      }
    });

    const actualChildNodes = isTemplateElement(actual)
      ? actual.content.childNodes
      : actual.childNodes;
    (expected.children || []).forEach((expectedChild, index) => {
      const actualChild = actualChildNodes[index];
      if (isJSXNode(expectedChild)) {
        expectMatchElement(
          path + `.[${index}]`,
          diffs,
          actualChild as HTMLElement,
          expectedChild as any
        );
      } else {
        // We are a text node.
        const text = actualChild?.textContent || '';
        if (!(expectedChild instanceof RegExp ? expectedChild.test(text) : expectedChild == text)) {
          diffs.push(
            `${path}: expected content "${expectedChild}", was "${
              (actualChild as HTMLElement)?.outerHTML || actualChild?.textContent
            }"`
          );
        }
      }
    });
    for (let i = expected.children.length; i < actualChildNodes.length; i++) {
      const childNode = actualChildNodes[i];
      diffs.push(`${path}[${i}]: extra node '${toHTML(childNode)}'`);
    }
  } else {
    diffs.push(`${path}: expected '${toHTML(expected)}', was no children`);
  }
}

function toAttrs(jsxNode: h.JSX.Element): string[] {
  const attrs: string[] = [];
  Object.keys(jsxNode.props || {}).forEach((key) => {
    if (key !== 'children') {
      attrs.push(key + '=' + JSON.stringify(jsxNode.props[key]));
    }
  });
  return attrs;
}

function toHTML(node: any) {
  if (isElement(node)) {
    const attrs: string[] = [];
    const attributes = node.attributes;
    for (let i = 0; i < attributes.length; i++) {
      attrs.push(`${attributes[i].name}="${attributes[i].value}"`);
    }
    return `<${node.tagName.toLowerCase()}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  } else if (isText(node)) {
    return node.textContent;
  } else if (isJSXNode(node)) {
    const attrs = toAttrs(node);
    return `<${node.type}${attrs.length ? ' ' + attrs.join(' ') : ''}>`;
  } else if (isComment(node)) {
    return `<!--${node.textContent}-->`;
  } else {
    throw new Error('Unexpected node type: ' + node);
  }
}
