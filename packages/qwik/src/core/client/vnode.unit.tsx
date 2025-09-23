import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';

import { Fragment } from '@qwik.dev/core';
import '../../testing/vdom-diff.unit-util';
import { VNodeFlags, type ContainerElement, type QDocument } from './types';
import {
  vnode_applyJournal,
  vnode_getFirstChild,
  vnode_insertBefore,
  vnode_locate,
  vnode_newElement,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_remove,
  vnode_setText,
  vnode_walkVNode,
  type VNodeJournal,
} from './vnode';
import type { ElementVNode, TextVNode, VirtualVNode, VNode } from './vnode-impl';

describe('vnode', () => {
  let parent: ContainerElement;
  let document: QDocument;
  let vParent: ElementVNode;
  let qVNodeRefs: Map<number, Element | ElementVNode>;
  let getVNode: (id: string) => VNode | null;
  let journal: VNodeJournal;
  beforeEach(() => {
    document = createDocument() as QDocument;
    document.qVNodeData = new WeakMap();
    parent = document.createElement('test') as ContainerElement;
    parent.qVNodeRefs = qVNodeRefs = new Map();
    vParent = vnode_newUnMaterializedElement(parent);
    getVNode = (id: string) => vnode_locate(vParent, id);
    journal = [];
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
      parent.innerHTML = `Hello <b :>world</b>!`;
      document.qVNodeData.set(parent, 'G1B');
      expect(vParent).toMatchVDOM(
        <test>
          Hello <b>world</b>!
        </test>
      );
    });

    it('should process missing text node', () => {
      parent.innerHTML = `<b :></b>`;
      document.qVNodeData.set(parent, 'A1{A}');
      expect(vParent).toMatchVDOM(
        <test>
          {''}
          <b></b>
          <>{''}</>
        </test>
      );
    });

    it('should process virtual text element text', () => {
      parent.innerHTML = `Hello <b :>world</b>!`;
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
      parent.innerHTML = `<span :>A</span>Hello World!<span :></span>Greetings World!`;
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

    it('should not consume trailing nodes after virtual', () => {
      parent.innerHTML = '<button :>Count: 123!</button><script :></script>';
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
      parent.innerHTML = `<b :></b>`;
      document.qVNodeData.set(parent, 'A1{A}');
      expect(vParent).toMatchVDOM(
        <test>
          {''}
          <b />
          <>{''}</>
        </test>
      );
      const firstText = vnode_getFirstChild(vParent) as TextVNode;
      const virtual = firstText.nextSibling!.nextSibling as VirtualVNode;
      const fragmentText = vnode_getFirstChild(virtual)! as TextVNode;
      vnode_setText(journal, fragmentText, 'Virtual Text');
      vnode_setText(journal, firstText, 'First Text');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`First Text<b :=""></b>Virtual Text`);
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
      const text2 = text1.nextSibling as TextVNode;
      const text3 = text2.nextSibling as TextVNode;
      const text4 = text3.nextSibling as TextVNode;
      vnode_setText(journal, text1, 'Salutation');
      vnode_setText(journal, text3, 'Name');
      vnode_setText(journal, text4, '.');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`Salutation Name.`);
    });
    it('should inflate text nodes across virtual', () => {
      parent.innerHTML = `123`;
      document.qVNodeData.set(parent, '{{}{B}{}B{}}B');
      vnode_getFirstChild(vParent) as VirtualVNode;
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <></>
            <>1</>
            <></>
            {'2'}
            <></>
          </>
          3
        </test>
      );
      const firstVirtual = vnode_getFirstChild(vParent) as VirtualVNode;
      const lastText = firstVirtual.nextSibling as TextVNode;
      vnode_setText(journal, lastText, '!');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`12!`);
    });
    it('should inflate text nodes across virtual', () => {
      parent.innerHTML = `123`;
      document.qVNodeData.set(parent, '{{}{B}{}B{}}B');
      vnode_getFirstChild(vParent) as VirtualVNode;
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <></>
            <>1</>
            <></>
            {'2'}
            <></>
          </>
          3
        </test>
      );
      const firstVirtual = vnode_getFirstChild(vParent) as VirtualVNode;
      const innerVirtual = vnode_getFirstChild(firstVirtual) as VirtualVNode;
      const firstTextVirtual = innerVirtual.nextSibling as TextVNode;
      const firstText = vnode_getFirstChild(firstTextVirtual) as TextVNode;
      vnode_setText(journal, firstText, '!');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`!23`);
    });
    it('should inflate text node on write', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, 'AA');
      expect(vParent).toMatchVDOM(
        <test>
          {''}
          {''}
        </test>
      );
      const firstText = vnode_getFirstChild(vParent) as TextVNode;
      const secondText = firstText.nextSibling as TextVNode;
      // Getting hold of the text nodes should not cause inflation.
      expect(journal.length).toBe(0);

      vnode_setText(journal, secondText, 'B');
      vnode_setText(journal, firstText, 'A');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`AB`);
    });

    describe('node removing from shared text node', () => {
      it('should inflate text nodes on first node remove', () => {
        parent.innerHTML = `012`;
        document.qVNodeData.set(parent, 'BBB');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'1'}
            {'2'}
          </test>
        );
        const firstText = vnode_getFirstChild(vParent) as TextVNode;
        vnode_remove(journal, vParent, firstText, true);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'1'}
            {'2'}
          </test>
        );
        expect(parent.innerHTML).toEqual(`12`);
      });

      it('should inflate text nodes on second node remove', () => {
        parent.innerHTML = `012`;
        document.qVNodeData.set(parent, 'BBB');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'1'}
            {'2'}
          </test>
        );
        const firstText = vnode_getFirstChild(vParent) as TextVNode;
        const secondText = firstText.nextSibling as TextVNode;
        vnode_remove(journal, vParent, secondText, true);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'2'}
          </test>
        );
        expect(parent.innerHTML).toEqual(`02`);
      });

      it('should inflate text nodes on last node remove', () => {
        parent.innerHTML = `012`;
        document.qVNodeData.set(parent, 'BBB');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'1'}
            {'2'}
          </test>
        );
        const firstText = vnode_getFirstChild(vParent) as TextVNode;
        const secondText = firstText.nextSibling as TextVNode;
        const thirdText = secondText.nextSibling as TextVNode;
        vnode_remove(journal, vParent, thirdText, true);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'1'}
          </test>
        );
        expect(parent.innerHTML).toEqual(`01`);
      });

      it('should inflate text nodes on first node remove and change text of second', () => {
        parent.innerHTML = `012`;
        document.qVNodeData.set(parent, 'BBB');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            {'0'}
            {'1'}
            {'2'}
          </test>
        );
        const firstText = vnode_getFirstChild(vParent) as TextVNode;
        const secondText = firstText.nextSibling as TextVNode;
        vnode_remove(journal, vParent, firstText, true);
        vnode_setText(journal, secondText, '!');
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'!'}
            {'2'}
          </test>
        );
        expect(parent.innerHTML).toEqual(`!2`);
      });

      it('should inflate text nodes on first virtual node remove', () => {
        parent.innerHTML = `0123`;
        document.qVNodeData.set(parent, '{B}{B}{B}');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            <>0</>
            <>1</>
            <>2</>
          </test>
        );
        const firstVirtual = vnode_getFirstChild(vParent) as VirtualVNode;
        vnode_remove(journal, vParent, firstVirtual, true);

        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>1</>
            <>2</>
          </test>
        );
        expect(parent.innerHTML).toEqual(`12`);
      });

      it('should inflate text nodes on middle virtual node remove', () => {
        parent.innerHTML = `0123`;
        document.qVNodeData.set(parent, '{B}{B}{B}');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            <>0</>
            <>1</>
            <>2</>
          </test>
        );
        const firstVirtual = vnode_getFirstChild(vParent) as VirtualVNode;
        const secondVirtual = firstVirtual.nextSibling as VirtualVNode;
        vnode_remove(journal, vParent, secondVirtual, true);

        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>0</>
            <>2</>
          </test>
        );
        expect(parent.innerHTML).toEqual(`02`);
      });

      it('should inflate text nodes on last virtual node remove', () => {
        parent.innerHTML = `0123`;
        document.qVNodeData.set(parent, '{B}{B}{B}');
        vnode_getFirstChild(vParent) as VirtualVNode;
        expect(vParent).toMatchVDOM(
          <test>
            <>0</>
            <>1</>
            <>2</>
          </test>
        );
        const firstVirtual = vnode_getFirstChild(vParent) as VirtualVNode;
        const secondVirtual = firstVirtual.nextSibling as VirtualVNode;
        const thirdVirtual = secondVirtual.nextSibling as VirtualVNode;
        vnode_remove(journal, vParent, thirdVirtual, true);

        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>0</>
            <>1</>
          </test>
        );
        expect(parent.innerHTML).toEqual(`01`);
      });
    });
  });
  describe('virtual', () => {
    it('should create empty Virtual', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, '{}');
      expect(vParent).toMatchVDOM(
        <test>
          <></>
        </test>
      );
    });
    it('should create empty Virtual before element', () => {
      parent.innerHTML = `<b :></b>`;
      document.qVNodeData.set(parent, '{}');
      expect(vParent).toMatchVDOM(
        <test>
          <></>
        </test>
      );
    });
    it('should place attributes on Virtual', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, '{@:key_}');
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment key=":key_" />
        </test>
      );
    });
    it('should retrieve the correct node even after DOM manipulation', () => {
      parent.innerHTML = `wrongtext`;
      document.qVNodeData.set(parent, '{F}{E}{}');
      parent.qVNodeRefs = new Map<number, Element | ElementVNode>([[0, parent]]);
      vnode_getFirstChild(vParent);
      vnode_insertBefore(
        journal,
        vParent,
        vnode_newText(document.createTextNode('inserted'), 'inserted'),
        vnode_getFirstChild(vParent)
      );
      vnode_applyJournal(journal);
      const second = vnode_locate(vParent, '0B');
      expect(second).toMatchVDOM(<>text</>);
      expect(vParent).toMatchVDOM(
        <test>
          {'inserted'}
          <Fragment>wrong</Fragment>
          <Fragment>text</Fragment>
          <Fragment />
        </test>
      );
    });
  });
  describe('manipulation', () => {
    it('should create empty Virtual before element', () => {
      const fragment1 = vnode_newVirtual();
      const fragment2 = vnode_newVirtual();
      const fragment3 = vnode_newVirtual();
      (fragment1 as VirtualVNode).setAttr('q:id', '1', null);
      (fragment2 as VirtualVNode).setAttr('q:id', '2', null);
      (fragment3 as VirtualVNode).setAttr('q:id', '3', null);
      const textA = vnode_newText(document.createTextNode('1A'), '1A');
      const textB = vnode_newText(document.createTextNode('2B'), '2B');
      const textC = vnode_newText(document.createTextNode('3C'), '3C');
      const textD = vnode_newText(document.createTextNode('D'), 'D');
      const textE = vnode_newText(document.createTextNode('E'), 'E');
      const textF = vnode_newText(document.createTextNode('F'), 'F');

      vnode_insertBefore(journal, vParent, fragment2, null);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(journal, vParent, fragment1, fragment2);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)} />
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(journal, fragment1, fragment3, null);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('');

      vnode_insertBefore(journal, fragment1, textA, fragment3);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)} />
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('1A');

      vnode_insertBefore(journal, fragment2, textB, null);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)} />
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('1A2B');

      vnode_insertBefore(journal, fragment3, textC, null);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('1A3C2B');

      vnode_insertBefore(journal, vParent, textD, null);
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:id': '1' } as any)}>
            1A
            <Fragment {...({ 'q:id': '3' } as any)}>3C</Fragment>
          </Fragment>
          <Fragment {...({ 'q:id': '2' } as any)}>2B</Fragment>D
        </test>
      );
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('1A3C2BD');

      vnode_insertBefore(journal, vParent, textE, fragment1);
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
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('E1A3C2BD');

      vnode_insertBefore(journal, vParent, textF, fragment3);
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
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toBe('E1AF3C2BD');
    });
  });
  describe('insert', () => {
    describe('text node', () => {
      it('should insert text node', () => {
        expect(vParent).toMatchVDOM(<test></test>);
        const text = vnode_newText(document.createTextNode('foo'), 'foo');
        vnode_insertBefore(journal, vParent, text, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(<test>foo</test>);
        expect(parent.innerHTML).toBe('foo');
      });

      it('should insert text node inside element', () => {
        parent.innerHTML = '<div :></div>';
        expect(vParent).toMatchVDOM(
          <test>
            <div></div>
          </test>
        );
        const text = vnode_newText(document.createTextNode('foo'), 'foo');
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, text, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <div>foo</div>
          </test>
        );
        expect(parent.innerHTML).toBe('<div :="">foo</div>');
      });

      it('should insert text node inside virtual', () => {
        parent.innerHTML = '';
        document.qVNodeData.set(parent, '{}');
        expect(vParent).toMatchVDOM(
          <test>
            <></>
          </test>
        );
        const text = vnode_newText(document.createTextNode('foo'), 'foo');
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, text, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>foo</>
          </test>
        );
        expect(parent.innerHTML).toBe('foo');
      });

      describe('inserting text node near element node sibling', () => {
        it('should insert text node before element', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          expect(firstNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, vParent, text, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              foo
              <b />
            </test>
          );
          expect(parent.innerHTML).toBe('foo<b :=""></b>');
        });

        it('should insert text node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          vnode_insertBefore(journal, vParent, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              foo
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>foo');
        });

        it('should insert text node between elements', () => {
          parent.innerHTML = '<b :></b><p :></p>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <p />
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<p />);
          vnode_insertBefore(journal, vParent, text, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              foo
              <p />
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>foo<p :=""></p>');
        });
      });

      describe('inserting text node near text node sibling', () => {
        it('should insert text node before text node', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, text, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'foo'}
              {'b'}
            </test>
          );
          expect(parent.innerHTML).toBe('foob');
        });

        it('should insert text node after text node at the end', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          vnode_insertBefore(journal, vParent, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              {'foo'}
            </test>
          );
          expect(parent.innerHTML).toBe('bfoo');
        });

        it('should insert text node between text nodes', () => {
          parent.innerHTML = 'bp';
          document.qVNodeData.set(parent, 'BB');
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              {'p'}
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM('p');
          vnode_insertBefore(journal, vParent, text, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              {'foo'}
              {'p'}
            </test>
          );
          expect(parent.innerHTML).toBe('bfoop');
        });
      });

      describe('inserting text node near virtual node sibling', () => {
        it('should insert text node before virtual node', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, text, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'foo'}
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });

        it('should insert text node after text node at the end', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          vnode_insertBefore(journal, vParent, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              {'foo'}
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });

        it('should insert text node between text nodes', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          vnode_insertBefore(journal, vParent, text, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              {'foo'}
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });
      });

      describe('inserting text node inside element node near element node sibling', () => {
        it('should insert text node before element', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, text, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                foo
                <b />
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :="">foo<b :=""></b></div>');
        });

        it('should insert text node before virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                foo
                <></>
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :="">foo</div>');
        });

        it('should insert text node after element at the end', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
                foo
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><b :=""></b>foo</div>');
        });

        it('should insert text node after virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                foo
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :="">foo</div>');
        });

        it('should insert text node between virtual elements', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
              </div>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as ElementVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                foo
                <></>
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :="">foo</div>');
        });
      });

      describe('inserting text node inside virtual node near element node sibling', () => {
        it('should insert text node before element', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, text, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                foo
                <b />
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('foo<b :=""></b>');
        });

        it('should insert text node before virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                foo
                <></>
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });

        it('should insert text node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
                foo
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>foo');
        });

        it('should insert text node after virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                foo
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });

        it('should insert text node between virtual elements', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
              </>
            </test>
          );
          const text = vnode_newText(document.createTextNode('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as ElementVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, text, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                foo
                <></>
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('foo');
        });
      });
    });
    describe('element node', () => {
      it('should insert element node', () => {
        expect(vParent).toMatchVDOM(<test></test>);
        const element = vnode_newElement(document.createElement('foo'), 'foo');
        vnode_insertBefore(journal, vParent, element, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <foo />
          </test>
        );
        expect(parent.innerHTML).toBe('<foo></foo>');
      });

      it('should insert element node inside element', () => {
        parent.innerHTML = '<div :></div>';
        expect(vParent).toMatchVDOM(
          <test>
            <div></div>
          </test>
        );
        const element = vnode_newElement(document.createElement('foo'), 'foo');
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, element, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <div>
              <foo></foo>
            </div>
          </test>
        );
        expect(parent.innerHTML).toBe('<div :=""><foo></foo></div>');
      });

      it('should insert element node inside virtual', () => {
        parent.innerHTML = '';
        document.qVNodeData.set(parent, '{}');
        expect(vParent).toMatchVDOM(
          <test>
            <></>
          </test>
        );
        const element = vnode_newElement(document.createElement('foo'), 'foo');
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, element, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>
              <foo></foo>
            </>
          </test>
        );
        expect(parent.innerHTML).toBe('<foo></foo>');
      });

      describe('inserting element node near element node sibling', () => {
        it('should insert element node before element', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          expect(firstNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, vParent, element, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <foo />
              <b />
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo><b :=""></b>');
        });

        it('should insert element node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          vnode_insertBefore(journal, vParent, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <foo />
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b><foo></foo>');
        });

        it('should insert element node between elements', () => {
          parent.innerHTML = '<b :></b><p :></p>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <p />
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<p />);
          vnode_insertBefore(journal, vParent, element, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <foo />
              <p />
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b><foo></foo><p :=""></p>');
        });
      });

      describe('inserting element node near text node sibling', () => {
        it('should insert element node before text node', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, element, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <foo />
              {'b'}
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>b');
        });

        it('should insert element node after text node at the end', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          vnode_insertBefore(journal, vParent, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              <foo />
            </test>
          );
          expect(parent.innerHTML).toBe('b<foo></foo>');
        });

        it('should insert element node between text nodes', () => {
          parent.innerHTML = 'bp';
          document.qVNodeData.set(parent, 'BB');
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              {'p'}
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM('p');
          vnode_insertBefore(journal, vParent, element, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              <foo />
              {'p'}
            </test>
          );
          expect(parent.innerHTML).toBe('b<foo></foo>p');
        });
      });

      describe('inserting element node near virtual node sibling', () => {
        it('should insert element node before virtual node', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, element, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <foo />
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });

        it('should insert element node after text node at the end', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          vnode_insertBefore(journal, vParent, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <foo />
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });

        it('should insert element node between text nodes', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          vnode_insertBefore(journal, vParent, element, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <foo />
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });
      });

      describe('inserting element node inside element node near element node sibling', () => {
        it('should insert element node before element', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, element, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <foo />
                <b />
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><foo></foo><b :=""></b></div>');
        });

        it('should insert element node before virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <foo />
                <></>
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><foo></foo></div>');
        });

        it('should insert element node after element at the end', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
                <foo />
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><b :=""></b><foo></foo></div>');
        });

        it('should insert element node after virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <foo />
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><foo></foo></div>');
        });

        it('should insert element node between virtual elements', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
              </div>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as ElementVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <foo />
                <></>
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><foo></foo></div>');
        });
      });

      describe('inserting element node inside virtual node near element node sibling', () => {
        it('should insert element node before element', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, element, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <foo />
                <b />
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo><b :=""></b>');
        });

        it('should insert element node before virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <foo />
                <></>
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });

        it('should insert element node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
                <foo />
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b><foo></foo>');
        });

        it('should insert element node after virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <foo />
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });

        it('should insert element node between virtual elements', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
              </>
            </test>
          );
          const element = vnode_newElement(document.createElement('foo'), 'foo');
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as ElementVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, element, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <foo />
                <></>
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<foo></foo>');
        });
      });
    });
    describe('virtual node', () => {
      it('should insert virtual node', () => {
        expect(vParent).toMatchVDOM(<test></test>);
        const virtual = vnode_newVirtual();
        vnode_insertBefore(journal, vParent, virtual, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <></>
          </test>
        );
        expect(parent.innerHTML).toBe('');
      });

      it('should insert virtual node inside element', () => {
        parent.innerHTML = '<div :></div>';
        expect(vParent).toMatchVDOM(
          <test>
            <div></div>
          </test>
        );
        const virtual = vnode_newVirtual();
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, virtual, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <div>
              <></>
            </div>
          </test>
        );
        expect(parent.innerHTML).toBe('<div :=""></div>');
      });

      it('should insert virtual node inside virtual', () => {
        parent.innerHTML = '';
        document.qVNodeData.set(parent, '{}');
        expect(vParent).toMatchVDOM(
          <test>
            <></>
          </test>
        );
        const virtual = vnode_newVirtual();
        const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, firstNode, virtual, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <>
              <></>
            </>
          </test>
        );
        expect(parent.innerHTML).toBe('');
      });

      describe('inserting virtual node near element node sibling', () => {
        it('should insert virtual node before element', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          expect(firstNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, vParent, virtual, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <b />
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>');
        });

        it('should insert virtual node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
            </test>
          );
          const virtual = vnode_newVirtual();
          vnode_insertBefore(journal, vParent, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>');
        });

        it('should insert virtual node between elements', () => {
          parent.innerHTML = '<b :></b><p :></p>';
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <p />
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<p />);
          vnode_insertBefore(journal, vParent, virtual, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <b />
              <></>
              <p />
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b><p :=""></p>');
        });
      });

      describe('inserting virtual node near text node sibling', () => {
        it('should insert virtual node before text node', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, virtual, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              {'b'}
            </test>
          );
          expect(parent.innerHTML).toBe('b');
        });

        it('should insert virtual node after text node at the end', () => {
          parent.innerHTML = 'b';
          document.qVNodeData.set(parent, 'B');
          expect(vParent).toMatchVDOM(<test>b</test>);
          const virtual = vnode_newVirtual();
          vnode_insertBefore(journal, vParent, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              <></>
            </test>
          );
          expect(parent.innerHTML).toBe('b');
        });

        it('should insert virtual node between text nodes', () => {
          parent.innerHTML = 'bp';
          document.qVNodeData.set(parent, 'BB');
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              {'p'}
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM('p');
          vnode_insertBefore(journal, vParent, virtual, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              {'b'}
              <></>
              {'p'}
            </test>
          );
          expect(parent.innerHTML).toBe('bp');
        });
      });

      describe('inserting virtual node near virtual node sibling', () => {
        it('should insert virtual node before virtual node', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, virtual, firstNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
            </test>
          );

          expect(vnode_getFirstChild(vParent)).not.toBe(firstNode);
          expect(vnode_getFirstChild(vParent)!.nextSibling).toBe(firstNode);
          expect(parent.innerHTML).toBe('');
        });

        it('should insert virtual node after text node at the end', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          vnode_insertBefore(journal, vParent, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
            </test>
          );
          expect(vnode_getFirstChild(vParent)!.nextSibling).not.toBe(firstNode);
          expect(vnode_getFirstChild(vParent)).toBe(firstNode);
          expect(parent.innerHTML).toBe('');
        });

        it('should insert virtual node between text nodes', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent);
          const targetNode = firstNode!.nextSibling as VNode | null;
          vnode_insertBefore(journal, vParent, virtual, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <></>
              <></>
              <></>
            </test>
          );
          expect(vnode_getFirstChild(vParent)).toBe(firstNode);
          expect(vnode_getFirstChild(vParent)!.nextSibling).not.toBe(firstNode);
          expect(vnode_getFirstChild(vParent)!.nextSibling).not.toBe(targetNode);
          expect(vnode_getFirstChild(vParent)!.nextSibling!.nextSibling).toBe(targetNode);
          expect(parent.innerHTML).toBe('');
        });
      });

      describe('inserting virtual node inside element node near element node sibling', () => {
        it('should insert virtual node before element', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, virtual, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <b />
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><b :=""></b></div>');
        });

        it('should insert virtual node before virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
              </div>
            </test>
          );

          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).toBe(
            firstInnerNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).not.toBe(firstInnerNode);
          expect(parent.innerHTML).toBe('<div :=""></div>');
        });

        it('should insert virtual node after element at the end', () => {
          parent.innerHTML = '<div :><b :></b></div>';
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
              </div>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <b />
                <></>
              </div>
            </test>
          );
          expect(parent.innerHTML).toBe('<div :=""><b :=""></b></div>');
        });

        it('should insert virtual node after virtual element', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
              </div>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
              </div>
            </test>
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            firstInnerNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).toBe(firstInnerNode);
          expect(parent.innerHTML).toBe('<div :=""></div>');
        });

        it('should insert virtual node between virtual elements', () => {
          parent.innerHTML = '<div :></div>';
          document.qVNodeData.set(parent.firstChild as Element, '{}{}');
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
              </div>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as ElementVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <div>
                <></>
                <></>
                <></>
              </div>
            </test>
          );

          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).toBe(firstInnerNode);
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            firstInnerNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            targetNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling!.nextSibling).toBe(
            targetNode
          );
          expect(parent.innerHTML).toBe('<div :=""></div>');
        });
      });

      describe('inserting virtual node inside virtual node near element node sibling', () => {
        it('should insert virtual node before element', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<b />);
          vnode_insertBefore(journal, firstNode, virtual, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <b />
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>');
        });

        it('should insert virtual node before virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, firstInnerNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
              </>
            </test>
          );

          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).not.toBe(firstInnerNode);
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).toBe(
            firstInnerNode
          );
          expect(parent.innerHTML).toBe('');
        });

        it('should insert virtual node after element at the end', () => {
          parent.innerHTML = '<b :></b>';
          document.qVNodeData.set(parent, '{1}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
              </>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as ElementVNode;
          vnode_insertBefore(journal, firstNode, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <b />
                <></>
              </>
            </test>
          );
          expect(parent.innerHTML).toBe('<b :=""></b>');
        });

        it('should insert virtual node after virtual element', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
              </>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode);
          expect(firstInnerNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, null);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
              </>
            </test>
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).toBe(firstInnerNode);
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            firstInnerNode
          );
          expect(parent.innerHTML).toBe('');
        });

        it('should insert virtual node between virtual elements', () => {
          parent.innerHTML = '';
          document.qVNodeData.set(parent, '{{}{}}');
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
              </>
            </test>
          );
          const virtual = vnode_newVirtual();
          const firstNode = vnode_getFirstChild(vParent) as VirtualVNode;
          const firstInnerNode = vnode_getFirstChild(firstNode) as VirtualVNode;
          const targetNode = firstInnerNode!.nextSibling as VNode | null;
          expect(targetNode).toMatchVDOM(<></>);
          vnode_insertBefore(journal, firstNode, virtual, targetNode);
          vnode_applyJournal(journal);
          expect(vParent).toMatchVDOM(
            <test>
              <>
                <></>
                <></>
                <></>
              </>
            </test>
          );

          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)).toBe(firstInnerNode);
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            firstInnerNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling).not.toBe(
            targetNode
          );
          expect(vnode_getFirstChild(vnode_getFirstChild(vParent)!)!.nextSibling!.nextSibling).toBe(
            targetNode
          );
          expect(parent.innerHTML).toBe('');
        });
      });
    });
    it('should insert at the end', () => {
      parent.innerHTML = '<b :></b><i :></i>';
      document.qVNodeData.set(parent, '{{1}}1');
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <>
              <b />
            </>
          </>
          <i />
        </test>
      );
      const fragment1 = vnode_getFirstChild(vParent) as VirtualVNode;
      const fragment2 = vnode_getFirstChild(fragment1) as VirtualVNode;
      const text = vnode_newText(document.createTextNode('INSERT'), 'INSERT');
      vnode_insertBefore(journal, fragment2, text, null);
      vnode_applyJournal(journal);
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <>
              <b />
              INSERT
            </>
          </>
          <i />
        </test>
      );
      expect(parent.innerHTML).toBe('<b :=""></b>INSERT<i :=""></i>');
    });
    it('should replace insertBefore with null for created newChild equals to insertBefore', () => {
      parent.innerHTML = '<b :></b><i :></i>';
      document.qVNodeData.set(parent, '{{1}}1');
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <>
              <b />
            </>
          </>
          <i />
        </test>
      );
      const fragment1 = vnode_getFirstChild(vParent) as VirtualVNode;
      const fragment2 = vnode_getFirstChild(fragment1) as VirtualVNode;
      const text = vnode_newText(document.createTextNode('INSERT'), 'INSERT');
      vnode_insertBefore(journal, fragment2, text, text);
      vnode_applyJournal(journal);
      expect(vParent).toMatchVDOM(
        <test>
          <>
            <>
              <b />
              INSERT
            </>
          </>
          <i />
        </test>
      );
      expect(parent.innerHTML).toBe('<b :=""></b>INSERT<i :=""></i>');
      expect(text.nextSibling).toBeNull();
    });
  });
  describe('move', () => {
    describe('text node', () => {
      it('should move middle text node to the start', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text2, text1);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'B'}
            {'A'}
            {'C'}
          </test>
        );
        expect(parent.innerHTML).toBe('BAC');
      });
      it('should move middle text node to the end', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text2, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'C'}
            {'B'}
          </test>
        );
        expect(parent.innerHTML).toBe('ACB');
      });
      it('should move start text node to the middle', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const text3 = text2.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text1, text3);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'B'}
            {'A'}
            {'C'}
          </test>
        );
        expect(parent.innerHTML).toBe('BAC');
      });
      it('should move start text node to the end', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        vnode_insertBefore(journal, vParent, text1, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'B'}
            {'C'}
            {'A'}
          </test>
        );
        expect(parent.innerHTML).toBe('BCA');
      });
      it('should move end text node to the start', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const text3 = text2.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text3, text1);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'C'}
            {'A'}
            {'B'}
          </test>
        );
        expect(parent.innerHTML).toBe('CAB');
      });
      it('should move end text node to the middle', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const text3 = text2.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text3, text2);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'C'}
            {'B'}
          </test>
        );
        expect(parent.innerHTML).toBe('ACB');
      });
      it('should reverse order', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const text3 = text2.nextSibling as TextVNode;
        vnode_insertBefore(journal, vParent, text2, text1);
        vnode_insertBefore(journal, vParent, text3, text2);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'C'}
            {'B'}
            {'A'}
          </test>
        );
        expect(parent.innerHTML).toBe('CBA');
      });
      it('should move text node to virtual node', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const virtual = vnode_newVirtual();
        vnode_insertBefore(journal, vParent, virtual, text2);
        vnode_insertBefore(journal, virtual, text2, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <>{'B'}</>
            {'C'}
          </test>
        );
        expect(parent.innerHTML).toBe('ABC');
      });
      it('should move text node to element node', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            {'B'}
            {'C'}
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const text2 = text1.nextSibling as TextVNode;
        const element = vnode_newElement(document.createElement('foo'), 'foo');
        vnode_insertBefore(journal, vParent, element, text2);
        vnode_insertBefore(journal, element, text2, null);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <foo>{'B'}</foo>
            {'C'}
          </test>
        );
        expect(parent.innerHTML).toBe('A<foo>B</foo>C');
      });
      it('should move text node to from element node to element node', () => {
        parent.innerHTML = 'A<div :>B</div><p :>C</p>';
        document.qVNodeData.set(parent, 'B2');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <div>{'B'}</div>
            <p>{'C'}</p>
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const element1 = text1.nextSibling as ElementVNode;
        const text2 = vnode_getFirstChild(element1) as TextVNode;
        const element2 = element1.nextSibling as ElementVNode;
        const text3 = vnode_getFirstChild(element2) as TextVNode;
        vnode_insertBefore(journal, element2, text2, text3);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <div></div>
            <p>
              {'B'}
              {'C'}
            </p>
          </test>
        );
        expect(parent.innerHTML).toBe('A<div :=""></div><p :="">BC</p>');
      });
      it('should move text node to from element node to virtual node', () => {
        parent.innerHTML = 'A<div :>B</div>C';
        document.qVNodeData.set(parent, 'B1{B}');
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <div>{'B'}</div>
            <>{'C'}</>
          </test>
        );
        const text1 = vnode_getFirstChild(vParent) as TextVNode;
        const element1 = text1.nextSibling as ElementVNode;
        const text2 = vnode_getFirstChild(element1) as TextVNode;
        const virtual1 = element1.nextSibling as ElementVNode;
        const text3 = vnode_getFirstChild(virtual1) as TextVNode;
        vnode_insertBefore(journal, virtual1, text2, text3);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            {'A'}
            <div></div>
            <>
              {'B'}
              {'C'}
            </>
          </test>
        );
        expect(parent.innerHTML).toBe('A<div :=""></div>BC');
      });
    });
    describe('element node', () => {
      it('should early return for moving element node before itself', () => {
        parent.innerHTML = '<div :>A</div><div :>B</div>';
        expect(vParent).toMatchVDOM(
          <test>
            <div>{'A'}</div>
            <div>{'B'}</div>
          </test>
        );
        const element1 = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_insertBefore(journal, vParent, element1, element1);
        vnode_applyJournal(journal);
        expect(vParent).toMatchVDOM(
          <test>
            <div>{'A'}</div>
            <div>{'B'}</div>
          </test>
        );
        expect(parent.innerHTML).toBe('<div :="">A</div><div :="">B</div>');
      });
    });
    describe.todo('virtual node');
  });
  describe('portal', () => {
    it('should link source-destination', () => {
      parent.innerHTML = 'AB';
      document.qVNodeData.set(parent, '{B||0B}{B|:|0A}');
      qVNodeRefs.set(0, vParent);
      const v1 = vnode_getFirstChild(vParent) as VirtualVNode;
      const v2 = v1.nextSibling as VirtualVNode;
      expect(v1).toMatchVDOM(<>A</>);
      expect(v2).toMatchVDOM(<>B</>);
      expect(v1.getProp('', getVNode)).toBe(v2);
      expect(v2.getProp(':', getVNode)).toBe(v1);
    });
  });
  describe('attributes', () => {
    describe('dangerouslySetInnerHTML', () => {
      it('should materialize without innerHTML children', () => {
        parent.innerHTML = '<div q:container="html" :><i>content</i></div>';
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <div q:container="html" dangerouslySetInnerHTML="<i>content</i>" />
          </test>
        );
      });
      it('should update innerHTML', () => {
        parent.innerHTML = '<div q:container="html" :><i>content</i></div>';
        const div = vnode_getFirstChild(vParent) as ElementVNode;
        (div as VirtualVNode).setAttr('dangerouslySetInnerHTML', '<b>new content</b>', journal);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div q:container="html" :=""><b>new content</b></div>');
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <div q:container="html" dangerouslySetInnerHTML="<b>new content</b>" />
          </test>
        );
        expect((div as VirtualVNode).getAttr('dangerouslySetInnerHTML')).toBe('<b>new content</b>');
      });
      it('should have empty child for dangerouslySetInnerHTML', () => {
        parent.innerHTML = '<div q:container="html" :><i>content</i></div>';
        const div = vnode_getFirstChild(vParent) as ElementVNode;

        expect(div).toMatchVDOM(
          // @ts-ignore-next-line
          <div q:container="html" dangerouslySetInnerHTML="<i>content</i>"></div>
        );
        expect(vnode_getFirstChild(div)).toBe(null);
      });
    });

    describe('textarea value', () => {
      it('should materialize without textContent', () => {
        parent.innerHTML = '<textarea q:container="text" :>content</textarea>';
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <textarea q:container="text" value="content" />
          </test>
        );
      });
      it('should update textContent', () => {
        parent.innerHTML = '<textarea q:container="text" :>content</textarea>';
        const textarea = vnode_getFirstChild(vParent) as ElementVNode;
        (textarea as VirtualVNode).setAttr('value', 'new content', journal);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<textarea q:container="text" :="">new content</textarea>');
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <textarea q:container="text" value="new content" />
          </test>
        );
        expect((textarea as VirtualVNode).getAttr('value')).toBe('new content');
      });
      it('should have empty child for value', () => {
        parent.innerHTML = '<textarea q:container="text" :>content</textarea>';
        const textarea = vnode_getFirstChild(vParent) as ElementVNode;

        expect(textarea).toMatchVDOM(
          // @ts-ignore-next-line
          <textarea q:container="text" value="content"></textarea>
        );
        expect(vnode_getFirstChild(textarea)).toBe(null);
      });
    });
  });
  describe('journal', () => {
    describe('vnode_insertBefore', () => {
      it('should insert before null', () => {
        const v1 = vnode_newText(document.createTextNode('1'), '1');
        const v2 = vnode_newText(document.createTextNode('2'), '2');
        vnode_insertBefore(journal, vParent, v1, null);
        vnode_insertBefore(journal, vParent, v2, null);
        expect(vParent).toMatchVDOM(
          <test>
            {'1'}
            {'2'}
          </test>
        );
        expect(parent.innerHTML).toBe('');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('12');
      });
      it('should insert before existing', () => {
        const v1 = vnode_newText(document.createTextNode('1'), '1');
        const v2 = vnode_newText(document.createTextNode('2'), '2');
        const v3 = vnode_newText(document.createTextNode('3'), '3');
        vnode_insertBefore(journal, vParent, v3, null);
        vnode_insertBefore(journal, vParent, v1, v3);
        vnode_insertBefore(journal, vParent, v2, v3);
        expect(vParent).toMatchVDOM(
          <test>
            {'1'}
            {'2'}
            {'3'}
          </test>
        );
        expect(parent.innerHTML).toBe('');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('123');
      });
      it('should insert element before existing', () => {
        const vVirtual = vnode_newVirtual();
        const vSpan1 = vnode_newElement(document.createElement('div'), 'div');
        const v1 = vnode_newText(document.createTextNode('1'), '1');
        const vSpan2 = vnode_newElement(document.createElement('span'), 'span');
        vnode_insertBefore(journal, vParent, vSpan1, null);
        vnode_insertBefore(journal, vSpan1, vVirtual, null);
        vnode_insertBefore(journal, vParent, vSpan2, null);
        vnode_insertBefore(journal, vVirtual, v1, null);
        expect(vParent).toMatchVDOM(
          <test>
            <div>
              <Fragment>{'1'}</Fragment>
            </div>
            <span></span>
          </test>
        );
        expect(parent.innerHTML).toBe('');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div>1</div><span></span>');
      });
    });
    describe('vnode_remove', () => {
      it('should remove', () => {
        parent.innerHTML = '<b :>1</b><b :>2</b><b :>3</b>';
        const b1 = vnode_getFirstChild(vParent) as ElementVNode;
        const b2 = b1.nextSibling as ElementVNode;
        const b3 = b2.nextSibling as ElementVNode;
        vnode_remove(journal, vParent, b2, true);
        expect(vParent).toMatchVDOM(
          <test>
            <b>1</b>
            <b>3</b>
          </test>
        );
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<b :="">1</b><b :="">3</b>');
        vnode_remove(journal, vParent, b1, true);
        expect(vParent).toMatchVDOM(
          <test>
            <b>3</b>
          </test>
        );
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<b :="">3</b>');
        vnode_remove(journal, vParent, b3, true);
        expect(vParent).toMatchVDOM(<test></test>);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('');
      });
      it.todo('should remove virtual');
    });
    describe('vnode_setAttr', () => {
      it('should set attribute', () => {
        parent.innerHTML = '<div foo="bar" :></div>';
        const div = vnode_getFirstChild(vParent) as ElementVNode;
        (div as VirtualVNode).setAttr('key', '123', journal);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div foo="bar" :="" key="123"></div>');
        (div as VirtualVNode).setAttr('foo', null, journal);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div :="" key="123"></div>');
      });
    });
    describe('vnode_setText', () => {
      it('should set text', () => {
        parent.innerHTML = 'text';
        const text = vnode_getFirstChild(vParent) as TextVNode;
        vnode_setText(journal, text, 'new text');
        expect(parent.innerHTML).toBe('text');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('new text');
      });
      it('should inflate text node', () => {
        parent.innerHTML = 'ABC';
        document.qVNodeData.set(parent, 'BBB');
        const a = vnode_getFirstChild(vParent) as TextVNode;
        const b = a.nextSibling as TextVNode;
        vnode_setText(journal, b, '123');
        expect(parent.innerHTML).toBe('ABC');
        expect(parent.firstChild?.nodeValue).toEqual('ABC');
        vnode_applyJournal(journal);
        expect(parent.firstChild?.nodeValue).toEqual('A');
        expect(parent.innerHTML).toBe('A123C');
      });
    });
  });

  describe('parentIsDeleted logic', () => {
    let parent: ContainerElement;
    let document: QDocument;
    let vParent: ElementVNode;
    let journal: VNodeJournal;
    let vChild1: ElementVNode;
    let vChild2: ElementVNode;
    let vVirtual: VirtualVNode;

    beforeEach(() => {
      document = createDocument() as QDocument;
      document.qVNodeData = new WeakMap();
      parent = document.createElement('test') as ContainerElement;
      parent.qVNodeRefs = new Map();
      vParent = vnode_newUnMaterializedElement(parent);
      journal = [];

      // Create test vnodes
      vChild1 = vnode_newElement(document.createElement('div'), 'div');
      vChild2 = vnode_newElement(document.createElement('span'), 'span');
      vVirtual = vnode_newVirtual();
    });

    afterEach(() => {
      parent = null!;
      document = null!;
      vParent = null!;
      vChild1 = null!;
      vChild2 = null!;
      vVirtual = null!;
    });

    describe('vnode_insertBefore with deleted parent', () => {
      it('should skip DOM insertion when parent is deleted', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Try to insert child into deleted parent
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Verify child is linked into tree structure
        expect(vParent.firstChild).toBe(vChild1);
        expect(vChild1.parent).toBe(vParent);

        // Verify child is marked as deleted (inherited from parent)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(0);
      });

      it('should skip DOM insertion but maintain tree structure for virtual parent', () => {
        // Mark virtual parent and its tree as deleted
        markVNodeTreeAsDeleted(vVirtual);

        // Try to insert child into deleted virtual parent
        vnode_insertBefore(journal, vVirtual, vChild1, null);

        // Verify child is linked into tree structure
        expect(vVirtual.firstChild).toBe(vChild1);
        expect(vChild1.parent).toBe(vVirtual);

        // Verify child is marked as deleted (inherited from parent)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(0);
      });

      it('should handle insertion between existing children when parent is deleted', () => {
        // Set up existing children
        vnode_insertBefore(journal, vParent, vChild1, null);
        vnode_insertBefore(journal, vParent, vChild2, null);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        const journalOperations = journal.length;

        // Create new child to insert between existing ones
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vNewChild, vChild2);

        // Verify correct tree structure
        expect(vParent.firstChild).toBe(vChild1);
        expect(vChild1.nextSibling).toBe(vNewChild);
        expect(vNewChild.previousSibling).toBe(vChild1);
        expect(vNewChild.nextSibling).toBe(vChild2);
        expect(vChild2.previousSibling).toBe(vNewChild);
        expect(vParent.lastChild).toBe(vChild2);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no additional DOM insertion journal entries
        expect(journal.length).toBe(journalOperations);
      });

      it('should handle insertion at end when parent is deleted', () => {
        // Set up existing child
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Create new child to insert at end
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vNewChild, null);

        // Verify correct tree structure
        expect(vParent.firstChild).toBe(vChild1);
        expect(vChild1.nextSibling).toBe(vNewChild);
        expect(vNewChild.previousSibling).toBe(vChild1);
        expect(vParent.lastChild).toBe(vNewChild);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle insertion at beginning when parent is deleted', () => {
        // Set up existing child
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Create new child to insert at beginning
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vNewChild, vChild1);

        // Verify correct tree structure
        expect(vParent.firstChild).toBe(vNewChild);
        expect(vNewChild.nextSibling).toBe(vChild1);
        expect(vChild1.previousSibling).toBe(vNewChild);
        expect(vParent.lastChild).toBe(vChild1);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle text node insertion when parent is deleted', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Create text vnode
        const vText = vnode_newText(document.createTextNode('test'), 'test');
        vnode_insertBefore(journal, vParent, vText, null);

        // Verify text node is linked into tree structure
        expect(vParent.firstChild).toBe(vText);
        expect(vText.parent).toBe(vParent);

        // Verify text node is marked as deleted (inherited from parent)
        expect(vText.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(0);
      });

      it('should handle virtual node insertion when parent is deleted', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Create virtual vnode
        const vNewVirtual = vnode_newVirtual();
        vnode_insertBefore(journal, vParent, vNewVirtual, null);

        // Verify virtual node is linked into tree structure
        expect(vParent.firstChild).toBe(vNewVirtual);
        expect(vNewVirtual.parent).toBe(vParent);

        // Verify virtual node is marked as deleted (inherited from parent)
        expect(vNewVirtual.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(0);
      });

      it('should handle complex nested structure when parent is deleted', () => {
        // Create nested structure
        vnode_insertBefore(journal, vParent, vChild1, null);
        vnode_insertBefore(journal, vChild1, vVirtual, null);
        vnode_insertBefore(journal, vVirtual, vChild2, null);

        // Mark parent and its entire tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Create new child to insert into the nested structure
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vVirtual, vNewChild, vChild2);

        // Verify correct tree structure
        expect(vVirtual.firstChild).toBe(vNewChild);
        expect(vNewChild.nextSibling).toBe(vChild2);
        expect(vChild2.previousSibling).toBe(vNewChild);
        expect(vVirtual.lastChild).toBe(vChild2);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify existing children are also marked as deleted (from tree traversal)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vVirtual.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle insertion when parent becomes deleted during operation', () => {
        // Set up initial structure
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Create new child
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');

        // Mark parent and its tree as deleted AFTER initial setup but BEFORE new insertion
        markVNodeTreeAsDeleted(vParent);

        const journalOperations = journal.length;

        // Try to insert new child
        vnode_insertBefore(journal, vParent, vNewChild, vChild1);

        // Verify correct tree structure
        expect(vParent.firstChild).toBe(vNewChild);
        expect(vNewChild.nextSibling).toBe(vChild1);
        expect(vChild1.previousSibling).toBe(vNewChild);
        expect(vParent.lastChild).toBe(vChild1);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(journalOperations);
      });

      it('should handle multiple insertions into deleted parent', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Insert multiple children
        vnode_insertBefore(journal, vParent, vChild1, null);
        vnode_insertBefore(journal, vParent, vChild2, null);
        const vChild3 = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vChild3, null);

        // Verify all children are linked correctly
        expect(vParent.firstChild).toBe(vChild1);
        expect(vChild1.nextSibling).toBe(vChild2);
        expect(vChild2.nextSibling).toBe(vChild3);
        expect(vChild3.previousSibling).toBe(vChild2);
        expect(vParent.lastChild).toBe(vChild3);

        // Verify all children are marked as deleted (inherited from parent)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild3.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify no DOM insertion journal entries
        expect(journal.length).toBe(0);
      });

      it('should handle insertion with null insertBefore when parent is deleted', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Insert child with null insertBefore (insert at end)
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Verify child is linked correctly
        expect(vParent.firstChild).toBe(vChild1);
        expect(vParent.lastChild).toBe(vChild1);
        expect(vChild1.previousSibling).toBe(null);
        expect(vChild1.nextSibling).toBe(null);

        // Verify child is marked as deleted (inherited from parent)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle insertion with virtual insertBefore when parent is deleted', () => {
        // Set up virtual node as insertBefore reference
        vnode_insertBefore(journal, vParent, vVirtual, null);
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Insert new child before virtual node
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vNewChild, vVirtual);

        // Verify correct tree structure
        expect(vParent.firstChild).toBe(vNewChild);
        expect(vNewChild.nextSibling).toBe(vVirtual);
        expect(vVirtual.previousSibling).toBe(vNewChild);
        expect(vVirtual.nextSibling).toBe(vChild1);
        expect(vChild1.previousSibling).toBe(vVirtual);
        expect(vParent.lastChild).toBe(vChild1);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });
    });

    describe('edge cases and error conditions', () => {
      it('should handle insertion when child already has a parent', () => {
        // Set up child with existing parent
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Try to insert child1 again (should unlink and relink)
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Verify child is still properly linked
        expect(vParent.firstChild).toBe(vChild1);
        expect(vChild1.parent).toBe(vParent);
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle insertion when insertBefore is the same as newChild', () => {
        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Try to insert child before itself (invalid operation)
        vnode_insertBefore(journal, vParent, vChild1, vChild1);

        // Should handle gracefully - child should be at the end
        expect(vParent.firstChild).toBe(vChild1);
        expect(vParent.lastChild).toBe(vChild1);
        expect(vChild1.previousSibling).toBe(null);
        expect(vChild1.nextSibling).toBe(null);
      });

      it('should handle insertion when parent is not deleted initially but becomes deleted', () => {
        // Insert child normally first
        vnode_insertBefore(journal, vParent, vChild1, null);

        // Verify child is not deleted initially
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(0);

        // Mark parent and its tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Insert another child
        vnode_insertBefore(journal, vParent, vChild2, null);

        // Verify new child is marked as deleted (inherited from parent)
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Verify existing child is also marked as deleted (from tree traversal)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should demonstrate that marking parent as deleted affects the entire tree', () => {
        // Set up existing children
        vnode_insertBefore(journal, vParent, vChild1, null);
        vnode_insertBefore(journal, vParent, vChild2, null);

        // Verify children are not deleted initially
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(0);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(0);

        // Mark parent and its entire tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Verify existing children are now marked as deleted (from tree traversal)
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);

        // Only new children inserted after parent is marked as deleted get the deleted flag
        const vNewChild = vnode_newElement(document.createElement('p'), 'p');
        vnode_insertBefore(journal, vParent, vNewChild, null);
        expect(vNewChild.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });

      it('should handle nested tree deletion correctly', () => {
        // Create nested structure
        vnode_insertBefore(journal, vParent, vChild1, null);
        vnode_insertBefore(journal, vChild1, vVirtual, null);
        vnode_insertBefore(journal, vVirtual, vChild2, null);

        // Verify no nodes are deleted initially
        expect(vParent.flags & VNodeFlags.Deleted).toBe(0);
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(0);
        expect(vVirtual.flags & VNodeFlags.Deleted).toBe(0);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(0);

        // Mark parent and its entire tree as deleted
        markVNodeTreeAsDeleted(vParent);

        // Verify all nodes in the tree are marked as deleted
        expect(vParent.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild1.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vVirtual.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
        expect(vChild2.flags & VNodeFlags.Deleted).toBe(VNodeFlags.Deleted);
      });
    });
  });

  describe('materializing dom', () => {
    it('should skip qwik style elements', () => {
      parent.innerHTML = '<style q:sstyle>div { color: red; }</style><div :>Hello</div>';
      expect(vParent).toMatchVDOM(
        <test>
          <div>Hello</div>
        </test>
      );
    });
    it('should skip non-qwik elements on start', () => {
      parent.innerHTML = '<b>Hello</b><div :>World</div>';
      expect(vParent).toMatchVDOM(
        <test>
          <div>World</div>
        </test>
      );
    });
    it('should skip non-qwik elements on end', () => {
      parent.innerHTML = '<div :>Hello</div><b>World</b>';
      expect(vParent).toMatchVDOM(
        <test>
          <div>Hello</div>
        </test>
      );
    });
    it('should skip non-qwik elements in front of text nodes', () => {
      parent.innerHTML = '<div :>Hello</div><b>World</b>text';
      expect(vParent).toMatchVDOM(
        <test>
          <div>Hello</div>
          text
        </test>
      );
    });
  });

  describe('materializing vNodeData', () => {
    it('should skip non-qwik elements on start', () => {
      parent.innerHTML = '<b>Hello</b><div :>World</div>';
      document.qVNodeData.set(parent, '1{}');
      expect(vParent).toMatchVDOM(
        <test>
          <div>World</div>
          <Fragment></Fragment>
        </test>
      );
    });
    it('should skip non-qwik elements on end', () => {
      parent.innerHTML = '<div :>Hello</div><b>World</b>';
      document.qVNodeData.set(parent, '{}1');
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment></Fragment>
          <div>Hello</div>
        </test>
      );
    });
    it('should skip non-qwik elements in front of text nodes', () => {
      parent.innerHTML = '<div :>World</div><b>Hello</b>text';
      document.qVNodeData.set(parent, '1E{}');
      expect(vParent).toMatchVDOM(
        <test>
          <div>World</div>
          text
          <Fragment></Fragment>
        </test>
      );
    });
  });
});

function markVNodeTreeAsDeleted(vNode: VNode) {
  // simulate the cleanup traversal from vnode_diff
  vnode_walkVNode(vNode, (vChild) => {
    vChild.flags |= VNodeFlags.Deleted;
  });
}
