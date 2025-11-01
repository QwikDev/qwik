import { Fragment, _fnSignal, _jsxSorted, component$, type JSXOutput } from '@qwik.dev/core';
import { vnode_fromJSX } from '@qwik.dev/core/testing';
import { describe, expect, it } from 'vitest';
import type { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { _hasStoreEffects, getOrCreateStore } from '../reactive-primitives/impl/store';
import type { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { createSignal } from '../reactive-primitives/signal-api';
import { StoreFlags } from '../reactive-primitives/types';
import { QError, qError } from '../shared/error/error';
import type { Scheduler } from '../shared/scheduler';
import type { QElement } from '../shared/types';
import { ChoreType } from '../shared/util-chore-type';
import { VNodeFlags } from './types';
import { vnode_applyJournal, vnode_getFirstChild, vnode_getNode } from './vnode';
import { vnode_diff } from './vnode-diff';
import type { VirtualVNode } from './vnode-impl';

async function waitForDrain(scheduler: Scheduler) {
  await scheduler(ChoreType.WAIT_FOR_QUEUE).$returnValue$;
}

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

    it('should remove or add keyed nodes', () => {
      const { vNode, vParent, container } = vnode_fromJSX(
        _jsxSorted(
          'test',
          {},
          null,
          [_jsxSorted('b', {}, null, '1', 0, '1'), _jsxSorted('b', {}, null, '2', 0, null)],
          0,
          'KA_6'
        )
      );
      const test = _jsxSorted(
        'test',
        {},
        null,
        [_jsxSorted('b', {}, null, '2', 0, null), _jsxSorted('b', {}, null, '2', 0, '2')],
        0,
        'KA_6'
      );
      vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vNode).toMatchVDOM(test);
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

    it('should render fragment if only text was available', async () => {
      const { vParent, container } = vnode_fromJSX('1');
      const test = Promise.resolve('2') as unknown as JSXOutput; //_jsxSorted(Fragment, {}, null, ['1'], 0, null);

      await vnode_diff(container, test, vParent, null);
      vnode_applyJournal(container.$journal$);
      expect(vParent).toMatchVDOM(
        <body>
          <Fragment>2</Fragment>
        </body>
      );
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

        describe('cleanup', () => {
          it('should cleanup effects when signal attribute is replaced with non-signal', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const signal = createSignal('initial') as SignalImpl;
            const test1 = _jsxSorted('span', { class: signal }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="initial"></span>);

            // Verify signal has effects registered
            expect(signal.$effects$).toBeDefined();
            expect(signal.$effects$!.size).toBeGreaterThan(0);

            // Replace signal with regular string value
            const test2 = _jsxSorted('span', { class: 'static' }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="static"></span>);

            // Verify effects have been cleaned up
            expect(signal.$effects$!.size).toBe(0);
          });

          it('should cleanup effects when signal attribute is replaced with another signal', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const signal1 = createSignal('first') as SignalImpl;
            const test1 = _jsxSorted('span', { class: signal1 }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="first"></span>);

            // Verify first signal has effects registered
            expect(signal1.$effects$).toBeDefined();
            expect(signal1.$effects$!.size).toBeGreaterThan(0);

            // Replace with another signal
            const signal2 = createSignal('second') as SignalImpl;
            const test2 = _jsxSorted('span', { class: signal2 }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="second"></span>);

            // Verify first signal's effects have been cleaned up
            expect(signal1.$effects$!.size).toBe(0);
            // Verify second signal has effects registered
            expect(signal2.$effects$).toBeDefined();
            expect(signal2.$effects$!.size).toBeGreaterThan(0);
          });

          it('should cleanup effects when attribute is removed', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const signal = createSignal('test') as SignalImpl;
            const test1 = _jsxSorted('span', { class: signal }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="test"></span>);

            // Verify signal has effects registered
            expect(signal.$effects$).toBeDefined();
            expect(signal.$effects$!.size).toBeGreaterThan(0);

            // Remove the attribute entirely
            const test2 = _jsxSorted('span', {}, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span></span>);

            // Verify effects have been cleaned up
            expect(signal.$effects$!.size).toBe(0);
          });
        });

        describe('wrapped cleanup', () => {
          it('should cleanup effects when wrapped signal attribute is replaced with non-signal', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const inner = createSignal('initial') as SignalImpl;
            const wrapped1 = _fnSignal(
              () => inner.value,
              [],
              '() => inner.value'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped1 }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="initial"></span>);

            // Verify inner signal has effects registered via wrapped signal
            expect(inner.$effects$).toBeDefined();
            expect(inner.$effects$!.size).toBeGreaterThan(0);
            // Verify wrapped signal has effects registered
            expect(wrapped1.$effects$).toBeDefined();
            expect(wrapped1.$effects$!.size).toBeGreaterThan(0);

            // Replace wrapped signal with regular string value
            const test2 = _jsxSorted('span', { class: 'static' }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="static"></span>);

            // Verify inner signal's effects have been cleaned up
            expect(inner.$effects$!.size).toBe(0);
            // Verify wrapped signal's effects have been cleaned up
            expect(wrapped1.$effects$!.size).toBe(0);
          });

          it('should cleanup effects when wrapped signal attribute is replaced with another wrapped signal', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const inner1 = createSignal('first') as SignalImpl;
            const wrapped1 = _fnSignal(
              () => inner1.value,
              [],
              '() => inner1.value'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped1 }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="first"></span>);

            // Verify first inner signal has effects registered
            expect(inner1.$effects$).toBeDefined();
            expect(inner1.$effects$!.size).toBeGreaterThan(0);
            // Verify first wrapped signal has effects registered
            expect(wrapped1.$effects$).toBeDefined();
            expect(wrapped1.$effects$!.size).toBeGreaterThan(0);

            // Replace with another wrapped signal using a different inner signal
            const inner2 = createSignal('second') as SignalImpl;
            const wrapped2 = _fnSignal(
              () => inner2.value,
              [],
              '() => inner2.value'
            ) as WrappedSignalImpl<any>;
            const test2 = _jsxSorted('span', { class: wrapped2 }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="second"></span>);

            // Verify first inner signal's effects have been cleaned up
            expect(inner1.$effects$!.size).toBe(0);
            // Verify first wrapped signal's effects have been cleaned up
            expect(wrapped1.$effects$!.size).toBe(0);
            // Verify second inner signal has effects registered
            expect(inner2.$effects$).toBeDefined();
            expect(inner2.$effects$!.size).toBeGreaterThan(0);
            // Verify second wrapped signal has effects registered
            expect(wrapped2.$effects$).toBeDefined();
            expect(wrapped2.$effects$!.size).toBeGreaterThan(0);
          });

          it('should cleanup effects when wrapped signal attribute is removed', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const inner = createSignal('test') as SignalImpl;
            const wrapped = _fnSignal(
              () => inner.value,
              [],
              '() => inner.value'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="test"></span>);

            // Verify inner signal has effects registered
            expect(inner.$effects$).toBeDefined();
            expect(inner.$effects$!.size).toBeGreaterThan(0);
            // Verify wrapped signal has effects registered
            expect(wrapped.$effects$).toBeDefined();
            expect(wrapped.$effects$!.size).toBeGreaterThan(0);

            // Remove the attribute entirely
            const test2 = _jsxSorted('span', {}, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span></span>);

            // Verify effects have been cleaned up
            expect(inner.$effects$!.size).toBe(0);
            expect(wrapped.$effects$!.size).toBe(0);
          });
        });

        describe('store wrapped cleanup', () => {
          it('should cleanup effects when store wrapped attribute is replaced with non-signal', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const store = getOrCreateStore({ cls: 'initial' }, StoreFlags.RECURSIVE, container);
            const wrapped1 = _fnSignal(
              () => store.cls,
              [],
              '() => store.cls'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped1 }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="initial"></span>);

            // Verify store has effects registered for the property via wrapped signal
            expect(_hasStoreEffects(store as any, 'cls')).toBe(true);
            // Verify wrapped signal has effects registered
            expect(wrapped1.$effects$).toBeDefined();
            expect(wrapped1.$effects$!.size).toBeGreaterThan(0);

            // Replace wrapped signal with regular string value
            const test2 = _jsxSorted('span', { class: 'static' }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="static"></span>);

            // Verify store's effects have been cleaned up
            expect(_hasStoreEffects(store, 'cls')).toBe(false);
            // Verify wrapped signal's effects have been cleaned up
            expect(wrapped1.$effects$!.size).toBe(0);
          });

          it('should cleanup effects when store wrapped attribute is replaced with another store wrapped attribute', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const store1 = getOrCreateStore({ cls: 'first' }, StoreFlags.RECURSIVE, container);
            const wrapped1 = _fnSignal(
              () => store1.cls,
              [],
              '() => store1.cls'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped1 }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="first"></span>);

            // Verify first store has effects registered and wrapped has effects
            expect(_hasStoreEffects(store1 as any, 'cls')).toBe(true);
            expect(wrapped1.$effects$).toBeDefined();
            expect(wrapped1.$effects$!.size).toBeGreaterThan(0);

            // Replace with another wrapped signal using a different store
            const store2 = getOrCreateStore({ cls: 'second' }, StoreFlags.RECURSIVE, container);
            const wrapped2 = _fnSignal(
              () => store2.cls,
              [],
              '() => store2.cls'
            ) as WrappedSignalImpl<any>;
            const test2 = _jsxSorted('span', { class: wrapped2 }, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span class="second"></span>);

            // Verify first store/ wrapped effects have been cleaned up
            expect(_hasStoreEffects(store1 as any, 'cls')).toBe(false);
            expect(wrapped1.$effects$!.size).toBe(0);
            // Verify second store/ wrapped have effects registered
            expect(_hasStoreEffects(store2 as any, 'cls')).toBe(true);
            expect(wrapped2.$effects$).toBeDefined();
            expect(wrapped2.$effects$!.size).toBeGreaterThan(0);
          });

          it('should cleanup effects when store wrapped attribute is removed', () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
            const store = getOrCreateStore({ cls: 'test' }, StoreFlags.RECURSIVE, container);
            const wrapped = _fnSignal(
              () => store.cls,
              [],
              '() => store.cls'
            ) as WrappedSignalImpl<any>;
            const test1 = _jsxSorted('span', { class: wrapped }, null, [], 0, null);
            vnode_diff(container, test1, vParent, null);
            vnode_applyJournal(container.$journal$);
            const firstChild = vnode_getFirstChild(vParent);
            expect(firstChild).toMatchVDOM(<span class="test"></span>);

            // Verify store and wrapped have effects registered
            expect(_hasStoreEffects(store as any, 'cls')).toBe(true);
            expect(wrapped.$effects$).toBeDefined();
            expect(wrapped.$effects$!.size).toBeGreaterThan(0);

            // Remove the attribute entirely
            const test2 = _jsxSorted('span', {}, null, [], 0, null);
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            vnode_applyJournal(container.$journal$);
            expect(firstChild).toMatchVDOM(<span></span>);

            // Verify effects have been cleaned up
            expect(_hasStoreEffects(store as any, 'cls')).toBe(false);
            expect(wrapped.$effects$!.size).toBe(0);
          });
        });

        describe('component props differ subscriptions', () => {
          it('should not create duplicate subscription for wrapped signal prop when props differ', async () => {
            const { vParent, container } = vnode_fromJSX(_jsxSorted('div', {}, null, [], 0, null));

            const inner = createSignal('cls') as SignalImpl<string>;
            const wrapped = _fnSignal(
              () => inner.value,
              [],
              '() => inner.value'
            ) as WrappedSignalImpl<any>;

            const Child = component$((props: any) => {
              return <span class={props.cls.value}></span>;
            });

            // Initial render with wrapped signal prop
            const test1 = _jsxSorted(
              Child as unknown as any,
              null,
              { cls: wrapped, foo: 1 } as any,
              null,
              3,
              null
            ) as any;
            vnode_diff(container, test1, vParent, null);
            await waitForDrain(container.$scheduler$);
            vnode_applyJournal(container.$journal$);

            // Ensure one subscription exists for both wrapped and inner
            expect(wrapped.$effects$).not.toBeNull();
            const wrappedEffectsAfterFirst = wrapped.$effects$!.size;
            expect(wrappedEffectsAfterFirst).toBeGreaterThan(0);
            expect(inner.$effects$).not.toBeNull();
            const innerEffectsAfterFirst = inner.$effects$!.size;
            expect(innerEffectsAfterFirst).toBeGreaterThan(0);

            // Update unrelated prop to trigger propsDiffer without touching wrapped signal prop
            const test2 = _jsxSorted(
              Child as unknown as any,
              null,
              { cls: wrapped, foo: 2 } as any,
              null,
              3,
              null
            ) as any;
            container.$journal$ = [];
            vnode_diff(container, test2, vParent, null);
            await waitForDrain(container.$scheduler$);
            vnode_applyJournal(container.$journal$);

            // The number of effects should not increase (no duplicate subscriptions)
            expect(wrapped.$effects$!.size).toBe(wrappedEffectsAfterFirst);
            expect(inner.$effects$!.size).toBe(innerEffectsAfterFirst);
          });
        });
      });

      describe('edge cases and complex scenarios', () => {
        it('should handle empty source to multiple attributes', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const test = _jsxSorted(
            'span',
            { about: 'a', class: 'test', id: 'b', title: 't' },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle multiple attributes to empty', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted(
              'span',
              { about: 'a', class: 'test', id: 'b', title: 't' },
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

        it('should handle removing first and last attributes while keeping middle', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted(
              'span',
              { about: 'a', class: 'test', id: 'b', title: 't' },
              null,
              [],
              0,
              null
            )
          );
          const test = _jsxSorted('span', { class: 'test', id: 'b' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle adding first and last attributes while keeping middle', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { class: 'test', id: 'b' }, null, [], 0, null)
          );
          const test = _jsxSorted(
            'span',
            { about: 'a', class: 'test', id: 'b', title: 't' },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle interleaved add/remove/update operations', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { about: 'old', class: 'old', name: 'remove' }, null, [], 0, null)
          );
          const test = _jsxSorted(
            'span',
            { about: 'new', id: 'add', title: 'add2' },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle multiple consecutive removals at beginning', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3', z: '26' }, null, [], 0, null)
          );
          const test = _jsxSorted('span', { z: '26' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle multiple consecutive additions at beginning', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { z: '26' }, null, [], 0, null)
          );
          const test = _jsxSorted('span', { a: '1', b: '2', c: '3', z: '26' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle alternating src and dst keys', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { b: '2', d: '4', f: '6' }, null, [], 0, null)
          );
          const test = _jsxSorted('span', { a: '1', c: '3', e: '5' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle mixed normal attrs and events without special prefixes', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted(
              'span',
              { about: 'a', class: 'old', onClick$: () => null },
              null,
              [],
              0,
              null
            )
          );
          const test = _jsxSorted(
            'span',
            { class: 'new', id: 'b', onMouseOver$: () => null },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span class="new" id="b"></span>);
          const element = vnode_getNode(firstChild) as QElement;
          expect(element.qDispatchEvent).toBeDefined();
        });

        it('should handle multiple HTML event attributes being removed', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted(
              'span',
              { 'on:click': 'a', 'on:focus': 'b', 'on:mouseover': 'c', id: 'test' },
              null,
              [],
              0,
              null
            )
          );
          const test = _jsxSorted('span', { id: 'test' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(test);
          const element = vnode_getNode(firstChild) as QElement;
          expect(element.qDispatchEvent).not.toBeDefined();
        });

        it('should handle replacing HTML events with JSX events', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { 'on:click': 'a', 'on:mouseover': 'b' }, null, [], 0, null)
          );
          const test = _jsxSorted(
            'span',
            { onClick$: () => null, onMouseOver$: () => null },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          const element = vnode_getNode(firstChild) as QElement;
          expect(element.qDispatchEvent).toBeDefined();
        });

        it('should handle all attributes being updated to different values', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null)
          );
          const test = _jsxSorted('span', { a: '10', b: '20', c: '30' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle attributes with same values (no updates)', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null)
          );
          const test = _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          // Journal should be empty since no changes were made
          expect(container.$journal$.length).toEqual(0);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
        });

        it('should handle single attribute changes in various positions', () => {
          // Change first
          const { vParent: vParent1, container: container1 } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null)
          );
          const test1 = _jsxSorted('span', { a: 'NEW', b: '2', c: '3' }, null, [], 0, null);
          vnode_diff(container1, test1, vParent1, null);
          vnode_applyJournal(container1.$journal$);
          expect(vnode_getFirstChild(vParent1)).toMatchVDOM(test1);

          // Change middle
          const { vParent: vParent2, container: container2 } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null)
          );
          const test2 = _jsxSorted('span', { a: '1', b: 'NEW', c: '3' }, null, [], 0, null);
          vnode_diff(container2, test2, vParent2, null);
          vnode_applyJournal(container2.$journal$);
          expect(vnode_getFirstChild(vParent2)).toMatchVDOM(test2);

          // Change last
          const { vParent: vParent3, container: container3 } = vnode_fromJSX(
            _jsxSorted('span', { a: '1', b: '2', c: '3' }, null, [], 0, null)
          );
          const test3 = _jsxSorted('span', { a: '1', b: '2', c: 'NEW' }, null, [], 0, null);
          vnode_diff(container3, test3, vParent3, null);
          vnode_applyJournal(container3.$journal$);
          expect(vnode_getFirstChild(vParent3)).toMatchVDOM(test3);
        });

        it('should handle scoped events with different scopes', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const test = _jsxSorted(
            'span',
            { 'document:onClick$': () => null, 'window:onScroll$': () => null },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span on-document:click on-window:scroll></span>);
          const element = vnode_getNode(firstChild) as QElement;
          expect(element.qDispatchEvent).toBeDefined();
        });

        it('should handle complex mix: add/remove/update/keep', () => {
          const { vParent, container } = vnode_fromJSX(
            _jsxSorted(
              'span',
              {
                about: 'remove',
                class: 'update-old',
                id: 'keep',
                name: 'also-remove',
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
              class: 'update-new',
              id: 'keep',
              onClick$: () => null,
              title: 'add',
            },
            null,
            [],
            0,
            null
          );
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span class="update-new" id="keep" title="add"></span>);
          const element = vnode_getNode(firstChild) as QElement;
          expect(element.qDispatchEvent).toBeDefined();
        });

        it('should handle updating signal attribute values', () => {
          const { vParent, container } = vnode_fromJSX(_jsxSorted('span', {}, null, [], 0, null));
          const signal1 = createSignal('value1');
          const test1 = _jsxSorted('span', { class: signal1 }, null, [], 0, null);
          vnode_diff(container, test1, vParent, null);
          vnode_applyJournal(container.$journal$);
          const firstChild = vnode_getFirstChild(vParent);
          expect(firstChild).toMatchVDOM(<span class="value1"></span>);

          // Update with different signal
          const signal2 = createSignal('value2');
          const test2 = _jsxSorted('span', { class: signal2 }, null, [], 0, null);
          container.$journal$ = [];
          vnode_diff(container, test2, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(firstChild).toMatchVDOM(<span class="value2"></span>);
        });

        it('should handle very long attribute list', () => {
          const manyAttrs: Record<string, string> = {};
          const manyAttrsUpdated: Record<string, string> = {};
          for (let i = 0; i < 50; i++) {
            const key = `attr${String(i).padStart(3, '0')}`;
            manyAttrs[key] = `value${i}`;
            manyAttrsUpdated[key] = `updated${i}`;
          }

          const { vParent, container } = vnode_fromJSX(
            _jsxSorted('span', manyAttrs, null, [], 0, null)
          );
          const test = _jsxSorted('span', manyAttrsUpdated, null, [], 0, null);
          vnode_diff(container, test, vParent, null);
          vnode_applyJournal(container.$journal$);
          expect(vnode_getFirstChild(vParent)).toMatchVDOM(test);
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
