import { createDocument } from '@builder.io/qwik-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../vdom-diff.unit';
import type { ElementVNode, FragmentVNode, QDocument, TextVNode, VNode } from './types';
import {
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNode,
  vnode_insertBefore,
  vnode_newFragment,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_setProp,
  vnode_setText,
} from './vnode';
import { Fragment } from '@builder.io/qwik/jsx-runtime';

describe('vnode', () => {
  let parent: HTMLElement;
  let document: QDocument;
  let vParent: ElementVNode;
  beforeEach(() => {
    document = createDocument() as QDocument;
    document.qVNodeData = new WeakMap();
    parent = document.createElement('test');
    vParent = vnode_newUnMaterializedElement(null, parent);
  });
  afterEach(() => {
    parent = null!;
    document = null!;
    vParent = null!;
  });
  describe('processVNodeData', () => {
    it('should process simple text', () => {
      parent.innerHTML = `text`;
      expect(vParent).toMatchVDOM(<test>text</test>);
    });

    it('should process simple text with vData', () => {
      parent.innerHTML = `simple...`;
      document.qVNodeData.set(parent, 'G');
      expect(vParent).toMatchVDOM(<test>simple</test>);
    });

    it('should process text element text', () => {
      parent.innerHTML = `Hello <b>world</b>!`;
      document.qVNodeData.set(parent, 'G1B');
      expect(vParent).toMatchVDOM(
        <test>
          Hello <b>world</b>!
        </test>
      );
    });

    it('should process missing text node', () => {
      parent.innerHTML = `<b></b>`;
      document.qVNodeData.set(parent, 'A1{A}');
      expect(vParent).toMatchVDOM(
        <test>
          {''}
          <b></b>
          <>{''}</>
        </test>
      );
    });

    it('should process fragment text element text', () => {
      parent.innerHTML = `Hello <b>world</b>!`;
      document.qVNodeData.set(parent, 'F{B1B}');
      expect(vParent).toMatchVDOM(
        <test>
          Hello
          <>
            {' '}
            <b>world</b>!
          </>
        </test>
      );
    });

    it('should process many fragments', () => {
      parent.innerHTML = `<span>A</span>Hello World!<span></span>Greetings World!`;
      document.qVNodeData.set(parent, '1{GFB}1{KFB}');
      expect(vParent).toMatchVDOM(
        <test>
          <span>A</span>
          <>Hello {'World'}!</>
          <span></span>
          <>Greetings {'World'}!</>
        </test>
      );
    });

    it('should not consume trailing nodes after fragment', () => {
      parent.innerHTML = '<button>Count: 123!</button><script></script>';
      document.qVNodeData.set(parent, '{1}');
      document.qVNodeData.set(parent.firstChild as Element, 'HDB');
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <button>Count: {'123'}!</button>
          </>
          {/* <script></script> */}
        </test>
      );
    });
  });
  describe('text node inflation', () => {
    it('should inflate text node on write', () => {
      parent.innerHTML = `<b></b>`;
      document.qVNodeData.set(parent, 'A1{A}');
      expect(vParent).toMatchVDOM(
        <test>
          {''}
          <b></b>
          <>{''}</>
        </test>
      );
      const firstText = vnode_getFirstChild(vParent) as TextVNode;
      const fragment = vnode_getNextSibling(vnode_getNextSibling(firstText)!)! as FragmentVNode;
      const fragmentText = vnode_getFirstChild(fragment)! as TextVNode;
      vnode_setText(fragmentText, 'Fragment Text');
      vnode_setText(firstText, 'First Text');
      expect(parent.innerHTML).toEqual(`First Text<b></b>Fragment Text`);
    });
    it('should inflate text nodes on write', () => {
      parent.innerHTML = `Hello World!`;
      document.qVNodeData.set(parent, 'FBFB');
      expect(vParent).toMatchVDOM(
        <test>
          {'Hello'} {'World'}!
        </test>
      );
      const text1 = vnode_getFirstChild(vParent) as TextVNode;
      const text2 = vnode_getNextSibling(text1) as TextVNode;
      const text3 = vnode_getNextSibling(text2) as TextVNode;
      const text4 = vnode_getNextSibling(text3) as TextVNode;
      vnode_setText(text1, 'Salutation');
      vnode_setText(text3, 'Name');
      vnode_setText(text4, '.');
      expect(parent.innerHTML).toEqual(`Salutation Name.`);
    });
  });
  describe('fragment', () => {
    it('should create empty Fragment', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, '{}');
      expect(vParent).toMatchVDOM(
        <test>
          <></>
        </test>
      );
    });
    it('should create empty Fragment before element', () => {
      parent.innerHTML = `<b></b>`;
      document.qVNodeData.set(parent, '{}');
      expect(vParent).toMatchVDOM(
        <test>
          <></>
        </test>
      );
    });
    it('should place attributes on Fragment', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, '{=:id_?:sref_@:key_}');
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': ':id_', 'q:sref': ':sref_', 'q:key': ':key_' } as any)} />
        </test>
      );
    });
  });
  describe('manipulation', () => {
    it.only('should create empty Fragment before element', () => {
      const fragment1 = vnode_newFragment(vParent);
      const fragment2 = vnode_newFragment(vParent);
      const fragment3 = vnode_newFragment(fragment1);
      vnode_setProp(fragment1, 'q:id', '1');
      vnode_setProp(fragment2, 'q:id', '2');
      vnode_setProp(fragment3, 'q:id', '3');
      const textA = vnode_newText(fragment1, document.createTextNode('1A'), '1A');
      const textB = vnode_newText(fragment2, document.createTextNode('2B'), '2B');
      const textC = vnode_newText(fragment3, document.createTextNode('3C'), '3C');
      const textD = vnode_newText(vParent, document.createTextNode('D'), 'D');
      const textE = vnode_newText(vParent, document.createTextNode('E'), 'E');
      const textF = vnode_newText(vParent, document.createTextNode('F'), 'F');

      vnode_insertBefore(vParent, null, fragment2);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(vParent, fragment2, fragment1);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)} />
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(fragment1, null, fragment3);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(fragment1, fragment3, textA);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      expect(parent.innerHTML).toBe('1A');

      vnode_insertBefore(fragment2, null, textB);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>
        </test>
      );
      expect(parent.innerHTML).toBe('1A2B');

      vnode_insertBefore(fragment3, null, textC);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>
        </test>
      );
      expect(parent.innerHTML).toBe('1A3C2B');

      vnode_insertBefore(vParent, null, textD);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>D
        </test>
      );
      expect(parent.innerHTML).toBe('1A3C2BD');

      vnode_insertBefore(vParent, fragment1, textE);
      expect(vParent).toMatchVDOM(
        <test>
          E
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>D
        </test>
      );
      expect(parent.innerHTML).toBe('E1A3C2BD');

      vnode_insertBefore(vParent, fragment3, textF);
      expect(vParent).toMatchVDOM(
        <test>
          E
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            {'F'}
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>D
        </test>
      );
      expect(parent.innerHTML).toBe('E1AF3C2BD');
    });
  });
}); 