import { createDocument } from '@builder.io/qwik-dom';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { isJSXNode } from '../core/render/jsx/jsx-runtime';
import { getContainer } from './client/api';
import type { VNode } from './client/types';
import type { Stringifyable } from './shared-types';
import { isStringifyable } from './shared-types';
import { ssrCreateContainer, toSsrAttrs } from './ssr/api';
import './vdom-diff.unit';
import { vnode_getFirstChild } from './client/vnode';

describe('serializer v2', () => {
  describe('basic use cases', () => {
    it('should do basic serialize/deserialize', () => {
      const input = <span>test</span>;
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });
  });
});

function toHTML(jsx: JSXNode): string {
  const ssrContainer = ssrCreateContainer();
  ssrContainer.openContainer();
  walkJSX(jsx, {
    enter: (jsx) => {
      if (typeof jsx.type === 'string') {
        ssrContainer.openElement(jsx.type, toSsrAttrs(jsx.props as any));
      }
    },
    leave: (jsx) => {
      if (typeof jsx.type === 'string') {
        ssrContainer.closeElement();
      }
    },
    text: (text) => ssrContainer.text(String(text)),
  });
  ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  return html;
}

function toDOM(html: string): HTMLElement {
  const document = createDocument();
  document.body.innerHTML = html;
  return document.body.firstElementChild! as HTMLElement;
}

function toVDOM(containerElement: HTMLElement): VNode {
  console.log(containerElement.outerHTML);
  const container = getContainer(containerElement);
  const vNode = vnode_getFirstChild(container.rootVNode)!;
  return vNode;
}

function walkJSX(
  jsx: JSXNode,
  apply: {
    enter: (jsx: JSXNode) => void;
    leave: (jsx: JSXNode) => void;
    text: (text: Stringifyable) => void;
  }
) {
  apply.enter(jsx);
  if (Array.isArray(jsx.children)) {
    for (let child of jsx.children) {
      processChild(child);
    }
  } else {
    processChild(jsx.children);
  }
  apply.leave(jsx);

  function processChild(child: any) {
    if (isStringifyable(child)) {
      apply.text(child);
    } else if (isJSXNode(child)) {
      walkJSX(child, apply);
    } else {
      throw new Error('Unkown type');
    }
  }
}
