import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDocument } from '../../testing/document';

import { Fragment } from '@builder.io/qwik';
import '../../testing/vdom-diff.unit-util';
import type {
  ContainerElement,
  ElementVNode,
  QDocument,
  TextVNode,
  VNode,
  VirtualVNode,
} from './types';
import {
  vnode_applyJournal,
  vnode_documentPosition,
  vnode_getAttr,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getProp,
  vnode_insertBefore,
  vnode_locate,
  vnode_newElement,
  vnode_newText,
  vnode_newUnMaterializedElement,
  vnode_newVirtual,
  vnode_remove,
  vnode_setAttr,
  vnode_setText,
  type VNodeJournal,
} from './vnode';

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

    it('should process virtual text element text', () => {
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

    it('should not consume trailing nodes after virtual', () => {
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
          <b />
          <>{''}</>
        </test>
      );
      const firstText = vnode_getFirstChild(vParent) as TextVNode;
      const virtual = vnode_getNextSibling(vnode_getNextSibling(firstText)!)! as VirtualVNode;
      const fragmentText = vnode_getFirstChild(virtual)! as TextVNode;
      vnode_setText(journal, fragmentText, 'Virtual Text');
      vnode_setText(journal, firstText, 'First Text');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`First Text<b></b>Virtual Text`);
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
      const lastText = vnode_getNextSibling(firstVirtual) as TextVNode;
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
      const firstTextVirtual = vnode_getNextSibling(innerVirtual) as TextVNode;
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
      const secondText = vnode_getNextSibling(firstText) as TextVNode;
      // Getting hold of the text nodes should not cause inflation.
      expect(journal.length).toBe(0);

      vnode_setText(journal, secondText, 'B');
      vnode_setText(journal, firstText, 'A');
      vnode_applyJournal(journal);
      expect(parent.innerHTML).toEqual(`AB`);
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
      parent.innerHTML = `<b></b>`;
      document.qVNodeData.set(parent, '{}');
      expect(vParent).toMatchVDOM(
        <test>
          <></>
        </test>
      );
    });
    it('should place attributes on Virtual', () => {
      parent.innerHTML = ``;
      document.qVNodeData.set(parent, '{?:sref_@:key_}');
      expect(vParent).toMatchVDOM(
        <test>
          <Fragment {...({ 'q:sref': ':sref_' } as any)} key=":key_" />
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
      vnode_setAttr(null, fragment1, 'q:id', '1');
      vnode_setAttr(null, fragment2, 'q:id', '2');
      vnode_setAttr(null, fragment3, 'q:id', '3');
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
    it('should insert at the end', () => {
      parent.innerHTML = '<b></b><i></i>';
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
      expect(parent.innerHTML).toBe('<b></b>INSERT<i></i>');
    });
  });
  describe('portal', () => {
    it('should link source-destination', () => {
      parent.innerHTML = 'AB';
      document.qVNodeData.set(parent, '{B||0B}{B|:|0A}');
      qVNodeRefs.set(0, vParent);
      const v1 = vnode_getFirstChild(vParent) as VirtualVNode;
      const v2 = vnode_getNextSibling(v1) as VirtualVNode;
      expect(v1).toMatchVDOM(<>A</>);
      expect(v2).toMatchVDOM(<>B</>);
      expect(vnode_getProp(v1, '', getVNode)).toBe(v2);
      expect(vnode_getProp(v2, ':', getVNode)).toBe(v1);
    });
  });
  describe('attributes', () => {
    describe('dangerouslySetInnerHTML', () => {
      it('should materialize without innerHTML children', () => {
        parent.innerHTML = '<div q:container="html"><i>content</i></div>';
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <div q:container="html" dangerouslySetInnerHTML="<i>content</i>" />
          </test>
        );
      });
      it('should update innerHTML', () => {
        parent.innerHTML = '<div q:container="html"><i>content</i></div>';
        const div = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_setAttr(journal, div, 'dangerouslySetInnerHTML', '<b>new content</b>');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div q:container="html"><b>new content</b></div>');
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <div q:container="html" dangerouslySetInnerHTML="<b>new content</b>" />
          </test>
        );
        expect(vnode_getAttr(div, 'dangerouslySetInnerHTML')).toBe('<b>new content</b>');
      });
      it('should have empty child for dangerouslySetInnerHTML', () => {
        parent.innerHTML = '<div q:container="html"><i>content</i></div>';
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
        parent.innerHTML = '<textarea q:container="text">content</textarea>';
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <textarea q:container="text" value="content" />
          </test>
        );
      });
      it('should update textContent', () => {
        parent.innerHTML = '<textarea q:container="text">content</textarea>';
        const textarea = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_setAttr(journal, textarea, 'value', 'new content');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<textarea q:container="text">new content</textarea>');
        expect(vParent).toMatchVDOM(
          <test>
            {/* @ts-ignore-next-line */}
            <textarea q:container="text" value="new content" />
          </test>
        );
        expect(vnode_getAttr(textarea, 'value')).toBe('new content');
      });
      it('should have empty child for value', () => {
        parent.innerHTML = '<textarea q:container="text">content</textarea>';
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
        parent.innerHTML = '<b>1</b><b>2</b><b>3</b>';
        const b1 = vnode_getFirstChild(vParent) as ElementVNode;
        const b2 = vnode_getNextSibling(b1) as ElementVNode;
        const b3 = vnode_getNextSibling(b2) as ElementVNode;
        vnode_remove(journal, vParent, b2, true);
        expect(vParent).toMatchVDOM(
          <test>
            <b>1</b>
            <b>3</b>
          </test>
        );
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<b>1</b><b>3</b>');
        vnode_remove(journal, vParent, b1, true);
        expect(vParent).toMatchVDOM(
          <test>
            <b>3</b>
          </test>
        );
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<b>3</b>');
        vnode_remove(journal, vParent, b3, true);
        expect(vParent).toMatchVDOM(<test></test>);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('');
      });
      it.todo('should remove virtual');
    });
    describe('vnode_setAttr', () => {
      it('should set attribute', () => {
        parent.innerHTML = '<div foo="bar"></div>';
        const div = vnode_getFirstChild(vParent) as ElementVNode;
        vnode_setAttr(journal, div, 'key', '123');
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div foo="bar" key="123"></div>');
        vnode_setAttr(journal, div, 'foo', null);
        vnode_applyJournal(journal);
        expect(parent.innerHTML).toBe('<div key="123"></div>');
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
        const b = vnode_getNextSibling(a) as TextVNode;
        vnode_setText(journal, b, '123');
        expect(parent.innerHTML).toBe('ABC');
        expect(parent.firstChild?.nodeValue).toEqual('ABC');
        vnode_applyJournal(journal);
        expect(parent.firstChild?.nodeValue).toEqual('A');
        expect(parent.innerHTML).toBe('A123C');
      });
    });
  });
  describe('vnode_documentPosition', () => {
    it('should compare two elements', () => {
      parent.innerHTML = '<b></b><i></i>';
      const b = vnode_getFirstChild(vParent) as ElementVNode;
      const i = vnode_getNextSibling(b) as ElementVNode;
      expect(vnode_documentPosition(b, i)).toBe(-1);
      expect(vnode_documentPosition(i, b)).toBe(1);
    });
    it('should compare two virtual vNodes', () => {
      parent.innerHTML = 'AB';
      document.qVNodeData.set(parent, '{B}{B}');
      const a = vnode_getFirstChild(vParent) as ElementVNode;
      const b = vnode_getNextSibling(a) as ElementVNode;
      expect(vnode_documentPosition(a, b)).toBe(-1);
      expect(vnode_documentPosition(b, a)).toBe(1);
    });
    it('should compare two virtual vNodes', () => {
      parent.innerHTML = 'AB';
      document.qVNodeData.set(parent, '{{B}}{B}');
      const a = vnode_getFirstChild(vParent) as ElementVNode;
      const a2 = vnode_getFirstChild(a) as ElementVNode;
      const b = vnode_getNextSibling(a) as ElementVNode;
      expect(vnode_documentPosition(a2, b)).toBe(-1);
      expect(vnode_documentPosition(b, a2)).toBe(1);
    });
  });
});
