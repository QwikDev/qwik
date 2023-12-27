import type { JSXNode } from '@builder.io/qwik/jsx-runtime';

import { expect } from 'vitest';
import type { VNode } from './client/types';
import {
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getTag,
  vnode_getText,
} from './client/vnode';

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

function diffJsxVNode(received: VNode, expected: JSXNode, path: string[] = []): string[] {
  const diffs: string[] = [];
  path.push(String(expected.type));
  const isTagSame = expected.type == vnode_getTag(received);
  if (!isTagSame) {
    diffs.push(path.join('>'));
  }
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
      `${path.join('>')} expecting ${expectedChildren.length} children but was ${
        receivedChildren.length
      }`
    );
    diffs.push('EXPECTED', jsxToHTML(expected, '  '));
    diffs.push('RECEIVED:', vnodeToHTML(received, '  '));
  }
  path.pop();
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
    children.push(child);
    child = vnode_getNextSibling(vNode);
  }
  return children;
}
function jsxToHTML(jsx: JSXNode, pad: string = ''): string {
  const html: string[] = [];
  if (jsx.type) {
    html.push(pad, '<', String(jsx.type), '\n>');
    getJSXChildren(jsx).forEach((jsx) => {
      html.push(jsxToHTML(jsx, pad + '  '));
    });
    html.push(pad, '<', String(jsx.type), '\n>');
  } else {
    html.push(pad, String(jsx));
  }
  return html.join('');
}

function vnodeToHTML(vNode: VNode, pad: string = ''): string {
  const html: string[] = [];
  let tag = vnode_getTag(vNode);
  if (tag) {
    html.push(pad, '<', String(tag), '\n>');
    getVNodeChildren(vNode).forEach((vNode) => {
      html.push(vnodeToHTML(vNode, pad + '  '));
    });
    html.push(pad, '<', String(tag), '\n>');
  } else {
    html.push(pad, vnode_getText(vNode));
  }
  return html.join('');
}
