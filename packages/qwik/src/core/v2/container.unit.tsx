import { createDocument } from '@builder.io/qwik-dom';
import { $ } from '../qrl/qrl.public';
import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { describe, expect, it } from 'vitest';
import { Fragment, JSXNodeImpl, isJSXNode } from '../render/jsx/jsx-runtime';
import { getDomContainer, processVNodeData } from './client/dom-container';
import type { ClientContainer, VNode } from './client/types';
import type { Stringifiable } from './shared-types';
import { isStringifiable } from './shared-types';
import { ssrCreateContainer } from './ssr/ssr-container';
import './vdom-diff.unit';
import { vnode_getFirstChild, vnode_getProp, vnode_getText } from './client/vnode';
import { isDeserializerProxy } from './shared-serialization';
import { component$ } from '../component/component.public';
import { inlinedQrl, qrl } from '../qrl/qrl';
import type { QRLInternal } from '../qrl/qrl-class';
import { SERIALIZABLE_STATE } from '../container/serializers';
import { SsrNode, type SSRContainer } from './ssr/types';
import { Slot } from '../render/jsx/slot.public';
import { toSsrAttrs } from './ssr/ssr-render';

describe('serializer v2', () => {
  describe('rendering', () => {
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

    it('should render blog post example', () => {
      const state = { value: 123 };
      const input = (
        <main>
          <>
            <>
              Count: {state.value}!<button>+1</button>
            </>
          </>
        </main>
      );
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    it('should handle more complex example', () => {
      const input = (
        <div>
          <span>A</span>
          <>Hello {'World'}!</>
          <>
            <span>
              <>B</>!
            </span>
            <>Greetings {'World'}!</>
          </>
        </div>
      );
      const output = toVDOM(toDOM(toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    it('should handle adjacent qwik/vnode data', () => {
      const input = (
        <div>
          <span>A{'B'}</span>
          <span>C{'D'}</span>
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

    describe('node references', () => {
      it('should retrieve element', () => {
        const clientContainer = withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'myId']);
          const node = ssr.getLastNode();
          ssr.addRoot({ someProp: node });
          ssr.textNode('Hello');
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnodeSpan = clientContainer.getObjectById(0).someProp;
        expect(vnode_getProp(vnodeSpan, 'id')).toBe('myId');
      });
      it('should retrieve text node', () => {
        const clientContainer = withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'div']);
          ssr.textNode('Greetings');
          ssr.textNode(' ');
          ssr.textNode('World');
          const node = ssr.getLastNode();
          expect(node.id).toBe('2C');
          ssr.textNode('!');
          ssr.addRoot({ someProp: node });
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnode = clientContainer.getObjectById(0).someProp;
        expect(vnode_getText(vnode)).toBe('World');
      });
      it('should retrieve text node in Fragments', () => {
        const clientContainer = withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'div']); // 2
          ssr.textNode('Greetings'); // 2A
          ssr.textNode(' '); // 2B
          ssr.openFragment([]); // 2C
          ssr.textNode('World'); // 2CA
          const node = ssr.getLastNode();
          expect(node.id).toBe('2CA');
          ssr.textNode('!');
          ssr.addRoot({ someProp: node });
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeFragment();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnode = clientContainer.getObjectById(0).someProp;
        expect(vnode_getText(vnode)).toBe('World');
      });
      it.todo('should attach props to Fragment');
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
        expect(ssrContainer.addRoot(obj)).toBe(0);
        expect(ssrContainer.addRoot(obj.child)).toBe(1);
      });
      const obj = container.getObjectById(0);
      expect(obj).toEqual({ age: 1, child: { b: 'child' } });
      expect(container.getObjectById(1)).toBe(obj.child);
    });

    it('should escape string <>', () => {
      const container = withContainer((ssrContainer) => {
        ssrContainer.addRoot({ '<scrip></script>': '"<scrip></script>"', '<': '<script>' });
      });
      expect(container.getObjectById(0)).toEqual({
        '<scrip></script>': '"<scrip></script>"',
        '<': '<script>',
      });
    });

    it('should serialize non-standard objects', () => {
      const container = withContainer((ssrContainer) => {
        const obj = { null: null, undefined: undefined };
        expect(ssrContainer.addRoot(null)).toBe(0);
        expect(ssrContainer.addRoot(undefined)).toBe(1);
        expect(ssrContainer.addRoot(obj)).toBe(2);
        expect(
          ssrContainer.addRoot([null, undefined, obj, { null: null, undefined: undefined }])
        ).toBe(3);
      });
      const obj = container.getObjectById(2);
      expect(isDeserializerProxy(obj)).toBe(true);
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
        expect(ssrContainer.addRoot(str)).toBe(0);
        expect(ssrContainer.addRoot({ a: str, b: str })).toBe(1);
      });
      const idx = container.element.innerHTML.indexOf(str);
      expect(idx).toBeGreaterThan(0);
      const idx2 = container.element.innerHTML.indexOf(str, idx + 1);
      expect(idx2).toBe(-1);
      expect(container.getObjectById(0)).toEqual(str);
      expect(container.getObjectById(1)).toEqual({ a: str, b: str });
    });

    describe('QRLSerializer, ////////////// \u0002', () => {
      it('should serialize and deserialize', () => {
        const testFn = () => 'test';
        const obj: QRLInternal[] = [
          $(testFn) as QRLInternal,
          qrl('chunk.js', 's_123', ['Hello', 'World']) as QRLInternal,
          inlinedQrl(testFn, 's_inline') as QRLInternal,
        ];
        const [qrl0, qrl1, qrl2] = withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0);
        expect(qrl0.$hash$).toEqual(obj[0].$hash$);
        expect(qrl0.$captureRef$).toEqual(obj[0].$captureRef$);
        expect(qrl0._devOnlySymbolRef).toEqual((obj[0] as any)._devOnlySymbolRef);
        expect(qrl1.$hash$).toEqual(obj[1].$hash$);
        expect(qrl1.$captureRef$).toEqual(obj[1].$captureRef$);
        expect(qrl1._devOnlySymbolRef).toEqual((obj[1] as any)._devOnlySymbolRef);
        expect(qrl2.$hash$).toEqual(obj[2].$hash$);
        expect(qrl2.$captureRef$).toEqual(obj[2].$captureRef$);
        expect(qrl2._devOnlySymbolRef).toEqual((obj[2] as any)._devOnlySymbolRef);
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
      it('should serialize and deserialize', () => {
        const obj = new URL('http://server/path#hash');
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('DateSerializer, ///////////// \u0006', () => {
      it('should serialize and deserialize', () => {
        const obj = new Date();
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('RegexSerializer, //////////// \u0007', () => {
      it('should serialize and deserialize', () => {
        const obj = /abc/gim;
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('ErrorSerializer, //////////// \u000E', () => {
      it('should serialize and deserialize', () => {
        const obj = Object.assign(new Error('MyError'), { extra: 'property' });
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('DocumentSerializer, ///////// \u000F', () => {
      it('should serialize and deserialize', () => {
        const obj = new SsrNode(SsrNode.DOCUMENT_NODE, '', []);
        const container = withContainer((ssr) => ssr.addRoot(obj));
        expect(container.getObjectById(0)).toEqual(container.element.ownerDocument);
      });
    });
    describe('ComponentSerializer, //////// \u0010', () => {
      it('should serialize and deserialize', () => {
        const obj = component$(() => <div />);
        const container = withContainer((ssr) => ssr.addRoot(obj));
        const [srcQrl] = (obj as any)[SERIALIZABLE_STATE];
        const [dstQrl] = container.getObjectById(0)[SERIALIZABLE_STATE];
        expect(dstQrl.$hash$).toEqual(srcQrl.$hash$);
        expect(dstQrl.$captureRef$).toEqual(srcQrl.$captureRef$);
        expect(dstQrl._devOnlySymbolRef).toEqual((srcQrl as any)._devOnlySymbolRef);
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
    describe('NaN, //////////////////////// \u0014', () => {
      it('should serialize and deserialize', () => {
        const obj = Number.NaN;
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('URLSearchParamsSerializer, // \u0015', () => {
      it('should serialize and deserialize', () => {
        const obj = new URLSearchParams('a=1&b=2');
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('FormDataSerializer, ///////// \u0016', () => {
      it('should serialize and deserialize', () => {
        const obj = new FormData();
        obj.append('someKey', 'someValue');
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('JSXNodeSerializer, ////////// \u0017', () => {
      it('should serialize and deserialize', () => {
        const obj = new JSXNodeImpl(
          Fragment,
          {},
          {},
          ['Hello World ', new JSXNodeImpl(Slot, {}, {}, [], 1)],
          0
        );
        // <>
        //   Hello World <Slot />
        // </>

        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toMatchObject(obj);
      });
    });
    describe('BigIntSerializer, /////////// \u0018', () => {
      it('should serialize and deserialize', () => {
        const obj = BigInt('12345678901234567890');
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
    describe('SetSerializer, ////////////// \u0019', () => {
      it('should serialize and deserialize', () => {
        const obj = new Set(['a', 'b', 'c']);
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
      it('should dedup internal state', () => {
        const a = { a: 'A' };
        const b = { b: 'B', a: a };
        const c = { c: 'C', a: a, b: b };
        const obj = new Set([a, b, c]);
        const value: Set<any> = withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0);
        expect(value).toEqual(obj);
        const [valueA, valueB, valueC] = Array.from(value.values());
        expect(valueB.a).toBe(valueA);
        expect(valueC.a).toBe(valueA);
        expect(valueC.b).toBe(valueB);
      });
    });
    describe('MapSerializer, ////////////// \u001a', () => {
      it('should serialize and deserialize', () => {
        const obj = new Map([
          ['a', 1],
          ['b', 3],
          ['c', 4],
        ]);
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
      it('should dedup internal state', () => {
        const a = { a: 'A' };
        const b = { b: 'B', a: a };
        const c = { c: 'C', a: a, b: b };
        const obj = new Map<string, any>([
          ['a', a],
          ['b', b],
          ['c', c],
        ]);
        const value: Map<string, any> = withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0);
        expect(value).toEqual(obj);
        const [valueA, valueB, valueC] = Array.from(value.values());
        expect(valueB.a).toBe(valueA);
        expect(valueC.a).toBe(valueA);
        expect(valueC.b).toBe(valueB);
      });
    });
    describe('StringSerializer, /////////// \u001b', () => {
      it('should serialize and deserialize', () => {
        const obj = '\u0010anything';
        expect(withContainer((ssr) => ssr.addRoot(obj)).getObjectById(0)).toEqual(obj);
      });
    });
  });

  describe('events', () => {
    it.todo('should serialize events');
  });

  describe('element nesting rules', () => {
    it('should throw when tags not lowercase', () => {
      expect(() => withContainer((ssr) => {}, { containerTag: 'HTML' })).toThrowError(
        "SsrError(tag): Tag 'HTML' must be lower case, because HTML is case insensitive."
      );
    });
    it('should throw when incorrectly nested elements', () => {
      expect(() =>
        withContainer(
          (ssr) => {
            ssr.openElement('body', []);
            ssr.openElement('p', []);
            ssr.openFragment([]);
            ssr.openElement('b', []);
            ssr.openElement('div', []);
          },
          { containerTag: 'html' }
        )
      ).toThrowError(
        [
          `SsrError(tag): HTML rules do not allow '<div>' at this location.`,
          `  (The HTML parser will try to recover by auto-closing or inserting additional tags which will confuse Qwik when it resumes.)`,
          `  Offending tag: <div>`,
          `  Existing tag context:`,
          `    <html> [html content] -> <head>, <body>`,
          `     <body> [body content] -> all tags allowed here`,
          `      <p> [phrasing content] -> <a>, <b>, <img>, <input> ... (no <div>, <p> ...)`,
          `       <b>`,
          `        <div> <= is not allowed as a child of phrasing content.`,
        ].join('\n')
      );
    });
    it('should throw when adding content to empty elements', () => {
      expect(() =>
        withContainer((ssr) => {
          ssr.openElement('img', []);
          ssr.openFragment([]);
          ssr.openElement('div', []);
        })
      ).toThrowError(
        [
          `SsrError(tag): HTML rules do not allow '<div>' at this location.`,
          `  (The HTML parser will try to recover by auto-closing or inserting additional tags which will confuse Qwik when it resumes.)`,
          `  Offending tag: <div>`,
          `  Existing tag context:`,
          `    <div> [any content]`,
          `     <img> [no-content element]`,
          `      <div> <= is not allowed as a child of no-content element.`,
        ].join('\n')
      );
    });
  });
});

function withContainer(
  ssrFn: (ssrContainer: SSRContainer) => void,
  opts: { containerTag?: string } = {}
): ClientContainer {
  const ssrContainer = ssrCreateContainer({
    tagName: opts.containerTag || 'div',
  });
  ssrContainer.openContainer();
  ssrFn(ssrContainer);
  ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  // console.log(html);
  const container = getDomContainer(toDOM(html));
  // console.log(JSON.stringify((container as any).rawStateData, null, 2));
  return container;
}

function toHTML(jsx: JSXNode): string {
  const ssrContainer = ssrCreateContainer({ tagName: 'div' });
  ssrContainer.openContainer();
  walkJSX(jsx, {
    enter: (jsx) => {
      if (typeof jsx.type === 'string') {
        ssrContainer.openElement(
          jsx.type,
          toSsrAttrs(jsx.props as any, ssrContainer.serializationCtx)
        );
      } else {
        ssrContainer.openFragment([]);
      }
    },
    leave: (jsx) => {
      if (typeof jsx.type === 'string') {
        ssrContainer.closeElement();
      } else {
        ssrContainer.closeFragment();
      }
    },
    text: (text) => ssrContainer.textNode(String(text)),
  });
  ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  // console.log(html);
  return html;
}

function toDOM(html: string): HTMLElement {
  const document = createDocument();
  document.body.innerHTML = html;
  return document.body.firstElementChild! as HTMLElement;
}

function toVDOM(containerElement: HTMLElement): VNode {
  const container = getDomContainer(containerElement);
  const vNode = vnode_getFirstChild(container.rootVNode)!;
  return vNode;
}

export function walkJSX(
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
