import { afterEach, describe, expect, it } from 'vitest';
import { vnode_fromJSX } from '@builder.io/qwik/testing';
import { vnode_applyJournal, vnode_getNode, type VNodeJournal } from './vnode';
import { vnode_diff } from './vnode-diff';
import { _jsxQ } from '@builder.io/qwik';

describe('vNode-diff', () => {
  const journal: VNodeJournal = [];
  const scheduler = { $drainCleanup$: () => null };
  afterEach(() => {
    journal.length = 0;
  });

  it('should find no difference', () => {
    const { vNode, vParent, document } = vnode_fromJSX(<div key="KA_0">Hello</div>);
    expect(vNode).toMatchVDOM(<div>Hello</div>);
    expect(vnode_getNode(vNode!)!.ownerDocument!.body.innerHTML).toEqual(
      '<div q:key="KA_0">Hello</div>'
    );
    vnode_diff({ $journal$: journal, document } as any, <div key="KA_0">Hello</div>, vParent, null);
    expect(journal.length).toEqual(0);
  });

  describe('text', () => {
    it('should update text', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div key="KA_0">Hello</div>);
      vnode_diff(
        { $journal$: journal, document } as any,
        <div key="KA_0">World</div>,
        vParent,
        null
      );
      expect(vNode).toMatchVDOM(<div>World</div>);
      expect(journal).not.toEqual([]);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">Hello</div>');
      vnode_applyJournal(journal);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">World</div>');
    });

    it('should add missing text node', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div key="KA_0"></div>);
      vnode_diff(
        { $journal$: journal, document } as any,
        <div key="KA_0">Hello</div>,
        vParent,
        null
      );
      expect(vNode).toMatchVDOM(<div key="KA_0">Hello</div>);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0"></div>');
      vnode_applyJournal(journal);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">Hello</div>');
    });

    it('should update and add missing text node', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div key="KA_6">text</div>);
      vnode_diff(
        { $journal$: journal, document } as any,
        <div key="KA_6">Hello {'World'}</div>,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div key="KA_6">Hello {'World'}</div>);
    });

    it('should remove extra text nodes', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div key="KA_6">text{'removeMe'}</div>);
      vnode_diff(
        { $journal$: journal, $scheduler$: scheduler, document } as any,
        <div key="KA_6">Hello</div>,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div key="KA_6">Hello</div>);
    });
    it('should remove all text nodes', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(
        { $journal$: journal, $scheduler$: scheduler, document } as any,
        <div></div>,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div></div>);
    });
    it('should treat undefined as no children', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(
        { $journal$: journal, $scheduler$: scheduler, document } as any,
        <div>{undefined}</div>,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(<div></div>);
    });
  });
  describe('element', () => {
    it('should do nothing on same', () => {
      expect(journal.length).toEqual(0);
      const { vNode, vParent, document } = vnode_fromJSX(
        <test key="KA_0">
          <span key="KA_1"></span>
          <b key="KA_2"></b>
        </test>
      );
      const test = (
        <test key="KA_0">
          <span key="KA_1"></span>
          <b key="KA_2"></b>
        </test>
      );
      vnode_diff({ $journal$: journal, document } as any, test, vParent, null);
      expect(vNode).toMatchVDOM(test);
      expect(journal.length).toEqual(0);
    });
    it('should add missing element', () => {
      const { vNode, vParent, document } = vnode_fromJSX(<test key="KA_6"></test>);
      const test = (
        <test key="KA_6">
          <span class="B" about="ABOUT"></span>
        </test>
      );
      vnode_diff({ $journal$: journal, document } as any, test, vParent, null);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
    });
    it('should update attributes', () => {
      // here we need tu "emulate" the var props
      const { vNode, vParent, document } = vnode_fromJSX(
        _jsxQ(
          'test',
          {},
          null,
          [
            _jsxQ(
              'span',
              {
                id: 'a',
                about: 'name',
              },
              null,
              [],
              0,
              null
            ),
          ],
          0,
          null
        )
      );
      const test = _jsxQ(
        'test',
        {},
        null,
        [
          _jsxQ(
            'span',
            {
              class: 'B',
              about: 'ABOUT',
            },
            null,
            [],
            0,
            null
          ),
        ],
        0,
        null
      );
      vnode_diff({ $journal$: journal, document } as any, test, vParent, null);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
    });
    it('should remove extra text node', async () => {
      const { vNode, vParent, document } = vnode_fromJSX(
        <test key="0">
          {'before'}
          <span />
          {'after'}
        </test>
      );
      const test = (
        <test key="0">
          <span></span>
        </test>
      );
      vnode_diff(
        { $journal$: journal, $scheduler$: scheduler, document } as any,
        test,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
      await expect(document.querySelector('test')).toMatchDOM(test);
    });
  });
  describe('keys', () => {
    it('should not reuse element because old has a key and new one does not', () => {
      const { vNode, vParent, document } = vnode_fromJSX(
        <test key="KA_6">
          <b {...{ 'q:key': '1' }}>old</b>
        </test>
      );
      const test = (
        <test key="KA_6">
          <b>new</b>
        </test>
      );
      const bOriginal = document.querySelector('b[key=1]')!;
      vnode_diff(
        { $journal$: journal, $scheduler$: scheduler, document } as any,
        test,
        vParent,
        null
      );
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
      const bSecond = document.querySelector('b')!;
      expect(bSecond).not.toBe(bOriginal);
    });
    it('should reuse elements if keys match', () => {
      const { vNode, vParent, document } = vnode_fromJSX(
        <test key="KA_6">
          <b {...{ 'q:key': '1' }}>1</b>
          <b {...{ 'q:key': '2' }}>2</b>
        </test>
      );
      const test = (
        <test key="KA_6">
          <b>before</b>
          <b key="2">2</b>
          <b key="3">3</b>
          <b>in</b>
          <b key="1">1</b>
          <b>after</b>
        </test>
      );
      const b1 = document.querySelector('b[key=1]')!;
      const b2 = document.querySelector('b[key=1]')!;
      vnode_diff({ $journal$: journal, document } as any, test, vParent, null);
      vnode_applyJournal(journal);
      expect(vNode).toMatchVDOM(test);
      expect(b1).toBe(document.querySelector('b[key=1]')!);
      expect(b2).toBe(document.querySelector('b[key=2]')!);
    });
  });
  describe.todo('fragments', () => {});
  describe.todo('attributes', () => {});
});
