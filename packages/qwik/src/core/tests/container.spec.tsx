import { walkJSX } from '@qwik.dev/core/testing';
import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ssrCreateContainer } from '../../server/ssr-container';
import { SsrNode } from '../../server/ssr-node';
import { createDocument } from '../../testing/document';
import { getDomContainer } from '../client/dom-container';
import type { ClientContainer } from '../client/types';
import { vnode_getFirstChild, vnode_getText } from '../client/vnode';
import { SERIALIZABLE_STATE, component$ } from '../shared/component.public';
import { Fragment, JSXNodeImpl, createPropsProxy } from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXOutput } from '../shared/jsx/types/jsx-node';
import { inlinedQrl, qrl } from '../shared/qrl/qrl';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { TypeIds } from '../shared/serdes/index';
import { hasClassAttr } from '../shared/utils/scoped-styles';
import { createComputed$, createSignal } from '../reactive-primitives/signal.public';
import { constPropsToSsrAttrs, varPropsToSsrAttrs } from '../ssr/ssr-render-jsx';
import { type SSRContainer } from '../ssr/ssr-types';
import { _qrlSync } from '../shared/qrl/qrl.public';
import { SignalFlags } from '../reactive-primitives/types';
import type { VNode } from '../client/vnode-impl';

describe('serializer v2', () => {
  describe('rendering', () => {
    it('should do basic serialize/deserialize', async () => {
      const input = <span>test</span>;
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    it('should handle multiple text nodes, and fragment', async () => {
      const input = (
        <>
          {'Hello'} <b>{'world'}</b>!
        </>
      );
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM('Hello ');
    });

    it('should render blog post example', async () => {
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
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(
        <main class="">
          Count: 123!
          <button class="">+1</button>
        </main>
      );
    });

    it('should handle more complex example', async () => {
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
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(
        <div class="">
          <span class="">A</span>
          Hello World!
          <span class="">B!</span>
          Greetings World!
        </div>
      );
    });

    it('should handle adjacent qwik/vnode data', async () => {
      const input = (
        <div>
          <span>A{'B'}</span>
          <span>C{'D'}</span>
        </div>
      );
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    it('should handle long strings', async () => {
      const string = (length: number) => new Array(length).fill('.').join('');
      const input = (
        <div>
          {string(26 * 26 * 26)}
          {string(26 * 26)}
          {string(26)}
        </div>
      );
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(input);
    });

    describe('node references', () => {
      // doesn't use the vnode so not serialized
      it('should retrieve element', async () => {
        const clientContainer = await withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'myId']);
          const node = ssr.getOrCreateLastNode();
          ssr.addRoot({ someProp: node });
          ssr.textNode('Hello');
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnodeSpan: VNode = await clientContainer.$getObjectById$(0).someProp;
        expect(vnodeSpan.getAttr('id')).toBe('myId');
      });
      it('should retrieve text node', async () => {
        const clientContainer = await withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'div']);
          ssr.textNode('Greetings');
          ssr.textNode(' ');
          ssr.textNode('World');
          const node = ssr.getOrCreateLastNode();
          expect(node.id).toBe('2C');
          ssr.textNode('!');
          ssr.addRoot({ someProp: node });
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnode = await clientContainer.$getObjectById$(0).someProp;
        expect(vnode_getText(vnode)).toBe('World');
      });
      it('should retrieve text node in Fragments', async () => {
        const clientContainer = await withContainer((ssr) => {
          ssr.openElement('div', ['id', 'parent']);
          ssr.textNode('Hello');
          ssr.openElement('span', ['id', 'div']); // 2
          ssr.textNode('Greetings'); // 2A
          ssr.textNode(' '); // 2B
          ssr.openFragment([]); // 2C
          ssr.textNode('World'); // 2CA
          const node = ssr.getOrCreateLastNode();
          expect(node.id).toBe('2CA');
          ssr.textNode('!');
          ssr.addRoot({ someProp: node });
          ssr.openElement('b', ['id', 'child']);
          ssr.closeElement();
          ssr.closeFragment();
          ssr.closeElement();
          ssr.closeElement();
        });
        const vnode = await clientContainer.$getObjectById$(0).someProp;
        expect(vnode_getText(vnode)).toBe('World');
      });
      it.todo('should attach props to Fragment');
    });
  });

  describe('attributes', () => {
    it('should serialize attributes', async () => {
      const input = <span id="test" class="test" />;
      const output = toVNode(toDOM(await toHTML(input)));
      expect(output).toMatchVDOM(input);
    });
  });

  describe('object serialization', () => {
    it('should serialize object', async () => {
      const container = await withContainer((ssrContainer) => {
        const obj = { age: 1, child: { b: 'child' } };
        expect(ssrContainer.addRoot(obj)).toBe(0);
        expect(ssrContainer.addRoot(obj.child)).toBe(1);
      });
      const obj = container.$getObjectById$(0);
      expect(obj).toEqual({ age: 1, child: { b: 'child' } });
      expect(container.$getObjectById$(1)).toBe(obj.child);
    });

    it('should escape string <>', async () => {
      const container = await withContainer((ssrContainer) => {
        ssrContainer.addRoot({ '</script>': '"<script></script>"', '<': '<script>' });
      });
      expect(container.$getObjectById$(0)).toEqual({
        '</script>': '"<script></script>"',
        '<': '<script>',
      });
    });

    it('should serialize non-standard objects', async () => {
      const container = await withContainer((ssrContainer) => {
        const obj = { null: null, undefined: undefined };
        expect(ssrContainer.addRoot(null)).toBe(0);
        expect(ssrContainer.addRoot(undefined)).toBe(1);
        expect(ssrContainer.addRoot(obj)).toBe(2);
        expect(
          ssrContainer.addRoot([null, undefined, obj, { null: null, undefined: undefined }])
        ).toBe(3);
      });
      const obj = container.$getObjectById$(2);
      expect(container.$getObjectById$(0)).toEqual(null);
      expect(container.$getObjectById$(1)).toBe(undefined);
      expect(obj).toEqual({ null: null, undefined: undefined });
      expect(container.$getObjectById$(3)).toEqual([
        null,
        undefined,
        obj,
        { null: null, undefined: undefined },
      ]);
    });

    it('should de-dup long strings', async () => {
      const str = new Array(100).fill('a').join('');
      const container = await withContainer((ssrContainer) => {
        expect(ssrContainer.addRoot(str)).toBe(0);
        expect(ssrContainer.addRoot({ a: str, b: str })).toBe(1);
      });
      const idx = container.element.innerHTML.indexOf(str);
      expect(idx).toBeGreaterThan(0);
      const idx2 = container.element.innerHTML.indexOf(str, idx + 1);
      expect(idx2).toBe(-1);
      expect(container.$getObjectById$(0)).toEqual(str);
      expect(container.$getObjectById$(1)).toEqual({ a: str, b: str });
    });

    describe('ReferenceSerializer, ///// ' + TypeIds.RootRef, () => {
      it('should serialize and deserialize', async () => {
        const obj1 = {};
        const obj2 = { obj1 };
        const c = await withContainer((ssr) => {
          ssr.addRoot(obj1);
          ssr.addRoot(obj2);
        });
        expect(c.$getObjectById$(1).obj1).toBe(c.$getObjectById$(0));
      });
    });

    describe('ConstantSerializer, ////// ' + TypeIds.Constant, async () => {
      it('should serialize and deserialize', async () => {
        const obj = [undefined, null, true, false, NaN, -Infinity, +Infinity, Slot, Fragment];
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('URLSerializer, /////////// ' + TypeIds.URL, () => {
      it('should serialize and deserialize', async () => {
        const obj = new URL('http://server/path#hash');
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('DateSerializer, ////////// ' + TypeIds.Date, () => {
      it('should serialize and deserialize', async () => {
        const obj = new Date();
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('RegexSerializer, ///////// ' + TypeIds.Regex, () => {
      it('should serialize and deserialize', async () => {
        const obj = /abc/gim;
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('VNodeSerializer, ///////// ' + TypeIds.VNode, () => {
      it.todo('should serialize and deserialize', async () => {
        ///
      });
    });

    describe('BigIntSerializer, //////// ' + TypeIds.BigInt, () => {
      it('should serialize and deserialize', async () => {
        const obj = BigInt('12345678901234567890');
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('URLSearchParamsSerializer, ' + TypeIds.URLSearchParams, () => {
      it('should serialize and deserialize', async () => {
        const obj = new URLSearchParams('a=1&b=2');
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('ErrorSerializer, ///////// ' + TypeIds.Error, () => {
      it('should serialize and deserialize', async () => {
        const date = new Date();
        const obj = Object.assign(new Error('MyError'), {
          extra: { foo: ['bar', { hi: true }], bar: date },
        });
        const result = (await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0);
        expect(result.message).toEqual(obj.message);
        expect(result.extra.foo).toEqual(['bar', { hi: true }]);
        expect(result.extra.bar).toEqual(date);
      });
    });

    describe('PromiseSerializer, /////// ' + TypeIds.Promise, () => {
      it('should serialize and deserialize', async () => {
        const obj1 = Promise.resolve('test');
        const obj2 = Promise.reject(new Error('test'));
        const result = (await withContainer((ssr) => ssr.addRoot([obj1, obj2]))).$getObjectById$(0);
        expect(result).toEqual([obj1, obj2]);
        expect(await result[0]).toBe('test');
        await expect(result[1]).rejects.toThrowError('test');
      });
    });

    describe('SetSerializer, /////////// ' + TypeIds.Set, () => {
      it('should serialize and deserialize', async () => {
        const obj = new Set(['a', 'b', 'c']);
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
      it('should dedup internal state', async () => {
        const a = { a: 'A' };
        const b = { b: 'B', a: a };
        const c = { c: 'C', a: a, b: b };
        const obj = new Set([a, b, c]);
        const value: Set<any> = (await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0);
        expect(value).toEqual(obj);
        const [valueA, valueB, valueC] = Array.from(value.values());
        expect(valueB.a).toBe(valueA);
        expect(valueC.a).toBe(valueA);
        expect(valueC.b).toBe(valueB);
      });
    });

    describe('MapSerializer, /////////// ' + TypeIds.Map, () => {
      it('should serialize and deserialize', async () => {
        const obj = new Map([
          ['a', 1],
          ['b', 3],
          ['c', 4],
        ]);
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
      it('should dedup internal state', async () => {
        const a = { a: 'A' };
        const b = { b: 'B', a: a };
        const c = { c: 'C', a: a, b: b };
        const obj = new Map<string, any>([
          ['a', a],
          ['b', b],
          ['c', c],
        ]);
        const value: Map<string, any> = (
          await withContainer((ssr) => ssr.addRoot(obj))
        ).$getObjectById$(0);
        expect(value).toEqual(obj);
        const [valueA, valueB, valueC] = Array.from(value.values());
        expect(valueB.a).toBe(valueA);
        expect(valueC.a).toBe(valueA);
        expect(valueC.b).toBe(valueB);
      });
    });
    describe('Uint8Serializer, ///////// ' + TypeIds.Uint8Array, () => {
      it('should serialize and deserialize', async () => {
        const obj = new Uint8Array([1, 2, 3, 4, 5, 0]);
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
      it('should handle large arrays', async () => {
        const obj = new Uint8Array(Math.floor(Math.random() * 65530 + 1));
        crypto.getRandomValues(obj);
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('QRLSerializer, /////////// ' + TypeIds.QRL, () => {
      it('should serialize and deserialize', async () => {
        const testFn = () => 'test';
        const obj: QRLInternal[] = [
          // $(testFn) as QRLInternal,
          qrl('chunk.js', 's_123', ['Hello', 'World']) as QRLInternal,
          qrl('chunk.js', 's_123', ['Hello', 'World']) as QRLInternal,
          inlinedQrl(testFn, 's_inline', ['Hello']) as QRLInternal,
          _qrlSync(() => 'hi', 'q=>"meep"') as unknown as QRLInternal,
        ];
        const container = await withContainer((ssr) => ssr.addRoot(obj));
        const [qrl0, qrl1, qrl2] = container.$getObjectById$(0);
        expect(qrl0.$hash$).toEqual(obj[0].$hash$);
        expect(qrl0.$captureRef$).toEqual(obj[0].$captureRef$);
        expect(qrl0._devOnlySymbolRef).toEqual((obj[0] as any)._devOnlySymbolRef);
        expect(qrl1.$hash$).toEqual(obj[1].$hash$);
        expect(qrl1.$captureRef$).toEqual(obj[1].$captureRef$);
        expect(qrl1._devOnlySymbolRef).toEqual((obj[1] as any)._devOnlySymbolRef);
        expect(qrl2.$hash$).toEqual(obj[2].$hash$);
        expect(qrl2.$captureRef$).toEqual(obj[2].$captureRef$);
        expect(qrl2._devOnlySymbolRef.toString()).toEqual(
          (obj[2] as any)._devOnlySymbolRef.toString()
        );
      });
    });

    describe('TaskSerializer, ////////// ' + TypeIds.Task, () => {
      it.todo('should serialize and deserialize', async () => {
        ///
      });
    });

    describe('ResourceSerializer, ////// ' + TypeIds.Resource, () => {
      it.todo('should serialize and deserialize', async () => {
        ///
      });
    });

    describe('ComponentSerializer, ///// ' + TypeIds.Component, () => {
      it('should serialize and deserialize', async () => {
        const obj = component$(() => <div />);
        const container = await withContainer((ssr) => ssr.addRoot(obj));
        const [srcQrl] = (obj as any)[SERIALIZABLE_STATE];
        const [dstQrl] = container.$getObjectById$(0)[SERIALIZABLE_STATE];
        expect(dstQrl.$hash$).toEqual(srcQrl.$hash$);
        expect(dstQrl.$captureRef$).toEqual(
          srcQrl.$captureRef$.length ? srcQrl.$captureRef$ : null
        );
        expect(dstQrl._devOnlySymbolRef).toEqual((srcQrl as any)._devOnlySymbolRef);
      });
    });

    describe('SignalSerializer, //////// ' + TypeIds.Signal, () => {
      it.todo('should serialize and deserialize', async () => {
        ///
      });
    });

    describe('WrappedSignalSerializer, / ' + TypeIds.WrappedSignal, () => {
      it.todo('should serialize and deserialize', async () => {
        ///
      });
    });

    describe('ComputedSignalSerializer,  ' + TypeIds.ComputedSignal, () => {
      it('should serialize and deserialize', async () => {
        const signal = createSignal('test');
        const computed = createComputed$(() => signal.value + '!');
        const container = await withContainer((ssr) => {
          ssr.addRoot(computed);
        });
        const got = container.$getObjectById$(0);
        expect(got.$untrackedValue$).toMatchInlineSnapshot(`Symbol(invalid)`);
        expect(!!(got.$flags$ & SignalFlags.INVALID)).toBe(true);
        expect(got.value).toBe('test!');
      });
    });

    describe('FormDataSerializer, ////// ' + TypeIds.FormData, () => {
      it('should serialize and deserialize', async () => {
        const obj = new FormData();
        obj.append('someKey', 'someValue');
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('JSXNodeSerializer, /////// ' + TypeIds.JSXNode, () => {
      it('should serialize and deserialize', async () => {
        const obj = (
          <>
            Hello World <Slot />
          </>
        ) as JSXNodeImpl<any>;
        const result = (await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(
          0
        ) as JSXNodeImpl<any>;
        // be explicit about the contents so we don't check internal details
        expect(result).toBeInstanceOf(JSXNodeImpl);
        expect(result.constProps).toEqual(obj.constProps);
        expect(result.varProps).toEqual(obj.varProps);
        expect(result.children).toHaveLength(2);
        expect((result.children as any)[0]!).toBe('Hello World ');
        expect((result.children as any)[1]!).toBeInstanceOf(JSXNodeImpl);
        expect((result.children as any)[1]!.type).toBe(Slot);
      });
    });

    describe('PropsProxySerializer, //// ' + TypeIds.PropsProxy, () => {
      it('should serialize and deserialize', async () => {
        const obj = createPropsProxy({ number: 1, text: 'abc' }, { n: 2, t: 'test' });
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
      it('should serialize and deserialize with null const props', async () => {
        const obj = createPropsProxy({ number: 1, text: 'abc' }, null);
        expect((await withContainer((ssr) => ssr.addRoot(obj))).$getObjectById$(0)).toEqual(obj);
      });
    });

    describe('DocumentSerializer, //////', () => {
      it('should serialize and deserialize', async () => {
        const obj = new SsrNode(null, '', -1, [], [] as any, null);
        const container = await withContainer((ssr) => ssr.addRoot(obj));
        expect(container.$getObjectById$(0)).toEqual(container.element.ownerDocument);
      });
    });
  });

  describe('events', () => {
    it.todo('should serialize events');
  });

  describe('element nesting rules', () => {
    it('should throw when incorrectly nested elements', async () => {
      const filePath = '/some/path/test-file.tsx';
      await expect(() =>
        withContainer(
          (ssr) => {
            ssr.openElement('body', [], null, filePath);
            ssr.openElement('p', [], null, filePath);
            ssr.openFragment([]);
            ssr.openElement('b', [], null, filePath);
            ssr.openElement('div', [], null, filePath);
          },
          { containerTag: 'html' }
        )
      ).rejects.toThrowError(
        [
          `SsrError(tag): Error found in file: ${filePath}`,
          `HTML rules do not allow '<div>' at this location.`,
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
    it('should throw when adding content to empty elements', async () => {
      const filePath = '/some/path/test-file.tsx';
      await expect(() =>
        withContainer((ssr) => {
          ssr.openElement('img', [], null, filePath);
          ssr.openFragment([]);
          ssr.openElement('div', [], null, filePath);
        })
      ).rejects.toThrowError(
        [
          `SsrError(tag): Error found in file: ${filePath}`,
          `HTML rules do not allow '<div>' at this location.`,
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

async function withContainer(
  ssrFn: (ssrContainer: SSRContainer) => void,
  opts: { containerTag?: string } = {}
): Promise<ClientContainer> {
  const ssrContainer: SSRContainer = ssrCreateContainer({
    tagName: opts.containerTag || 'div',
  });
  ssrContainer.openContainer();
  ssrFn(ssrContainer);
  await ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  // console.log(html);
  const container = getDomContainer(toDOM(html));
  // console.log(JSON.stringify((container as any).rawStateData, null, 2));
  return container;
}

async function toHTML(jsx: JSXOutput): Promise<string> {
  const ssrContainer = ssrCreateContainer({ tagName: 'div' });
  ssrContainer.openContainer();
  walkJSX(jsx, {
    enter: (jsx) => {
      if (typeof jsx.type === 'string') {
        const classAttributeExists =
          hasClassAttr(jsx.varProps) || (jsx.constProps && hasClassAttr(jsx.constProps));
        if (!classAttributeExists) {
          if (!jsx.constProps) {
            jsx.constProps = {};
          }
          jsx.constProps['class'] = '';
        }
        ssrContainer.openElement(
          jsx.type,
          varPropsToSsrAttrs(jsx.varProps as any, jsx.constProps, {
            serializationCtx: ssrContainer.serializationCtx,
            styleScopedId: null,
            key: jsx.key,
          }),
          constPropsToSsrAttrs(jsx.constProps as any, jsx.varProps, {
            serializationCtx: ssrContainer.serializationCtx,
            styleScopedId: null,
          })
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
  await ssrContainer.closeContainer();
  const html = ssrContainer.writer.toString();
  // console.log(html);
  return html;
}

function toDOM(html: string): HTMLElement {
  const document = createDocument();
  document.body.innerHTML = html;
  return document.body.firstElementChild! as HTMLElement;
}

function toVNode(containerElement: HTMLElement): VNode {
  const container = getDomContainer(containerElement);
  const vNode = vnode_getFirstChild(container.rootVNode)!;
  return vNode;
}
