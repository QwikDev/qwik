import { afterEach, describe, expect, it } from 'vitest';
import { vnode_getNode } from './vnode';
import { vnode_applyJournal, vnode_diff, type VNodeJournalEntry } from './vnode-diff';
import { vnode_fromJSX } from '../vdom-diff.unit';

describe('vNode-diff', () => {
  const journal: VNodeJournalEntry[] = [];
  afterEach(() => {
    journal.length = 0;
  });

  it('should find no difference', () => {
    const { vNode, vParent } = vnode_fromJSX(<div>Hello</div>);
    expect(vNode).toMatchVDOM(<div>Hello</div>);
    expect(vnode_getNode(vNode!)!.ownerDocument!.body.innerHTML).toEqual('<div>Hello</div>');
    vnode_diff(journal, <div>Hello</div>, vParent);
    expect(journal.length).toEqual(0);
  });

  describe('text', () => {
    it('should update text', () => {
      const { vNode, vParent } = vnode_fromJSX(<div>Hello</div>);
      vnode_diff(journal, <div>World</div>, vParent);
      expect(vNode).toMatchVDOM(<div>Hello</div>);
      expect(journal).not.toEqual([]);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div>World</div>);
    });

    it('should add missing text node', () => {
      const { vNode, vParent } = vnode_fromJSX(<div></div>);
      vnode_diff(journal, <div>Hello</div>, vParent);
      expect(vNode).toMatchVDOM(<div></div>);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div>Hello</div>);
    });

    it('should update and add missing text node', () => {
      const { vNode, vParent } = vnode_fromJSX(<div>text</div>);
      vnode_diff(journal, <div>Hello {'World'}</div>, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div>Hello {'World'}</div>);
    });

    it('should remove extra text nodes', () => {
      const { vNode, vParent } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(journal, <div>Hello</div>, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div>Hello</div>);
    });
    it('should remove all text nodes', () => {
      const { vNode, vParent } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(journal, <div></div>, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div></div>);
    });
    it('should treat undefined as no children', () => {
      const { vNode, vParent } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(journal, <div>{undefined}</div>, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div></div>);
    });
  });
  describe('element', () => {
    it('should do nothing on same', () => {
      expect(journal.length).toEqual(0);
      const { vNode, vParent } = vnode_fromJSX(
        <test>
          <span></span>
          <b></b>
        </test>
      );
      const test = (
        <test>
          <span></span>
          <b></b>
        </test>
      );
      vnode_diff(journal, test, vParent);
      expect(journal.length).toEqual(0);
      expect(vNode).toMatchVDOM(test);
    });
    it('should add missing element', () => {
      const { vNode, vParent } = vnode_fromJSX(<test></test>);
      const test = (
        <test>
          <span class="B" about="ABOUT"></span>
        </test>
      );
      vnode_diff(journal, test, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
    });
    it('should update attributes', () => {
      const { vNode, vParent } = vnode_fromJSX(
        <test>
          <span id="a" about="name"></span>
        </test>
      );
      const test = (
        <test>
          <span class="B" about="ABOUT"></span>
        </test>
      );
      vnode_diff(journal, test, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
    });
    it('should remove extra text node', () => {
      const { vNode, vParent } = vnode_fromJSX(
        <test>
          {'before'}
          <span />
          {'after'}
        </test>
      );
      const test = (
        <test>
          <span></span>
        </test>
      );
      vnode_diff(journal, test, vParent);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
    });
  });
  describe.todo('fragments', () => {});
  describe.todo('attributes', () => {});
});
