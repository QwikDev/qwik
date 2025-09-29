import { Fragment, _fnSignal, _jsxSorted } from '@qwik.dev/core';
import { vnode_fromJSX } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import { vnode_applyJournal, vnode_getFirstChild, vnode_getNode } from './vnode';
import { vnode_diff } from './vnode-diff';
import type { QElement } from '../shared/types';
import { createSignal } from '../reactive-primitives/signal-api';
import { QError, qError } from '../shared/error/error';
import { VNodeFlags } from './types';
import type { VirtualVNode } from './vnode-impl';

describe('vNode-diff', () => {
  it('should find no difference', () => {
    const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_0">Hello</div>);
    expect(vNode).toMatchVDOM(<div>Hello</div>);
    expect(vnode_getNode(vNode!)!.ownerDocument!.body.innerHTML).toEqual(
      '<div q:key="KA_0">Hello</div>'
    );
    vnode_diff(container, <div key="KA_0">Hello</div>, vParent, null);
    expect(container.$journal$.length).toEqual(0);
  });

  describe('text', () => {
    it('should update text', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_0">Hello</div>);
      vnode_diff(container, <div key="KA_0">World</div>, vParent, null);
      expect(vNode).toMatchVDOM(<div>World</div>);
      expect(container.$journal$).not.toEqual([]);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">Hello</div>');
      vnode_applyJournal(container.$journal$);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">World</div>');
    });

    it('should add missing text node', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_0"></div>);
      vnode_diff(container, <div key="KA_0">Hello</div>, vParent, null);
      expect(vNode).toMatchVDOM(<div key="KA_0">Hello</div>);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0"></div>');
      vnode_applyJournal(container.$journal$);
      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">Hello</div>');
    });

    it('should update and add missing text node', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_6">text</div>);
      vnode_diff(container, <div key="KA_6">Hello {'World'}</div>, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(<div key="KA_6">Hello {'World'}</div>);
    });

    it('should remove extra text nodes', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_6">text{'removeMe'}</div>);
      vnode_diff(container, <div key="KA_6">Hello</div>, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(<div key="KA_6">Hello</div>);
    });
    it('should remove all text nodes', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(container, <div></div>, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(<div></div>);
    });
    it('should treat undefined as no children', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div>text{'removeMe'}</div>);
      vnode_diff(container, <div>{undefined}</div>, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(<div></div>);
    });
  });
  describe('element', () => {
    it('should do nothing on same', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
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
      vnode_diff(container, test, vParent, null);
      expect(vNode).toMatchVDOM(test);
      expect(container.$journal$.length).toEqual(0);
    });
    it('should add missing element', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<test key="KA_6"></test>);
      const test = (
        <test key="KA_6">
          <span class="B" about="ABOUT"></span>
        </test>
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });
    it('should remove extra text node', async () => {
      const { vNode, vParent, container } = vnode_fromJSX(
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
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
      await expect(container.document.querySelector('test')).toMatchDOM(test);
    });
  });

  describe('attributes', () => {
    it('should update attributes', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'foo',
            id: 'a',
            'on:click': () => null,
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'bar',
          id: 'b',
          onClick: () => null,
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should remove attributes - case 1', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'name',
            id: 'a',
            test: 'value',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'name',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should remove attributes - case 2', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'name',
            id: 'a',
            test: 'value',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          id: 'a',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should remove attributes - case 3', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'name',
            id: 'a',
            test: 'value',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          test: 'value',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should remove attributes - case 4', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'name',
            id: 'a',
            test: 'value',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted('span', {}, null, [], 0, null);
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should add attributes - case 1', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            about: 'name',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'name',
          id: 'a',
          test: 'value',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should add attributes - case 2', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            id: 'a',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'name',
          id: 'a',
          test: 'value',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should add attributes - case 3', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'span',
          {
            test: 'value',
          },
          null,
          [],
          0,
          null
        )
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'name',
          id: 'a',
          test: 'value',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });

    it('should add attributes - case 4', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted('span', {}, null, [], 0, null)
      );
      const test = _jsxSorted(
        'span',
        {
          about: 'name',
          id: 'a',
          test: 'value',
        },
        null,
        [],
        0,
        null
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
    });
  });

  describe('keys', () => {
    it('should not reuse element because old has a key and new one does not', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted('test', {}, null, [_jsxSorted('b', {}, null, 'old', 0, '1')], 0, 'KA_6')
      );
      const test = _jsxSorted(
        'test',
        {},
        null,
        [_jsxSorted('b', {}, null, 'new', 0, null)],
        0,
        'KA_6'
      );
      const bOriginal = container.document.querySelector('b[q\\:key=1]')!;
      expect(bOriginal).toBeDefined();
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
      const bSecond = container.document.querySelector('b')!;
      expect(bSecond).toBeDefined();
      expect(bSecond).not.toBe(bOriginal);
    });
    it('should reuse elements if keys match', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'test',
          {},
          null,
          [_jsxSorted('b', {}, null, '1', 0, '1'), _jsxSorted('b', {}, null, '2', 0, '2')],
          0,
          'KA_6'
        )
      );
      const test = _jsxSorted(
        'test',
        {},
        null,
        [
          _jsxSorted('b', {}, null, 'before', 0, null),
          _jsxSorted('b', {}, null, '2', 0, '2'),
          _jsxSorted('b', {}, null, '3', 0, '3'),
          _jsxSorted('b', {}, null, 'in', 0, null),
          _jsxSorted('b', {}, null, '1', 0, '1'),
          _jsxSorted('b', {}, null, 'after', 0, null),
        ],
        0,
        'KA_6'
      );
      const selectB1 = () => container.document.querySelector('b[q\\:key=1]')!;
      const selectB2 = () => container.document.querySelector('b[q\\:key=2]')!;
      const b1 = selectB1();
      const b2 = selectB2();
      expect(b1).toBeDefined();
      expect(b2).toBeDefined();
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
      expect(b1).toBe(selectB1());
      expect(b2).toBe(selectB2());
    });
  });
  describe('fragments', () => {
    it('should not rerender signal wrapper fragment', async () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted('div', {}, null, [_jsxSorted(Fragment, {}, null, ['1'], 0, null)], 0, null)
      );
      const test = _jsxSorted('div', {}, null, [_fnSignal(() => '2', [], '() => "2"')], 0, null);
      const expected = _jsxSorted(
        'div',
        {},
        null,
        [_jsxSorted(Fragment, {}, null, ['2'], 0, null)],
        0,
        null
      );

      const signalFragment = vnode_getFirstChild(vNode!) as VirtualVNode;
      expect(signalFragment).toBeDefined();

      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(expected);
      expect(signalFragment).toBe(vnode_getFirstChild(vNode!));
    });

    it('should not rerender promise wrapper fragment', async () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted('div', {}, null, [_jsxSorted(Fragment, {}, null, ['1'], 0, null)], 0, null)
      );
      const test = _jsxSorted('div', {}, null, [Promise.resolve('2')], 0, null);
      const expected = _jsxSorted(
        'div',
        {},
        null,
        [_jsxSorted(Fragment, {}, null, ['2'], 0, null)],
        0,
        null
      );

      const promiseFragment = vnode_getFirstChild(vNode!) as VirtualVNode;
      expect(promiseFragment).toBeDefined();

      await vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(expected);
      expect(promiseFragment).toBe(vnode_getFirstChild(vNode!));
    });

    it('should rerender fragment if no key', async () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted('div', {}, null, [_jsxSorted(Fragment, {}, null, ['1'], 0, null)], 0, null)
      );
      const test = _jsxSorted(
        'div',
        {},
        null,
        [_jsxSorted(Fragment, {}, null, ['2'], 0, null)],
        0,
        null
      );

      const fragment = vnode_getFirstChild(vNode!) as VirtualVNode;
      expect(fragment).toBeDefined();

      await vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
      expect(fragment).not.toBe(vnode_getFirstChild(vNode!));
    });
  });
  describe('attributes', () => {
    describe('const props', () => {
      it('should set attributes', async () => {
        const { vParent, container } = vnode_fromJSX(<Fragment></Fragment>);
        const test = _jsxSorted('span', {}, { class: 'abcd', id: 'b' }, null, 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        const firstChildNode = vnode_getNode(firstChild) as Element;
        await expect(firstChildNode).toMatchDOM(test);
      });

      // todo: add more tests for const props
    });

    describe('var props', () => {
      it('should set attributes', () => {
        const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
        const test = _jsxSorted(
          'span',
          {
            id: 'a',
            class: 'test',
          },
          null,
          [],
          0,
          null
        );
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
      });

      it('should remove attributes', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted(
            'span',
            {
              id: 'a',
              class: 'test',
            },
            null,
            [],
            0,
            null
          )
        );
        const test = _jsxSorted('span', {}, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
      });

      it('should update attributes', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted(
            'span',
            {
              id: 'a',
              class: 'test',
            },
            null,
            [],
            0,
            null
          )
        );
        const test = _jsxSorted(
          'span',
          {
            id: 'b',
            class: 'updated',
          },
          null,
          [],
          0,
          null
        );
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
      });

      it('should skip props starting with handler prefix (colon)', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { ':::onClick$': () => null }, null, [], 0, null)
        );
        const test = _jsxSorted(
          'span',
          {
            ':::onClick$': () => null,
            id: 'a',
          },
          null,
          [],
          0,
          null
        );
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        expect(vnode_getFirstChild(vParent)).toMatchVDOM(<span id="a"></span>);
      });

      it('should skip props starting with q prefix (q:)', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { 'q:id': 'abcd' }, null, [], 0, null)
        );
        const test = _jsxSorted(
          'span',
          {
            'q:id': 'abcd',
            id: 'a',
          },
          null,
          [],
          0,
          null
        );
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        expect(vnode_getFirstChild(vParent)).toMatchVDOM(<span id="a"></span>);
      });

      it('should add qDispatchEvent for existing html event attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'a', 'on:click': 'abcd' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'a' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).not.toBeDefined();
      });

      it('should add qDispatchEvent for existing html event attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'a', 'on:click': 'abcd' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'a', onClick$: 'abcd' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      it('should add qDispatchEvent for new jsx event attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'a' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'a', onClick$: () => null }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      it('should add qDispatchEvent for existing html event attribute and new jsx event attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'a', 'on:click': 'abcd' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'a', onClick$: () => null }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      it('should change to alphabetically later attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { name: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically later attribute and add a new one', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { name: 'bbb', title: 'ccc' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically later attribute and add a remove one', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { id: 'aaa', title: 'ccc' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { name: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically earlier attribute', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { name: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically earlier attribute and add a new one', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { name: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'bbb', title: 'ccc' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically earlier attribute and remove a new one', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { name: 'aaa', title: 'ccc' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { id: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
      });

      it('should change to alphabetically later event attribute and add qDispatchEvent', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { onDblClick$: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { onClick$: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      it('should change to alphabetically earlier event attribute and add qDispatchEvent', () => {
        const { vParent, container } = vnode_fromJSX(
          _jsxSorted('span', { onClick$: 'aaa' }, null, [], 0, null)
        );
        const test = _jsxSorted('span', { onDblClick$: 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(test);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      it('should add event scope to element add qDispatchEvent', () => {
        const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
        const test = _jsxSorted('span', { 'window:onClick$': 'bbb' }, null, [], 0, null);
        vnode_diff(container, test, vParent, null);
        vnode_applyJournal(container.$journal$);
        const firstChild = vnode_getFirstChild(vParent);
        expect(firstChild).toMatchVDOM(<span on-window:click></span>);
        const element = vnode_getNode(firstChild) as QElement;
        expect(element.qDispatchEvent).toBeDefined();
      });

      describe('ref', () => {
        it('should handle ref signal attribute', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const signal = createSignal();
          const test = _jsxSorted('span', { ref: signal }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span></span>);
          expect(signal.value).toBe(vnode_getNode(firstChild));
        });

        it('should handle ref function attribute', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          (globalThis as any).node = undefined;
          const test = _jsxSorted(
            'span',
            { ref: (element: Element) => ((globalThis as any).node = element) },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span></span>);
          expect((globalThis as any).node).toBe(vnode_getNode(firstChild));
          (globalThis as any).node = undefined;
        });

        it('should handle null ref value attribute', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const test = _jsxSorted('span', { ref: null }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span></span>);
        });

        it('should throw error for invalid ref attribute', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const test = _jsxSorted('span', { ref: 'abc' }, null, [], 0, null);
          expect(() => {
            vnode_diff(container, test, vParent, null);
          }).toThrowError(qError(QError.invalidRefValue, [null]));
        });
      });

      describe('signal', () => {
        it('should handle signal attribute', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const signal = createSignal('test');
          const test = _jsxSorted('span', { class: signal }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span class="test"></span>);
        });
      });
    });
  });

  describe('deleted parent', () => {
    it('should ignore diff when parent is deleted', () => {
      const { vNode, vParent, container } = vnode_fromJSX(<div key="KA_0">Hello</div>);

      vParent.flags |= VNodeFlags.Deleted;

      vnode_diff(container, <div key="KA_0">World</div>, vParent, null);

      expect(container.$journal$.length).toEqual(0);

      expect((vnode_getNode(vNode) as Element).outerHTML).toEqual('<div q:key="KA_0">Hello</div>');
    });
  });
});
