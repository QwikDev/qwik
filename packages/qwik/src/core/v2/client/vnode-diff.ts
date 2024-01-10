import { assertDefined, assertTrue } from '../../error/assert';
import { Fragment, Virtual, isJSXNode } from '../../render/jsx/jsx-runtime';
import { Slot } from '../../render/jsx/slot.public';
import { isSignal } from '../../state/signal';
import { throwErrorAndStop } from '../../util/log';
import {
  VNodeProps,
  type ElementVNode,
  type FragmentVNode,
  type TextVNode,
  type VNode,
} from './types';
import {
  mapArray_set,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNode,
  vnode_getText,
  vnode_getType,
  vnode_insertChildAfter,
  vnode_isTextVNode,
  vnode_newDeflatedElement,
  vnode_newInflatedElement,
  vnode_newInflatedText,
  vnode_setProp,
  vnode_setText,
  vnode_truncate,
} from './vnode';
import type { JSXNode } from '../../render/jsx/types/jsx-node';
import type { SsrAttrs } from '../ssr/types';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { VNodeDataFlag } from '../ssr/vnode-data';

export type VNodeJournalEntry = VNodeJournalOpCode | VNode | null | string;

export const enum VNodeJournalOpCode {
  ////////// Generic

  /// ENCODING
  /// 1. VNodeToRemove
  Insert,
  Truncate,
  Remove,
  ////////// TEXT
  TextSet,
  ////////// Element
  ElementInsert,
  Attributes,
  ////////// Fragment
  FragmentInsert,
}

export const vnode_diff = (journal: VNodeJournalEntry[], jsxNode: JSXNode<any>, vNode: VNode) => {
  let infiniteLoopGuard = 10;
  const queue: any[] = [];
  const document = vnode_getNode(vNode).ownerDocument!;
  let vParent: VNode = null!;
  let vCurrent: VNode | null = vNode;
  let vPrevious: VNode | null = vNode;
  let jsxChildren: any[] = null!;
  let jsxValue: any = null;
  let jsxIdx = 0;
  let jsxCount = 0;
  descend(jsxNode.children);

  while (queue.length) {
    while (jsxIdx < jsxCount) {
      if (infiniteLoopGuard-- < 0) {
        throw new Error('Infinite loop detected.');
      }
      if (typeof jsxValue === 'string') {
        expectText(jsxValue);
      } else if (jsxValue === 'number') {
        expectText(String(jsxValue));
      } else if (jsxValue === 'boolean') {
        expectText('');
      } else if (typeof jsxValue === 'object') {
        if (isSignal(jsxValue)) {
          throw new Error('implement');
        } else if (isJSXNode(jsxValue)) {
          const type = jsxValue.type;
          if (typeof type === 'string') {
            expectNoMoreTextNodes();
            expectElement(jsxValue, type);
            descend(jsxValue.children);
          } else if (type === Fragment) {
            expectFragment();
          } else if (type === Slot) {
            expectSlot();
          } else if (type === Virtual) {
            expectComponent();
          } else {
            throwErrorAndStop(`Unsupported type: ${type}`);
          }
        } else {
          throwErrorAndStop(`Unsupported value: ${jsxValue}`);
        }
      }
      advance();
    }
    expectNoMore();
    ascend();
  }

  //////////////////////////////////////////////
  //////////////////////////////////////////////
  //////////////////////////////////////////////

  function expectNoMore() {
    if (vCurrent !== null) {
      journal.push(VNodeJournalOpCode.Truncate, vParent, vPrevious);
    }
  }

  function expectNoMoreTextNodes() {}

  function expectElement(jsx: JSXNode<any>, tag: string) {
    console.log('ELEMENT', tag);
    let jsxAttrs = (jsx as any as { attrs: SsrAttrs }).attrs;
    if (jsxAttrs === EMPTY_ARRAY) {
      const props = jsx.props;
      for (const key in props) {
        if (jsxAttrs === EMPTY_ARRAY) {
          jsxAttrs = (jsx as any as { attrs: SsrAttrs }).attrs = [];
        }
        mapArray_set(jsxAttrs, key, String(props[key]), 0);
      }
    }
    const type = vCurrent ? vnode_getType(vCurrent) : 0;
    if (
      vCurrent === null ||
      type !== 1 /* Element */ ||
      vnode_getElementName(vCurrent as ElementVNode) !== tag
    ) {
      journal.push(
        VNodeJournalOpCode.Insert,
        vParent,
        vPrevious,
        (vCurrent = vnode_newInflatedElement(vParent, document.createElement(tag), tag))
      );
    }
    setBulkProps(vCurrent as ElementVNode, jsxAttrs);
  }

  function setBulkProps(vnode: ElementVNode, srcAttrs: SsrAttrs) {
    const dstAttrs = vnode as SsrAttrs;
    let hasDiffs = false;
    let srcIdx = 0;
    const srcLength = srcAttrs.length;
    let dstIdx = VNodeProps.propsStart;
    const dstLength = dstAttrs.length;
    let srcKey: string | null = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
    let dstKey: string | null = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
    const record = (key: string, value: string | null) => {
      if (!hasDiffs) {
        journal.push(VNodeJournalOpCode.Attributes, vnode);
        hasDiffs = true;
      }
      journal.push(key, value);
    };
    while (srcKey !== null && dstKey !== null) {
      if (srcKey == dstKey) {
        const srcValue = srcAttrs[srcIdx++];
        const dstValue = dstAttrs[dstIdx++];
        if (srcValue !== dstValue) {
          record(dstKey, srcValue);
        }
        srcKey = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
        dstKey = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
      } else if (srcKey < dstKey) {
        // Destination is missing the key, so we need to insert it.
        const srcValue = srcAttrs[srcIdx++];
        record(srcKey, srcValue);
        // advance srcValue
        srcKey = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
      } else {
        // Source is missing the key, so we need to remove it from destination.
        record(dstKey, null);
        journal.push(dstKey, null);
        dstIdx++; // skip the destination value, we don't care about it.
        dstKey = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
      }
    }
    while (srcIdx < srcLength) {
      // Source has more keys, so we need to insert them.
      record(srcKey, srcAttrs[srcIdx++]);
      srcKey = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
    }
    while (dstIdx < dstLength) {
      // Destination has more keys, so we need to remove them.
      record(dstKey, null);
      dstKey = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
      dstIdx++; // skip the destination value, we don't care about it.
    }
    console.log('JOURNAL', journal);
  }

  function expectFragment() {}

  function expectSlot() {}

  function expectComponent() {}

  function advance() {
    jsxIdx++;
    jsxValue = jsxIdx < jsxCount ? jsxChildren[jsxIdx] : null;
    vPrevious = vCurrent;
    vCurrent = vCurrent ? vnode_getNextSibling(vCurrent) : null;
  }

  function ascend() {
    jsxValue = queue.pop();
    jsxCount = queue.pop();
    jsxIdx = queue.pop();
    jsxChildren = queue.pop();
    vCurrent = queue.pop();
    vPrevious = queue.pop();
    vParent = queue.pop();
    advance();
  }

  function descend(children: any) {
    queue.push(vParent, vPrevious, vCurrent, jsxChildren, jsxIdx, jsxCount, jsxValue);
    if (Array.isArray(children)) {
      jsxIdx = 0;
      jsxCount = children.length;
      jsxChildren = children;
      jsxValue = jsxCount > 0 ? children[0] : null;
    } else if (children === undefined) {
      // no children
      jsxIdx = 0;
      jsxValue = null;
      jsxChildren = null!;
      jsxCount = 0;
    } else {
      jsxIdx = 0;
      jsxValue = children;
      jsxChildren = null!;
      jsxCount = 1;
    }
    assertDefined(vCurrent, 'Expecting vCurrent to be defined.');
    vParent = vCurrent!;
    vCurrent = vnode_getFirstChild(vParent);
    vPrevious = null;
  }

  function expectText(text: string) {
    if (vCurrent !== null) {
      const type = vnode_getType(vCurrent);
      if (type === 3 /* Text */) {
        if (text !== vnode_getText(vCurrent as TextVNode)) {
          journal.push(VNodeJournalOpCode.TextSet, vCurrent, text);
          return;
        }
        return;
      }
    }
    journal.push(
      VNodeJournalOpCode.Insert,
      vParent,
      vPrevious,
      vnode_newInflatedText(vParent, document.createTextNode(text), text)
    );
  }
};

export const vnode_applyJournal = (journal: VNodeJournalEntry[]) => {
  let idx = 0;
  while (idx < journal.length) {
    const opCode = journal[idx++] as number;
    assertTrue(typeof opCode === 'number', 'Expecting opCode to be a number.');
    switch (opCode) {
      case VNodeJournalOpCode.TextSet:
        vnode_setText(journal[idx++] as TextVNode, journal[idx++] as string);
        break;
      case VNodeJournalOpCode.Insert:
        vnode_insertChildAfter(
          journal[idx++] as ElementVNode | FragmentVNode,
          journal[idx++] as VNode,
          journal[idx++] as VNode
        );
        break;
      case VNodeJournalOpCode.Truncate:
        vnode_truncate(
          journal[idx++] as ElementVNode | FragmentVNode,
          journal[idx++] as VNode | null
        );
        break;
      case VNodeJournalOpCode.Attributes:
        const vnode = journal[idx++] as ElementVNode;
        let key: string | null = null;
        while (typeof (key = journal[idx] as string | null) === 'string') {
          idx++;
          vnode_setProp(vnode, key, journal[idx++] as string | null);
        }
        break;
      default:
        throwErrorAndStop(`Unsupported opCode: ${opCode}`);
    }
  }
};
