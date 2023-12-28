import { createDocument } from '@builder.io/qwik-dom';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { isJSXNode } from '../core/render/jsx/jsx-runtime';
import { getContainer, processVNodeData } from './client/api';
import type { VNode } from './client/types';
import type { Stringifiable } from './shared-types';
import { isStringifiable } from './shared-types';
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

    it('should handle multiple text nodes, and fragment', () => {
      const input = (
        <>
          {'Hello'} <b>{'world'}</b>!
        </>
      );
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    it('should handle more complex example', () => {
      const input = (
        <div>
          <span>A</span>
          <>Hello {'World'}!</>
          <span>
            <>B</>!
          </span>
          <>Greetings {'World'}!</>
        </div>
      );
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });
    it('should handle long strings', () => {
      const string = (length: number) => new Array(length).fill('.').join('');
      const input = (
        <div>
          {string(26 * 26 * 26)}
          {string(26 * 26)}
          {string(26)}
        </div>
      );
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
      } else {
        ssrContainer.openVNode();
      }
    },
    leave: (jsx) => {
      if (typeof jsx.type === 'string') {
        ssrContainer.closeElement();
      } else {
        ssrContainer.closeVNode();
      }
    },
    text: (text) => ssrContainer.textNode(String(text)),
  });
  ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  return html;
}

function toDOM(html: string): HTMLElement {
  const document = createDocument();
  document.body.innerHTML = html;
  processVNodeData(document);
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
    text: (text: Stringifiable) => void;
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
    if (isStringifiable(child)) {
      apply.text(child);
    } else if (isJSXNode(child)) {
      walkJSX(child, apply);
    } else {
      throw new Error('Unkown type');
    }
  }
}
