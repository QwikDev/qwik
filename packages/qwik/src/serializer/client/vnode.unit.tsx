import { createDocument } from '@builder.io/qwik-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import '../vdom-diff.unit';
import type { QDocument, VNode } from './types';
import { vnode_newElement } from './vnode';
import { jsxToHTML, vnodeToHTML } from '../vdom-diff.unit';

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
      document.qVNodeData.set(parent!, 'G');
      expect(vParent).toMatchVDOM(<test>simple</test>);
    });

    it('should process text element text', () => {
      parent.innerHTML = `Hello <b>world</b>!`;
      document.qVNodeData.set(parent!, 'G1B');
      expect(vParent).toMatchVDOM(
        <test>
          Hello <b>world</b>!
        </test>
      );
    });

    it('should process missing text node', () => {
      parent.innerHTML = `<b></b>`;
      document.qVNodeData.set(parent!, 'A1{A}');
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
      document.qVNodeData.set(parent!, 'F{B1B}');
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
      document.qVNodeData.set(parent!, '1{GFB}1{KFB}');
      expect(vParent).toMatchVDOM(
        <test>
          <span>A</span>
          <>Hello {'World'}!</>
          <span></span>
          <>Greetings {'World'}!</>
        </test>
      );
    });
  });
});
