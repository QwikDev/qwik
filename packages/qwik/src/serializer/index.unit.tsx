import { createDocument } from '@builder.io/qwik-dom';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { isJSXNode } from '../core/render/jsx/jsx-runtime';
import { getContainer, processVNodeData } from './client/api';
import type { Container, VNode } from './client/types';
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

  describe('attributes', () => {
    it('should serialize attributes', () => {
      const input = <span id="test" class="test" />;
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });
  });

  describe('object serialization', () => {
    it('should serialize object', () => {
      const container = withContainer((ssrContainer) => {
        const obj = { age: 1, child: { b: 'child' } };
        expect(ssrContainer.getObjectId(obj)).toBe(0);
        expect(ssrContainer.getObjectId(obj.child)).toBe(1);
      });
      const obj = container.getObjectById(0);
      expect(obj).toEqual({ age: 1, child: { b: 'child' } });
      expect(container.getObjectById(1)).toBe(obj.child);
    });

    it('should serialize non-standard objects', () => {
      const container = withContainer((ssrContainer) => {
        const obj = { null: null, undefined: undefined };
        expect(ssrContainer.getObjectId(null)).toBe(0);
        expect(ssrContainer.getObjectId(undefined)).toBe(1);
        expect(ssrContainer.getObjectId(obj)).toBe(2);
        expect(
          ssrContainer.getObjectId([null, undefined, obj, { null: null, undefined: undefined }])
        ).toBe(3);
      });
      const obj = container.getObjectById(2);
      expect(container.getObjectById(0)).toEqual(null);
      expect(container.getObjectById(1)).toBe(undefined);
      expect(obj).toEqual({ null: null, undefined: undefined });
      expect(container.getObjectById(3)).toEqual([
        null,
        undefined,
        obj,
        { null: null, undefined: undefined },
      ]);
    });

    it('should de-dup long strings', () => {
      const str = new Array(100).fill('a').join('');
      const container = withContainer((ssrContainer) => {
        expect(ssrContainer.getObjectId(str)).toBe(0);
        expect(ssrContainer.getObjectId({ a: str, b: str })).toBe(1);
      });
      const idx = container.element.innerHTML.indexOf(str);
      expect(idx).toBeGreaterThan(0);
      const idx2 = container.element.innerHTML.indexOf(str, idx + 1);
      expect(idx2).toBe(-1);
      expect(container.getObjectById(0)).toEqual(str);
      expect(container.getObjectById(1)).toEqual({ a: str, b: str });
    });

    describe('QRLSerializer, ////////////// \u0002', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('TaskSerializer, ///////////// \u0003', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('ResourceSerializer, ///////// \u0004', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('URLSerializer, ////////////// \u0005', () => {
      it.only('should serialize and deserialize', () => {
        expect(
          withContainer((ssr) => {
            ssr.getObjectId(new URL('http://server/path#hash'));
          }).getObjectById(0)
        ).toEqual(new URL('http://server/path#hash'));
      });
    });
    describe('DateSerializer, ///////////// \u0006', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('RegexSerializer, //////////// \u0007', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('ErrorSerializer, //////////// \u000E', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('DocumentSerializer, ///////// \u000F', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('ComponentSerializer, //////// \u0010', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('DerivedSignalSerializer, //// \u0011', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('SignalSerializer, /////////// \u0012', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('SignalWrapperSerializer, //// \u0013', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('NoFiniteNumberSerializer, /// \u0014', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('URLSearchParamsSerializer, // \u0015', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('FormDataSerializer, ///////// \u0016', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('JSXNodeSerializer, ////////// \u0017', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('BigIntSerializer, /////////// \u0018', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('SetSerializer, ////////////// \u0019', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('MapSerializer, ////////////// \u001a', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });
    describe('StringSerializer, /////////// \u001b', () => {
      it.todo('should serialize and deserialize', () => {
        ///
      });
    });

    describe('');
  });
});

function withContainer(ssrFn: (ssrContainer: any) => void): Container {
  const ssrContainer = ssrCreateContainer();
  ssrContainer.openContainer();
  ssrFn(ssrContainer);
  ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  console.log(html);
  const container = getContainer(toDOM(html));
  return container;
}


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
    for (const child of jsx.children) {
      processChild(child);
    }
  } else if (jsx.children) {
    processChild(jsx.children);
  }
  apply.leave(jsx);

  function processChild(child: any) {
    if (isStringifiable(child)) {
      apply.text(child);
    } else if (isJSXNode(child)) {
      walkJSX(child, apply);
    } else {
      throw new Error('Unknown type: ' + child);
    }
  }
}
