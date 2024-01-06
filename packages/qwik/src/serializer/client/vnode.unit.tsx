import { createDocument } from '@builder.io/qwik-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../vdom-diff.unit';
import type { FragmentVNode, QDocument, TextVNode, VNode } from './types';
import {
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNodeTypeName,
  vnode_newElement,
  vnode_setText,
} from './vnode';
import { Fragment } from '@builder.io/qwik/jsx-runtime';

describe('vnode', () => {
  let parent: HTMLElement;
  let document: QDocument;
  let vParent: VNode;
  beforeEach(() => {
    document = createDocument() as QDocument;
    document.qVNodeData = new WeakMap();
    parent = document.createElement('test');
    vParent = vnode_newElement(null, parent);
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
}); 