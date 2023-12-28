import { createDocument } from '@builder.io/qwik-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vnode_new } from './vnode';

import '../vdom-diff.unit';
import type { QDocument, VNode } from './types';

describe('vnode', () => {
  let parent: HTMLElement;
  let document: QDocument;
  let vParent: VNode;
  beforeEach(() => {
    document = createDocument() as QDocument;
    document.qVNodeData = new WeakMap();
    parent = document.createElement('test');
    vParent = vnode_new(parent);
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

    it('should process fragment text element text', () => {
      parent.innerHTML = `Hello <b>world</b>!`;
      document.qVNodeData.set(parent!, 'H{B1B}');
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
  });
});
