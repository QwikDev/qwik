import { Fragment, type JSXNode } from '@builder.io/qwik/jsx-runtime';
import { expect, describe, it } from 'vitest';
import type { ElementVNode, TextVNode, VNode } from './client/types';
import {
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getProp,
  vnode_getPropKeys,
  vnode_getElementName,
  vnode_getText,
  vnode_isElementVNode,
  vnode_isTextVNode,
} from './client/vnode';

describe('vdom-diff.unit', () => {
  it('empty placeholder test to suppress warning', () => {});
});

interface CustomMatchers<R = unknown> {
  toMatchVDOM(expectedJSX: JSXNode): R;
}

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

expect.extend({
  toMatchVDOM(this: { isNot: boolean }, received: VNode, expected: JSXNode) {
    const { isNot } = this;
    const diffs = diffJsxVNode(received, expected);
    return {
      pass: isNot ? diffs.length !== 0 : diffs.length === 0,
      message: () => diffs.join('\n'),
    };
  },
});

function diffJsxVNode(received: VNode, expected: JSXNode | string, path: string[] = []): string[] {
  const diffs: string[] = [];
  if (typeof expected === 'string') {
    const receivedText = vnode_getText(received as TextVNode);
    if (expected !== receivedText) {
      diffs.push(path.join(' > '));
      diffs.push('EXPECTED', JSON.stringify(expected));
      diffs.push('RECEIVED:', JSON.stringify(receivedText));
    }
  } else {
    path.push(tagToString(expected.type));
    const isTagSame =
      expected.type ==
      (vnode_isElementVNode(received) ? vnode_getElementName(received as ElementVNode) : Fragment);
    if (!isTagSame) {
      diffs.push(path.join(' > '));
    }
    const expectedProps = Object.keys(expected.props).sort();
    const receivedProps = vnode_getPropKeys(received).sort();
    const allProps = new Set([...expectedProps, ...receivedProps]);
    allProps.delete('children');
    allProps.forEach((prop) => {
      const expectedValue = expected.props[prop];
      const receivedValue = vnode_getProp(received, prop);
      if (expectedValue !== receivedValue) {
        diffs.push(`${path.join(' > ')}: [${prop}]`);
        diffs.push('  EXPECTED: ' + JSON.stringify(expectedValue));
        diffs.push('  RECEIVED: ' + JSON.stringify(receivedValue));
      }
    });
    const receivedChildren = getVNodeChildren(received);
    const expectedChildren = getJSXChildren(expected);
    if (receivedChildren.length === expectedChildren.length) {
      for (let i = 0; i < receivedChildren.length; i++) {
        const receivedChild = receivedChildren[i];
        const expectedChild = expectedChildren[i];
        diffs.push(...diffJsxVNode(receivedChild, expectedChild, path));
      }
    } else {
      diffs.push(
        `${path.join(' > ')} expecting ${expectedChildren.length} children but was ${
          receivedChildren.length
        }`
      );
      diffs.push('EXPECTED', jsxToHTML(expected, '  '));
      diffs.push('RECEIVED:', vnodeToHTML(received, '  '));
    }
    path.pop();
  }
  return diffs;
}
function getJSXChildren(jsx: JSXNode): JSXNode[] {
  const children = jsx.children;
  if (Array.isArray(children)) {
    return children as any;
  } else if (children != null) {
    return [children] as any;
  }
  return [];
}

function getVNodeChildren(vNode: VNode): VNode[] {
  const children: VNode[] = [];
  let child = vnode_getFirstChild(vNode);
  while (child) {
    if (!shouldSkip(child)) {
      children.push(child);
    }
    child = vnode_getNextSibling(child);
  }
  return children;
}
export function jsxToHTML(jsx: JSXNode, pad: string = ''): string {
  const html: string[] = [];
  if (jsx.type) {
    html.push(pad, '<', tagToString(jsx.type), '>\n');
    getJSXChildren(jsx).forEach((jsx) => {
      html.push(jsxToHTML(jsx, pad + '  '));
    });
    html.push(pad, '<', tagToString(jsx.type), '>\n');
  } else {
    html.push(pad, tagToString(jsx), '\n');
  }
  return html.join('');
}

export function vnodeToHTML(vNode: VNode | null, pad: string = ''): string {
  const html: string[] = [];
  while (vNode) {
    if (vnode_isElementVNode(vNode)) {
      const tag = vnode_getElementName(vNode);
      html.push(pad, '<', tagToString(tag), '>\n');
      html.push(vnodeToHTML(vnode_getFirstChild(vNode), pad + '  '));
      html.push(pad, '</', tagToString(tag), '>\n');
    } else if (vnode_isTextVNode(vNode)) {
      html.push(pad, vnode_getText(vNode), '\n');
    }
    while (shouldSkip((vNode = vnode_getNextSibling(vNode!)))) {
      // skip
    }
  }
  return html.join('');
}

function tagToString(tag: any): string {
  if (tag === Fragment) {
    return 'Fragment';
  }
  return String(tag);
}

function shouldSkip(vNode: VNode | null) {
  if (vnode_isElementVNode(vNode)) {
    const tag = vnode_getElementName(vNode);
    if (tag === 'script' && vnode_getProp(vNode, 'type') === 'qwik/vnode') {
      return true;
    }
  }
  return false;
}
