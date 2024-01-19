import { isQwikComponent, type Component, type OnRenderFn } from '../../component/component.public';
import { SERIALIZABLE_STATE } from '../../container/serializers';
import { assertDefined, assertTrue } from '../../error/assert';
import type { QRLInternal } from '../../qrl/qrl-class';
import { Fragment, isJSXNode } from '../../render/jsx/jsx-runtime';
import { Slot } from '../../render/jsx/slot.public';
import type { JSXNode } from '../../render/jsx/types/jsx-node';
import { isSignal } from '../../state/signal';
import { EMPTY_ARRAY } from '../../util/flyweight';
import { throwErrorAndStop } from '../../util/log';
import { ELEMENT_PROPS, OnRenderProp } from '../../util/markers';
import { isPromise } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import { executeComponent2 } from '../shared/component-execution';
import type { Container2, QElement2 } from '../shared/types';
import type { SsrAttrs } from '../ssr/types';
import {
  ElementVNodeProps,
  type ElementVNode,
  type TextVNode,
  type VNode,
  type VirtualVNode,
  type ClientContainer,
} from './types';
import {
  mapArray_set,
  vnode_ensureElementInflated,
  vnode_getClosestParentNode,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getNextSibling,
  vnode_getNode,
  vnode_getAttr,
  vnode_getProp,
  vnode_getText,
  vnode_getType,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isVirtualVNode,
  vnode_newElement,
  vnode_newText,
  vnode_newVirtual,
  vnode_remove,
  vnode_setAttr,
  vnode_setProp,
  vnode_setText,
  vnode_truncate,
} from './vnode';

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

export type ComponentQueue = Array<VNode>;

export const vnode_diff = (
  container: ClientContainer,
  jsxNode: JSXNode<any>,
  vStartNode: VNode
) => {
  const journal = container.$journal$;

  /**
   * Stack is used to keep track of the state of the traversal.
   *
   * We push current state into the stack before descending into the child, and we pop the state
   * when we are done with the child.
   */
  const stack: any[] = [];

  const componentQueue: Array<VNode | ValueOrPromise<JSXNode>> = [];

  ////////////////////////////////
  //// Traverse state variables
  ////////////////////////////////
  let vParent: VNode = null!;
  /// Current node we compare against. (Think of it as a cursor.)
  /// (Node can be null, if we are at the end of the list.)
  let vCurrent: VNode | null = null;
  /// When we insert new node we start it here so that we can descend into it.
  /// NOTE: it can't be stored in `vCurrent` because `vNewCurrent` is in journal
  /// and is not connected to the tree.
  let vNewNode: VNode | null = null;
  /// Current set of JSX children.
  let jsxChildren: any[] = null!;
  // Current JSX child.
  let jsxValue: any = null;
  let jsxIdx = 0;
  let jsxCount = 0;
  ////////////////////////////////

  diff(jsxNode, vStartNode);
  return drainComponentQueue();

  //////////////////////////////////////////////
  //////////////////////////////////////////////
  //////////////////////////////////////////////

  function diff(jsxNode: JSXNode<any>, vStartNode: VNode) {
    vParent = vStartNode;
    vNewNode = null;
    vCurrent = vnode_getFirstChild(vStartNode);
    stackPush(jsxNode, true);
    while (stack.length) {
      while (jsxIdx < jsxCount) {
        if (typeof jsxValue === 'string') {
          expectText(jsxValue);
        } else if (typeof jsxValue === 'number') {
          expectText(String(jsxValue));
        } else if (typeof jsxValue === 'object') {
          if (Array.isArray(jsxValue)) {
            descend(jsxValue, false);
            continue; // we just descended, skip advance()
          } else if (isSignal(jsxValue)) {
            throw new Error('implement');
          } else if (isJSXNode(jsxValue)) {
            const type = jsxValue.type;
            if (typeof type === 'string') {
              expectNoMoreTextNodes();
              expectElement(jsxValue, type);
              descend(jsxValue.children, true);
              continue; // we just descended, skip advance()
            } else if (type === Fragment) {
              expectNoMoreTextNodes();
              expectVirtual();
              descend(jsxValue.children, true);
              continue; // we just descended, skip advance()
            } else if (type === Slot) {
              expectSlot();
            } else if (isQwikComponent(type)) {
              expectNoMoreTextNodes();
              expectVirtual();
              expectComponent(type);
            } else {
              throwErrorAndStop(`Unsupported type: ${type}`);
            }
          } else {
            throwErrorAndStop(`Unsupported value: ${jsxValue}`);
          }
        } else {
          expectText('');
        }
        advance();
      }
      expectNoMore();
      ascend();
    }
  }

  function advance() {
    jsxIdx++;
    if (jsxIdx < jsxCount) {
      jsxValue = jsxChildren[jsxIdx];
    } else if (stack[stack.length - 1] === false) {
      // this was special `descendVNode === false` so pop and try again
      return ascend();
    }
    vNewNode = null;
    vCurrent = vCurrent ? vnode_getNextSibling(vCurrent) : null;
  }

  /**
   * @param children
   * @param descendVNode - If true we are descending into vNode; This is set to false if we come
   *   across an array in jsx, and we need to descend into the array without actually descending
   *   into the vNode.
   *
   *   Example:
   *
   *   ```
   *   <>
   *   before
   *   {[1,2].map((i) => <span>{i}</span>)}
   *   after
   *   </>
   * ```
   *
   *   In the above example all nodes are on same level so we don't `descendVNode` even thought there
   *   is an array produced by the `map` function.
   */
  function descend(children: any, descendVNode: boolean) {
    stackPush(children, descendVNode);
    if (descendVNode) {
      assertDefined(vCurrent || vNewNode, 'Expecting vCurrent to be defined.');
      vParent = vCurrent || vNewNode!;
      vCurrent = vnode_getFirstChild(vParent);
      vNewNode = null;
    }
  }

  function ascend() {
    const descendVNode = stack.pop(); // boolean: descendVNode
    if (descendVNode) {
      vCurrent = stack.pop();
      vParent = stack.pop();
    }
    jsxValue = stack.pop();
    jsxCount = stack.pop();
    jsxIdx = stack.pop();
    jsxChildren = stack.pop();
    advance();
  }

  function stackPush(children: any, descendVNode: boolean) {
    stack.push(jsxChildren, jsxIdx, jsxCount, jsxValue);
    if (descendVNode) {
      stack.push(vParent, vCurrent);
    }
    stack.push(descendVNode);
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
  }

  /////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////

  function drainComponentQueue(): ValueOrPromise<void> {
    while (componentQueue.length) {
      const jsxNode = componentQueue.shift() as ValueOrPromise<JSXNode>;
      const vHostNode = componentQueue.shift() as VNode;
      if (isPromise(jsxNode)) {
        return jsxNode.then((jsxNode) => {
          diff(jsxNode, vHostNode);
          return drainComponentQueue();
        });
      } else {
        diff(jsxNode, vHostNode);
      }
    }
  }

  function expectNoMore() {
    if (vCurrent !== null) {
      journal.push(VNodeJournalOpCode.Truncate, vParent, vCurrent);
    }
  }

  function expectNoMoreTextNodes() {
    while (vCurrent !== null && vnode_getType(vCurrent) === 3 /* Text */) {
      journal.push(VNodeJournalOpCode.Remove, vParent, vCurrent);
      vCurrent = vnode_getNextSibling(vCurrent);
    }
  }

  function expectElement(jsx: JSXNode<any>, tag: string) {
    if (vCurrent && vnode_isElementVNode(vCurrent)) {
      // All is good.
    } else {
      journal.push(
        VNodeJournalOpCode.Insert,
        vParent,
        (vNewNode = vnode_newElement(vParent, container.document.createElement(tag), tag)),
        vCurrent && vnode_getNextSibling(vCurrent)
      );
    }
    let jsxAttrs = (jsx as any as { attrs: SsrAttrs }).attrs;
    if (jsxAttrs === EMPTY_ARRAY) {
      const props = jsx.props;
      for (const key in props) {
        if (jsxAttrs === EMPTY_ARRAY) {
          jsxAttrs = (jsx as any as { attrs: SsrAttrs }).attrs = [];
        }
        mapArray_set(jsxAttrs, key, props[key], 0);
      }
    }
    setBulkProps((vNewNode || vCurrent) as ElementVNode, jsxAttrs);
  }

  function setBulkProps(vnode: ElementVNode, srcAttrs: SsrAttrs) {
    vnode_ensureElementInflated(vnode);
    const dstAttrs = vnode as SsrAttrs;
    let hasDiffs = false;
    let srcIdx = 0;
    const srcLength = srcAttrs.length;
    let dstIdx = ElementVNodeProps.PROPS_OFFSET;
    const dstLength = dstAttrs.length;
    let srcKey: string | null = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
    let dstKey: string | null = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
    let patchEventDispatch = false;
    const record = (key: string, value: any) => {
      if (!hasDiffs) {
        journal.push(VNodeJournalOpCode.Attributes, vnode);
        hasDiffs = true;
      }
      journal.push(key, value);
    };
    while (srcKey !== null || dstKey !== null) {
      if (srcKey == null) {
        // Source has more keys, so we need to remove them from destination
        if (dstKey?.startsWith('on:')) {
          patchEventDispatch = true;
        } else {
          record(dstKey!, null);
        }
        dstIdx++; // skip the destination value, we don't care about it.
        dstKey = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
      } else if (dstKey == null) {
        // Destination has more keys, so we need to insert them from source.
        const isEvent = srcKey.startsWith('on') && srcKey.endsWith('$');
        if (isEvent) {
          // Special handling for events
          patchEventDispatch = true;
        }
        record(srcKey!, srcAttrs[srcIdx++]);
        srcKey = srcIdx < srcLength ? srcAttrs[srcIdx++] : null;
      } else if (srcKey == dstKey) {
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
        dstIdx++; // skip the destination value, we don't care about it.
        dstKey = dstIdx < dstLength ? dstAttrs[dstIdx++] : null;
      }
    }
    if (patchEventDispatch) {
      const element = vnode_getNode(vnode) as QElement2;
      if (!element.qDispatchEvent) {
        element.qDispatchEvent = (event: Event) => {
          const eventName = event.type;
          const eventProp = 'on' + eventName.charAt(0).toUpperCase() + eventName.substring(1) + '$';
          const qrls = vnode_getProp(vnode, eventProp, null);
          let returnValue = false;
          qrls &&
            (Array.isArray(qrls) ? qrls : [qrls]).forEach((qrl) => {
              const value = qrl(event);
              returnValue = returnValue || value === true;
            });
          return returnValue;
        };
      }
    }
  }

  function expectVirtual() {
    if (vCurrent && vnode_isVirtualVNode(vCurrent)) {
      // All is good.
    } else {
      journal.push(
        VNodeJournalOpCode.Insert,
        vParent,
        (vNewNode = vnode_newVirtual(vParent)),
        vCurrent && vnode_getNextSibling(vCurrent)
      );
    }
  }

  function expectSlot() {
    throw new Error('IMPLEMENT');
  }

  function expectComponent(component: Component<any>) {
    const [componentQRL] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
    const host = (vCurrent || vNewNode) as VirtualVNode;
    const vNodeQrl = vnode_getProp<QRLInternal>(host, OnRenderProp, container.getObjectById);
    let shouldRender = false;
    if (componentQRL.$hash$ !== vNodeQrl?.$hash$) {
      vnode_setProp(host, OnRenderProp, componentQRL);
      shouldRender = true;
    }
    const vNodeProps = vnode_getProp<any>(host, ELEMENT_PROPS, container.getObjectById);
    const jsxPros = jsxValue.props;
    shouldRender = shouldRender || !shallowEqual(jsxPros, vNodeProps);
    if (shouldRender) {
      const jsx = executeComponent2(container, host, componentQRL, jsxPros);
      componentQueue.push(jsx, host);
    }
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
      vnode_newText(vParent, container.document.createTextNode(text), text),
      vCurrent
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
        vnode_insertBefore(
          journal[idx++] as ElementVNode | VirtualVNode,
          journal[idx++] as VNode,
          journal[idx++] as VNode
        );
        break;
      case VNodeJournalOpCode.Truncate:
        vnode_truncate(journal[idx++] as ElementVNode | VirtualVNode, journal[idx++] as VNode);
        break;
      case VNodeJournalOpCode.Remove:
        vnode_remove(journal[idx++] as ElementVNode | VirtualVNode, journal[idx++] as VNode);
        break;
      case VNodeJournalOpCode.Attributes:
        const vnode = journal[idx++] as ElementVNode;
        let key: string | null = null;
        while (typeof (key = journal[idx] as string | null) === 'string') {
          idx++;
          const value = journal[idx++] as string | null;
          if (key.startsWith('on') && key.endsWith('$')) {
            // special handling for events.
            vnode_setProp(vnode, key, value);
          } else {
            vnode_setAttr(vnode, key, value);
          }
        }
        break;
      default:
        throwErrorAndStop(`Unsupported opCode: ${opCode}`);
    }
  }
  journal.length = 0;
};

function shallowEqual(src: Record<string, any>, dst: Record<string, any>): boolean {
  let srcKeys = Object.keys(src);
  let dstKeys = Object.keys(dst);
  if (srcKeys.length !== dstKeys.length) {
    return false;
  }
  srcKeys = srcKeys.sort();
  dstKeys = dstKeys.sort();
  for (let idx = 0; idx < srcKeys.length; idx++) {
    const srcKey = srcKeys[idx];
    const dstKey = dstKeys[idx];
    if (srcKey !== dstKey || src[srcKey] !== dst[dstKey]) {
      return false;
    }
  }
  return true;
}
