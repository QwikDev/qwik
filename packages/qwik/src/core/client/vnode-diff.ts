import { isDev } from '@qwik.dev/core/build';
import { SERIALIZABLE_STATE, type OnRenderFn } from '../shared/component.public';
import { assertDefined, assertFalse, assertTrue } from '../shared/error/assert';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import {
  Fragment,
  JSXNodeImpl,
  directGetPropsProxyProp,
  isJSXNode,
  type Props,
  type PropsProxy,
} from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { SSRComment, SSRRaw, SkipRender } from '../shared/jsx/utils.public';
import { trackSignalAndAssignHost } from '../use/use-core';
import { TaskFlags, cleanupTask, isTask } from '../use/use-task';
import { EMPTY_OBJ } from '../shared/utils/flyweight';
import {
  ELEMENT_KEY,
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QContainerAttr,
  QDefaultSlot,
  QSlot,
  QBackRefs,
  QTemplate,
  Q_PREFIX,
  dangerouslySetInnerHTML,
} from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { isArray, type ValueOrPromise } from '../shared/utils/types';
import {
  getEventNameFromJsxEvent,
  getEventNameScopeFromJsxEvent,
  isHtmlAttributeAnEventName,
  isJsxPropertyAnEventName,
  jsxEventToHtmlAttribute,
} from '../shared/utils/event-names';
import { ChoreType } from '../shared/util-chore-type';
import { hasClassAttr } from '../shared/utils/scoped-styles';
import type { HostElement, QElement, QwikLoaderEventScope, qWindow } from '../shared/types';
import { DEBUG_TYPE, QContainerValue, VirtualType } from '../shared/types';
import type { DomContainer } from './dom-container';
import { VNodeFlags, type ClientAttrs, type ClientContainer } from './types';
import {
  vnode_ensureElementInflated,
  vnode_getDomParentVNode,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getProjectionParentComponent,
  vnode_getProps,
  vnode_getText,
  vnode_getType,
  vnode_insertBefore,
  vnode_isElementVNode,
  vnode_isProjection,
  vnode_isTextVNode,
  vnode_isVNode,
  vnode_isVirtualVNode,
  vnode_locate,
  vnode_newElement,
  vnode_newText,
  vnode_newVirtual,
  vnode_remove,
  vnode_setText,
  vnode_truncate,
  vnode_walkVNode,
  type VNodeJournal,
} from './vnode';
import { mapApp_findIndx } from './util-mapArray';
import { mapArray_set } from './util-mapArray';
import { getAttributeNamespace, getNewElementNamespaceData } from './vnode-namespace';
import { isSignal } from '../reactive-primitives/utils';
import type { Signal } from '../reactive-primitives/signal.public';
import { executeComponent } from '../shared/component-execution';
import { isSlotProp } from '../shared/utils/prop';
import { escapeHTML } from '../shared/utils/character-escaping';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { serializeAttribute } from '../shared/utils/styles';
import { QError, qError } from '../shared/error/error';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import { EffectProperty } from '../reactive-primitives/types';
import { SubscriptionData } from '../reactive-primitives/subscription-data';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { _CONST_PROPS, _VAR_PROPS } from '../internal';
import { isSyncQrl } from '../shared/qrl/qrl-utils';
import type { ElementVNode, TextVNode, VirtualVNode, VNode } from './vnode-impl';

export const vnode_diff = (
  container: ClientContainer,
  jsxNode: JSXOutput,
  vStartNode: VNode,
  scopedStyleIdPrefix: string | null
) => {
  let journal = (container as DomContainer).$journal$;

  /**
   * Stack is used to keep track of the state of the traversal.
   *
   * We push current state into the stack before descending into the child, and we pop the state
   * when we are done with the child.
   */
  const stack: any[] = [];

  const asyncQueue: Array<VNode | ValueOrPromise<JSXOutput> | Promise<JSXOutput | JSXChildren>> =
    [];

  ////////////////////////////////
  //// Traverse state variables
  ////////////////////////////////
  let vParent: ElementVNode | VirtualVNode = null!;

  /// Current node we compare against. (Think of it as a cursor.)
  /// (Node can be null, if we are at the end of the list.)
  let vCurrent: VNode | null = null;

  /// When we insert new node we start it here so that we can descend into it.
  /// NOTE: it can't be stored in `vCurrent` because `vNewNode` is in journal
  /// and is not connected to the tree.
  let vNewNode: VNode | null = null;

  /// The array even indices will contains keys and odd indices the non keyed siblings.
  let vSiblingsArray: Array<string | VNode | null> | null = null;

  /// Side buffer to store nodes that are moved out of order during key scanning.
  /// This contains nodes that were found before the target key and need to be moved later.
  let vSideBuffer: Map<string, VNode> | null = null;

  /// Current set of JSX children.
  let jsxChildren: JSXChildren[] = null!;
  // Current JSX child.
  let jsxValue: JSXChildren = null;
  let jsxIdx = 0;
  let jsxCount = 0;

  // When we descend into children, we need to skip advance() because we just descended.
  let shouldAdvance = true;

  const CONST_SUBSCRIPTION_DATA = new SubscriptionData({
    $scopedStyleIdPrefix$: scopedStyleIdPrefix,
    $isConst$: true,
  });

  const NON_CONST_SUBSCRIPTION_DATA = new SubscriptionData({
    $scopedStyleIdPrefix$: scopedStyleIdPrefix,
    $isConst$: false,
  });
  ////////////////////////////////

  diff(jsxNode, vStartNode);
  return drainAsyncQueue();

  //////////////////////////////////////////////
  //////////////////////////////////////////////
  //////////////////////////////////////////////

  function diff(jsxNode: JSXOutput, vStartNode: VNode) {
    assertFalse(vnode_isVNode(jsxNode), 'JSXNode should not be a VNode');
    assertTrue(vnode_isVNode(vStartNode), 'vStartNode should be a VNode');
    vParent = vStartNode as ElementVNode | VirtualVNode;
    vNewNode = null;
    vCurrent = vnode_getFirstChild(vStartNode);
    stackPush(jsxNode, true);

    if (vParent.flags & VNodeFlags.Deleted) {
      // Ignore diff if the parent is deleted.
      return;
    }

    while (stack.length) {
      while (jsxIdx < jsxCount) {
        assertFalse(vParent === vCurrent, "Parent and current can't be the same");
        if (typeof jsxValue === 'string') {
          expectText(jsxValue);
        } else if (typeof jsxValue === 'number') {
          expectText(String(jsxValue));
        } else if (jsxValue && typeof jsxValue === 'object') {
          if (Array.isArray(jsxValue)) {
            descend(jsxValue, false);
          } else if (isSignal(jsxValue)) {
            if (vCurrent) {
              clearAllEffects(container, vCurrent);
            }
            expectVirtual(VirtualType.WrappedSignal, null);
            descend(
              trackSignalAndAssignHost(
                jsxValue as Signal,
                (vNewNode || vCurrent)!,
                EffectProperty.VNODE,
                container
              ),
              true
            );
          } else if (isPromise(jsxValue)) {
            expectVirtual(VirtualType.Awaited, null);
            asyncQueue.push(jsxValue, vNewNode || vCurrent);
          } else if (isJSXNode(jsxValue)) {
            const type = jsxValue.type;
            if (typeof type === 'string') {
              expectNoMoreTextNodes();
              expectElement(jsxValue, type);
              descend(jsxValue.children, true);
            } else if (typeof type === 'function') {
              if (type === Fragment) {
                expectNoMoreTextNodes();
                expectVirtual(VirtualType.Fragment, jsxValue.key);
                descend(jsxValue.children, true);
              } else if (type === Slot) {
                expectNoMoreTextNodes();
                if (!expectSlot()) {
                  // nothing to project, so try to render the Slot default content.
                  descend(jsxValue.children, true);
                }
              } else if (type === Projection) {
                expectProjection();
                descend(
                  jsxValue.children,
                  true,
                  // special case for projection, we don't want to expect no children
                  // because the projection's children are not removed
                  false
                );
              } else if (type === SSRComment) {
                expectNoMore();
              } else if (type === SSRRaw) {
                expectNoMore();
              } else {
                // Must be a component
                expectNoMoreTextNodes();
                expectComponent(type);
              }
            }
          }
        } else if (jsxValue === (SkipRender as JSXChildren)) {
          // do nothing, we are skipping this node
          journal = [];
        } else {
          expectText('');
        }
        advance();
      }
      expectNoMore();
      cleanupSideBuffer();
      ascend();
    }
  }

  function advance() {
    if (!shouldAdvance) {
      shouldAdvance = true;
      return;
    }
    jsxIdx++;
    if (jsxIdx < jsxCount) {
      jsxValue = jsxChildren[jsxIdx];
    } else if (stack[stack.length - 1] === false) {
      // this was special `descendVNode === false` so pop and try again
      return ascend();
    }
    if (vNewNode !== null) {
      // We have a new Node.
      // This means that the `vCurrent` was deemed not useful and we inserted in front of it.
      // This means that the next node we should look at is the `vCurrent` so just clear the
      // vNewNode  and try again.
      vNewNode = null;
    } else {
      advanceToNextSibling();
    }
  }

  /** Advance the `vCurrent` to the next sibling. */
  function peekNextSibling() {
    // If we don't have a `vNewNode`, than that means we just reconciled the current node.
    // So advance it.
    return vCurrent ? (vCurrent.nextSibling as VNode | null) : null;
  }

  /** Advance the `vCurrent` to the next sibling. */
  function advanceToNextSibling() {
    vCurrent = peekNextSibling();
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
  function descend(
    children: JSXChildren,
    descendVNode: boolean,
    shouldExpectNoChildren: boolean = true
  ) {
    if (
      shouldExpectNoChildren &&
      (children == null || (descendVNode && isArray(children) && children.length === 0))
    ) {
      expectNoChildren();
      return;
    }
    stackPush(children, descendVNode);
    if (descendVNode) {
      assertDefined(vCurrent || vNewNode, 'Expecting vCurrent to be defined.');
      vSideBuffer = null;
      vSiblingsArray = null;
      vParent = (vNewNode || vCurrent!) as ElementVNode | VirtualVNode;
      vCurrent = vnode_getFirstChild(vParent);
      vNewNode = null;
    }
    shouldAdvance = false;
  }

  function ascend() {
    const descendVNode = stack.pop(); // boolean: descendVNode
    if (descendVNode) {
      vSideBuffer = stack.pop();
      vSiblingsArray = stack.pop();
      vNewNode = stack.pop();
      vCurrent = stack.pop();
      vParent = stack.pop();
    }
    jsxValue = stack.pop();
    jsxCount = stack.pop();
    jsxIdx = stack.pop();
    jsxChildren = stack.pop();
    advance();
  }

  function stackPush(children: JSXChildren, descendVNode: boolean) {
    stack.push(jsxChildren, jsxIdx, jsxCount, jsxValue);
    if (descendVNode) {
      stack.push(vParent, vCurrent, vNewNode, vSiblingsArray, vSideBuffer);
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

  function getInsertBefore() {
    if (vNewNode) {
      return vCurrent;
    } else {
      return peekNextSibling();
    }
  }

  /////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////
  /////////////////////////////////////////////////////////////////////////////

  function descendContentToProject(children: JSXChildren, host: VirtualVNode | null) {
    const projectionChildren = Array.isArray(children) ? children : [children];
    const createProjectionJSXNode = (slotName: string) => {
      return new JSXNodeImpl(Projection, EMPTY_OBJ, null, [], 0, slotName);
    };

    const projections: Array<string | JSXNodeInternal> = [];
    if (host) {
      const props = vnode_getProps(host);
      // we need to create empty projections for all the slots to remove unused slots content
      for (let i = 0; i < props.length; i = i + 2) {
        const prop = props[i] as string;
        if (isSlotProp(prop)) {
          const slotName = prop;
          projections.push(slotName);
          projections.push(createProjectionJSXNode(slotName));
        }
      }
    }

    if (projections.length === 0 && children == null) {
      // We did not find any existing slots and we don't have any children to project.
      return;
    }

    /// STEP 1: Bucketize the children based on the projection name.
    for (let i = 0; i < projectionChildren.length; i++) {
      const child = projectionChildren[i];
      const slotName = String(
        (isJSXNode(child) && directGetPropsProxyProp(child, QSlot)) || QDefaultSlot
      );
      const idx = mapApp_findIndx(projections, slotName, 0);
      let jsxBucket: JSXNodeImpl<typeof Projection>;
      if (idx >= 0) {
        jsxBucket = projections[idx + 1] as any;
      } else {
        projections.splice(~idx, 0, slotName, (jsxBucket = createProjectionJSXNode(slotName)));
      }
      const removeProjection = child === false;
      if (!removeProjection) {
        (jsxBucket.children as JSXChildren[]).push(child);
      }
    }
    /// STEP 2: remove the names
    for (let i = projections.length - 2; i >= 0; i = i - 2) {
      projections.splice(i, 1);
    }
    descend(projections, true);
  }

  function expectProjection() {
    const jsxNode = jsxValue as JSXNodeInternal;
    const slotName = jsxNode.key as string;
    // console.log('expectProjection', JSON.stringify(slotName));
    // The parent is the component and it should have our portal.
    vCurrent = (vParent as VirtualVNode).getProp<VirtualVNode | null>(slotName, (id) =>
      vnode_locate(container.rootVNode, id)
    );
    // if projection is marked as deleted then we need to create a new one
    vCurrent = vCurrent && vCurrent.flags & VNodeFlags.Deleted ? null : vCurrent;
    if (vCurrent == null) {
      vNewNode = vnode_newVirtual();
      // you may be tempted to add the projection into the current parent, but
      // that is wrong. We don't yet know if the projection will be projected, so
      // we should leave it unattached.
      // vNewNode[VNodeProps.parent] = vParent;
      isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, VirtualType.Projection);
      isDev && (vNewNode as VirtualVNode).setProp('q:code', 'expectProjection');
      (vNewNode as VirtualVNode).setProp(QSlot, slotName);
      (vNewNode as VirtualVNode).slotParent = vParent;
      (vParent as VirtualVNode).setProp(slotName, vNewNode);
    }
  }

  function expectSlot() {
    const vHost = vnode_getProjectionParentComponent(vParent);

    const slotNameKey = getSlotNameKey(vHost);
    // console.log('expectSlot', JSON.stringify(slotNameKey));

    const vProjectedNode = vHost
      ? (vHost as VirtualVNode).getProp<VirtualVNode | null>(
          slotNameKey,
          // for slots this id is vnode ref id
          null // Projections should have been resolved through container.ensureProjectionResolved
          //(id) => vnode_locate(container.rootVNode, id)
        )
      : null;
    // console.log('   ', String(vHost), String(vProjectedNode));
    if (vProjectedNode == null) {
      // Nothing to project, so render content of the slot.
      vnode_insertBefore(
        journal,
        vParent as ElementVNode | VirtualVNode,
        (vNewNode = vnode_newVirtual()),
        vCurrent && getInsertBefore()
      );
      (vNewNode as VirtualVNode).setProp(QSlot, slotNameKey);
      vHost && (vHost as VirtualVNode).setProp(slotNameKey, vNewNode);
      isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, VirtualType.Projection);
      isDev && (vNewNode as VirtualVNode).setProp('q:code', 'expectSlot' + count++);
      return false;
    } else if (vProjectedNode === vCurrent) {
      // All is good.
      // console.log('  NOOP', String(vCurrent));
    } else {
      // move from q:template to the target node
      vnode_insertBefore(
        journal,
        vParent as ElementVNode | VirtualVNode,
        (vNewNode = vProjectedNode),
        vCurrent && getInsertBefore()
      );
      (vNewNode as VirtualVNode).setProp(QSlot, slotNameKey);
      vHost && (vHost as VirtualVNode).setProp(slotNameKey, vNewNode);
      isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, VirtualType.Projection);
      isDev && (vNewNode as VirtualVNode).setProp('q:code', 'expectSlot' + count++);
    }
    return true;
  }

  function getSlotNameKey(vHost: VNode | null) {
    const jsxNode = jsxValue as JSXNodeInternal;
    const constProps = jsxNode.constProps;
    if (constProps && typeof constProps == 'object' && 'name' in constProps) {
      const constValue = constProps.name;
      if (vHost && constValue instanceof WrappedSignalImpl) {
        return trackSignalAndAssignHost(constValue, vHost, EffectProperty.COMPONENT, container);
      }
    }
    return directGetPropsProxyProp(jsxNode, 'name') || QDefaultSlot;
  }

  function cleanupSideBuffer() {
    if (vSideBuffer) {
      // Remove all nodes in the side buffer as they are no longer needed
      for (const vNode of vSideBuffer.values()) {
        if (vNode.flags & VNodeFlags.Deleted) {
          continue;
        }
        cleanup(container, vNode);
        vnode_remove(journal, vParent, vNode, true);
      }
      vSideBuffer.clear();
      vSideBuffer = null;
    }
    vCurrent = null;
  }

  function drainAsyncQueue(): ValueOrPromise<void> {
    while (asyncQueue.length) {
      const jsxNode = asyncQueue.shift() as ValueOrPromise<JSXNodeInternal>;
      const vHostNode = asyncQueue.shift() as VNode;
      if (isPromise(jsxNode)) {
        return jsxNode.then((jsxNode) => {
          diff(jsxNode, vHostNode);
          return drainAsyncQueue();
        });
      } else {
        diff(jsxNode, vHostNode);
      }
    }
  }

  function expectNoChildren() {
    const vFirstChild = vCurrent && vnode_getFirstChild(vCurrent);
    if (vFirstChild !== null) {
      let vChild: VNode | null = vFirstChild;
      while (vChild) {
        cleanup(container, vChild);
        vChild = vChild.nextSibling as VNode | null;
      }
      vnode_truncate(journal, vCurrent as ElementVNode | VirtualVNode, vFirstChild);
    }
  }

  /** Expect no more nodes - Any nodes which are still at cursor, need to be removed. */
  function expectNoMore() {
    assertFalse(vParent === vCurrent, "Parent and current can't be the same");
    if (vCurrent !== null) {
      while (vCurrent) {
        const toRemove = vCurrent;
        advanceToNextSibling();
        if (vParent === toRemove.parent) {
          cleanup(container, toRemove);
          // If we are diffing projection than the parent is not the parent of the node.
          // If that is the case we don't want to remove the node from the parent.
          vnode_remove(journal, vParent, toRemove, true);
        }
      }
    }
  }

  function expectNoMoreTextNodes() {
    while (vCurrent !== null && vnode_isTextVNode(vCurrent)) {
      cleanup(container, vCurrent);
      const toRemove = vCurrent;
      advanceToNextSibling();
      vnode_remove(journal, vParent, toRemove, true);
    }
  }

  /**
   * Returns whether `qDispatchEvent` needs patching. This is true when one of the `jsx` argument's
   * const props has the name of an event.
   *
   * @returns {boolean}
   */
  function createNewElement(
    jsx: JSXNodeInternal,
    elementName: string,
    currentFile?: string | null
  ): boolean {
    const element = createElementWithNamespace(elementName);

    const { constProps } = jsx;
    let needsQDispatchEventPatch = false;
    if (constProps) {
      // Const props are, well, constant, they will never change!
      // For this reason we can cheat and write them directly into the DOM.
      // We never tell the vNode about them saving us time and memory.
      for (const key in constProps) {
        let value = constProps[key];
        if (isJsxPropertyAnEventName(key)) {
          // So for event handlers we must add them to the vNode so that qwikloader can look them up
          // But we need to mark them so that they don't get pulled into the diff.
          const eventName = getEventNameFromJsxEvent(key);
          const scope = getEventNameScopeFromJsxEvent(key);
          if (eventName) {
            vNewNode!.setProp(HANDLER_PREFIX + ':' + scope + ':' + eventName, value);
            registerQwikLoaderEvent(eventName);
          }

          if (scope) {
            // add an event attr with empty value for qwikloader element selector.
            // We don't need value here. For ssr this value is a QRL,
            // but for CSR value should be just empty
            const htmlEvent = jsxEventToHtmlAttribute(key);
            if (htmlEvent) {
              vNewNode!.setAttr(htmlEvent, '', journal);
            }
          }

          needsQDispatchEventPatch = true;
          continue;
        }

        if (key === 'ref') {
          if (isSignal(value)) {
            value.value = element;
            continue;
          } else if (typeof value === 'function') {
            value(element);
            continue;
          } else if (value == null) {
            continue;
          } else {
            throw qError(QError.invalidRefValue, [currentFile]);
          }
        }

        if (isSignal(value)) {
          value = trackSignalAndAssignHost(
            value as Signal<unknown>,
            vNewNode as ElementVNode,
            key,
            container,
            CONST_SUBSCRIPTION_DATA
          );
        }

        if (key === dangerouslySetInnerHTML) {
          if (value) {
            element.innerHTML = String(value);
            element.setAttribute(QContainerAttr, QContainerValue.HTML);
          }
          continue;
        }

        if (elementName === 'textarea' && key === 'value') {
          if (value && typeof value !== 'string') {
            if (isDev) {
              throw qError(QError.wrongTextareaValue, [currentFile, value]);
            }
            continue;
          }
          (element as HTMLTextAreaElement).value = escapeHTML((value as string) || '');
          continue;
        }

        value = serializeAttribute(key, value, scopedStyleIdPrefix);
        if (value != null) {
          if (vNewNode!.flags & VNodeFlags.NS_svg) {
            // only svg elements can have namespace attributes
            const namespace = getAttributeNamespace(key);
            if (namespace) {
              element.setAttributeNS(namespace, key, String(value));
              continue;
            }
          }
          element.setAttribute(key, String(value));
        }
      }
    }
    const key = jsx.key;
    if (key) {
      (vNewNode as ElementVNode).setProp(ELEMENT_KEY, key);
    }

    // append class attribute if styleScopedId exists and there is no class attribute
    if (scopedStyleIdPrefix) {
      const classAttributeExists =
        hasClassAttr(jsx.varProps) || (jsx.constProps && hasClassAttr(jsx.constProps));
      if (!classAttributeExists) {
        element.setAttribute('class', scopedStyleIdPrefix);
      }
    }

    vnode_insertBefore(journal, vParent as ElementVNode, vNewNode as ElementVNode, vCurrent);

    return needsQDispatchEventPatch;
  }

  function createElementWithNamespace(elementName: string): Element {
    const domParentVNode = vnode_getDomParentVNode(vParent);
    const { elementNamespace, elementNamespaceFlag } = getNewElementNamespaceData(
      domParentVNode,
      elementName
    );

    const element = container.document.createElementNS(elementNamespace, elementName);
    vNewNode = vnode_newElement(element, elementName);
    vNewNode.flags |= elementNamespaceFlag;
    return element;
  }

  function expectElement(jsx: JSXNodeInternal, elementName: string) {
    const isSameElementName =
      vCurrent && vnode_isElementVNode(vCurrent) && elementName === vnode_getElementName(vCurrent);
    const jsxKey: string | null = jsx.key;
    let needsQDispatchEventPatch = false;
    const currentKey = getKey(vCurrent);
    if (!isSameElementName || jsxKey !== currentKey) {
      const sideBufferKey = getSideBufferKey(elementName, jsxKey);
      const createNew = () => (needsQDispatchEventPatch = createNewElement(jsx, elementName));
      moveOrCreateKeyedNode(elementName, jsxKey, sideBufferKey, vParent as ElementVNode, createNew);
    } else {
      // delete the key from the side buffer if it is the same element
      deleteFromSideBuffer(elementName, jsxKey);
    }

    // reconcile attributes

    const jsxAttrs = [] as ClientAttrs;
    const props = jsx.varProps;
    for (const key in props) {
      const value = props[key];
      if (value != null) {
        mapArray_set(jsxAttrs, key, value, 0);
      }
    }
    if (jsxKey !== null) {
      mapArray_set(jsxAttrs, ELEMENT_KEY, jsxKey, 0);
    }
    const vNode = (vNewNode || vCurrent) as ElementVNode;

    const element = vNode.element as QElement;
    if (!element.vNode) {
      element.vNode = vNode;
    }

    needsQDispatchEventPatch =
      setBulkProps(vNode, jsxAttrs, (isDev && getFileLocationFromJsx(jsx.dev)) || null) ||
      needsQDispatchEventPatch;
    if (needsQDispatchEventPatch) {
      // Event handler needs to be patched onto the element.
      if (!element.qDispatchEvent) {
        element.qDispatchEvent = (event: Event, scope: QwikLoaderEventScope) => {
          const eventName = event.type;
          const eventProp = ':' + scope.substring(1) + ':' + eventName;
          const qrls = [
            vNode.getProp<QRL>(eventProp, null),
            vNode.getProp<QRL>(HANDLER_PREFIX + eventProp, null),
          ];
          let returnValue = false;
          qrls.flat(2).forEach((qrl) => {
            if (qrl) {
              if (isSyncQrl(qrl)) {
                qrl(event, element);
              } else {
                const value = container.$scheduler$(
                  ChoreType.RUN_QRL,
                  vNode,
                  qrl as QRLInternal<(...args: unknown[]) => unknown>,
                  [event, element]
                ) as unknown;
                returnValue = returnValue || value === true;
              }
            }
          });
          return returnValue;
        };
      }
    }
  }

  /** @returns True if `qDispatchEvent` needs patching */
  function setBulkProps(
    vnode: ElementVNode,
    srcAttrs: ClientAttrs,
    currentFile: string | null
  ): boolean {
    vnode_ensureElementInflated(vnode);
    const dstAttrs = vnode_getProps(vnode) as ClientAttrs;
    let srcIdx = 0;
    let dstIdx = 0;
    let patchEventDispatch = false;

    const record = (key: string, value: any) => {
      if (key.startsWith(':')) {
        vnode.setProp(key, value);
        return;
      }

      if (key === 'ref') {
        const element = vnode.element;
        if (isSignal(value)) {
          value.value = element;
          return;
        } else if (typeof value === 'function') {
          value(element);
          return;
        }
        // handling null value is not needed here, because we are filtering null values earlier
        else {
          throw qError(QError.invalidRefValue, [currentFile]);
        }
      }

      if (isSignal(value)) {
        value = trackSignalAndAssignHost(value, vnode, key, container, NON_CONST_SUBSCRIPTION_DATA);
      }

      vnode.setAttr(
        key,
        value !== null ? serializeAttribute(key, value, scopedStyleIdPrefix) : null,
        journal
      );
    };

    const recordJsxEvent = (key: string, value: any) => {
      const eventName = getEventNameFromJsxEvent(key);
      const scope = getEventNameScopeFromJsxEvent(key);
      if (eventName) {
        record(':' + scope + ':' + eventName, value);
        // register an event for qwik loader
        registerQwikLoaderEvent(eventName);
      }

      if (scope) {
        // add an event attr with empty value for qwikloader element selector.
        // We don't need value here. For ssr this value is a QRL,
        // but for CSR value should be just empty
        const htmlEvent = jsxEventToHtmlAttribute(key);
        if (htmlEvent) {
          record(htmlEvent, '');
        }
      }
    };

    // Two-pointer merge algorithm: both arrays are sorted by key
    // Note: dstAttrs mutates during iteration (setAttr uses splice), so we re-read keys each iteration
    while (srcIdx < srcAttrs.length || dstIdx < dstAttrs.length) {
      const srcKey = srcIdx < srcAttrs.length ? (srcAttrs[srcIdx] as string) : undefined;
      const dstKey = dstIdx < dstAttrs.length ? (dstAttrs[dstIdx] as string) : undefined;

      // Skip special keys in destination (HANDLER_PREFIX, Q_PREFIX)
      if (dstKey?.startsWith(HANDLER_PREFIX) || dstKey?.startsWith(Q_PREFIX)) {
        dstIdx += 2; // skip key and value
        continue;
      }

      if (srcKey === undefined) {
        // Source exhausted: remove remaining destination keys
        if (isHtmlAttributeAnEventName(dstKey!)) {
          // HTML event attributes are immutable and not removed from DOM
          dstIdx += 2; // skip key and value
        } else {
          record(dstKey!, null);
          // After removal, dstAttrs shrinks by 2, so don't advance dstIdx
        }
      } else if (dstKey === undefined) {
        // Destination exhausted: add remaining source keys
        const srcValue = srcAttrs[srcIdx + 1];
        if (isJsxPropertyAnEventName(srcKey)) {
          patchEventDispatch = true;
          recordJsxEvent(srcKey, srcValue);
        } else {
          record(srcKey, srcValue);
        }
        srcIdx += 2; // skip key and value
        // After addition, dstAttrs grows by 2 at sorted position, advance dstIdx
        dstIdx += 2;
      } else if (srcKey === dstKey) {
        // Keys match: update if values differ
        const srcValue = srcAttrs[srcIdx + 1];
        const dstValue = dstAttrs[dstIdx + 1];
        if (srcValue !== dstValue) {
          record(srcKey, srcValue);
          // Update in place doesn't change array length
        }
        srcIdx += 2; // skip key and value
        dstIdx += 2; // skip key and value
      } else if (srcKey < dstKey) {
        // Source has a key not in destination: add it
        const srcValue = srcAttrs[srcIdx + 1];
        if (isJsxPropertyAnEventName(srcKey)) {
          patchEventDispatch = true;
          recordJsxEvent(srcKey, srcValue);
        } else {
          record(srcKey, srcValue);
        }
        srcIdx += 2; // skip key and value
        // After addition, dstAttrs grows at sorted position (before dstIdx), advance dstIdx
        dstIdx += 2;
      } else {
        // Destination has a key not in source: remove it (dstKey > srcKey)
        if (isHtmlAttributeAnEventName(dstKey)) {
          // HTML event attributes are immutable and not removed from DOM
          dstIdx += 2; // skip key and value
        } else {
          record(dstKey, null);
          // After removal, dstAttrs shrinks at dstIdx, so don't advance dstIdx
        }
      }
    }
    return patchEventDispatch;
  }

  function registerQwikLoaderEvent(eventName: string) {
    const window = container.document.defaultView as qWindow | null;
    if (window) {
      (window.qwikevents ||= [] as any).push(eventName);
    }
  }

  /**
   * This function is used to retrieve the child with the given key. If the child is not found, it
   * will return null.
   *
   * We will also collect all the keyed siblings found before the target key and add them to the
   * side buffer. This is done to optimize the search for the next child with the specified key.
   *
   * @param nodeName - The name of the node.
   * @param key - The key of the node.
   * @returns The child with the given key or null if not found.
   */
  function retrieveChildWithKey(
    nodeName: string | null,
    key: string | null
  ): ElementVNode | VirtualVNode | null {
    let vNodeWithKey: ElementVNode | VirtualVNode | null = null;

    // if key is null we need to:
    // - if this is the first time fill the vSiblingsArray with all siblings
    // - if not then find the node we are interested in

    if (key == null && vSiblingsArray != null) {
      for (let i = 0; i < vSiblingsArray.length; i += 2) {
        if (vSiblingsArray[i] === nodeName) {
          vNodeWithKey = vSiblingsArray![i + 1] as ElementVNode | VirtualVNode;
          vSiblingsArray.splice(i, 2);
          break;
        }
      }
      return vNodeWithKey;
    }

    const fillSiblingsArray = vSiblingsArray == null;
    let vNode = vCurrent;
    let foundTarget = false;
    let keyedSiblingsBeforeTarget: Array<{
      sideBufferKey: string;
      vNode: VNode;
    }> | null = null;

    while (vNode) {
      const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
      const vKey = getKey(vNode) || getComponentHash(vNode, container.$getObjectById$);

      if (vNodeWithKey === null && vKey == key && name == nodeName) {
        vNodeWithKey = vNode as ElementVNode | VirtualVNode;
        foundTarget = true;
        if (keyedSiblingsBeforeTarget && keyedSiblingsBeforeTarget.length > 0) {
          vSideBuffer ||= new Map();
          // Add all collected keyed siblings to side buffer now that we found the target
          for (const sibling of keyedSiblingsBeforeTarget) {
            vSideBuffer.set(sibling.sideBufferKey, sibling.vNode);
          }
        }
        if (!fillSiblingsArray) {
          break;
        }
      } else {
        if (vKey == null) {
          if (fillSiblingsArray) {
            // Unkeyed sibling - add to siblings array
            vSiblingsArray ||= [];
            vSiblingsArray.push(name, vNode);
          }
        } else {
          if (!foundTarget) {
            keyedSiblingsBeforeTarget ||= [];
            const sideBufferKey = getSideBufferKey(name, vKey);
            // Collect keyed sibling found before target
            keyedSiblingsBeforeTarget.push({ sideBufferKey, vNode });
          }
        }
      }

      vNode = vNode.nextSibling as VNode | null;
    }

    // add current to the side buffer if it is not the target
    if (!foundTarget && vCurrent) {
      const name = vnode_isElementVNode(vCurrent) ? vnode_getElementName(vCurrent) : null;
      const vKey = getKey(vCurrent) || getComponentHash(vCurrent, container.$getObjectById$);
      if (vKey != null) {
        const sideBufferKey = getSideBufferKey(name, vKey);
        vSideBuffer ||= new Map();
        vSideBuffer.set(sideBufferKey, vCurrent);
      }
    }
    return vNodeWithKey;
  }

  function getSideBufferKey(nodeName: string | null, key: string): string;
  function getSideBufferKey(nodeName: string | null, key: string | null): string | null;
  function getSideBufferKey(nodeName: string | null, key: string | null): string | null {
    if (key == null) {
      return null;
    }
    return nodeName ? nodeName + ':' + key : key;
  }

  function deleteFromSideBuffer(nodeName: string | null, key: string | null): boolean {
    const sbKey = getSideBufferKey(nodeName, key);
    if (sbKey && vSideBuffer?.has(sbKey)) {
      vSideBuffer.delete(sbKey);
      return true;
    }
    return false;
  }

  /**
   * Shared utility to resolve a keyed node by:
   *
   * 1. Scanning forward siblings via `retrieveChildWithKey`
   * 2. Falling back to the side buffer using the provided `sideBufferKey`
   * 3. Creating a new node via `createNew` when not found
   *
   * If a node is moved from the side buffer, it is inserted before `vCurrent` under
   * `parentForInsert`. The function updates `vCurrent`/`vNewNode` accordingly and returns the value
   * from `createNew` when a new node is created.
   */
  function moveOrCreateKeyedNode(
    nodeName: string | null,
    lookupKey: string | null,
    sideBufferKey: string | null,
    parentForInsert: VNode,
    createNew: () => any,
    addCurrentToSideBufferOnSideInsert?: boolean
  ): any {
    // 1) Try to find the node among upcoming siblings
    vNewNode = retrieveChildWithKey(nodeName, lookupKey);
    if (vNewNode) {
      vCurrent = vNewNode;
      vNewNode = null;
      return;
    }

    // 2) Try side buffer
    if (sideBufferKey != null) {
      const buffered = vSideBuffer?.get(sideBufferKey) || null;
      if (buffered) {
        vSideBuffer!.delete(sideBufferKey);
        if (addCurrentToSideBufferOnSideInsert && vCurrent) {
          const currentKey =
            getKey(vCurrent) || getComponentHash(vCurrent, container.$getObjectById$);
          if (currentKey != null) {
            const currentName = vnode_isElementVNode(vCurrent)
              ? vnode_getElementName(vCurrent)
              : null;
            const currentSideKey = getSideBufferKey(currentName, currentKey);
            if (currentSideKey != null) {
              vSideBuffer ||= new Map();
              vSideBuffer.set(currentSideKey, vCurrent);
            }
          }
        }
        vnode_insertBefore(journal, parentForInsert as any, buffered, vCurrent);
        vCurrent = buffered;
        vNewNode = null;
        return;
      }
    }

    // 3) Create new
    return createNew();
  }

  function expectVirtual(type: VirtualType, jsxKey: string | null) {
    const checkKey = type === VirtualType.Fragment;
    const currentKey = getKey(vCurrent);
    const isSameNode =
      vCurrent &&
      vnode_isVirtualVNode(vCurrent) &&
      currentKey === jsxKey &&
      (checkKey ? !!jsxKey : true);

    if (isSameNode) {
      // All is good.
      deleteFromSideBuffer(null, currentKey);
      return;
    }

    const createNew = () => {
      vnode_insertBefore(
        journal,
        vParent as VirtualVNode,
        (vNewNode = vnode_newVirtual()),
        vCurrent && getInsertBefore()
      );
      (vNewNode as VirtualVNode).setProp(ELEMENT_KEY, jsxKey);
      isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, type);
    };
    // For fragments without a key, always create a new virtual node (ensures rerender semantics)
    if (checkKey && jsxKey === null) {
      createNew();
      return;
    }
    moveOrCreateKeyedNode(
      null,
      jsxKey,
      getSideBufferKey(null, jsxKey),
      vParent as VirtualVNode,
      createNew,
      true
    );
  }

  function expectComponent(component: Function) {
    const componentMeta = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
    let host = (vNewNode || vCurrent) as VirtualVNode | null;
    const jsxNode = jsxValue as JSXNodeInternal;
    if (componentMeta) {
      const jsxProps = jsxNode.props;
      // QComponent
      let shouldRender = false;
      const [componentQRL] = componentMeta;

      const componentHash = componentQRL.$hash$;
      const vNodeComponentHash = getComponentHash(host, container.$getObjectById$);

      const lookupKey = jsxNode.key || componentHash;
      const vNodeLookupKey = getKey(host) || vNodeComponentHash;

      const lookupKeysAreEqual = lookupKey === vNodeLookupKey;
      const hashesAreEqual = componentHash === vNodeComponentHash;

      if (!lookupKeysAreEqual) {
        const createNew = () => {
          insertNewComponent(host, componentQRL, jsxProps);
          shouldRender = true;
        };
        moveOrCreateKeyedNode(null, lookupKey, lookupKey, vParent as VirtualVNode, createNew);
        host = (vNewNode || vCurrent) as VirtualVNode;
      } else if (!hashesAreEqual || !jsxNode.key) {
        insertNewComponent(host, componentQRL, jsxProps);
        host = vNewNode as VirtualVNode;
        shouldRender = true;
      } else {
        // delete the key from the side buffer if it is the same component
        deleteFromSideBuffer(null, lookupKey);
      }

      if (host) {
        let vNodeProps = (host as VirtualVNode).getProp<any>(
          ELEMENT_PROPS,
          container.$getObjectById$
        );
        let propsAreDifferent = false;
        if (!shouldRender) {
          propsAreDifferent = propsDiffer(jsxProps, vNodeProps);
          shouldRender = shouldRender || propsAreDifferent;
        }

        if (shouldRender) {
          if (propsAreDifferent) {
            if (vNodeProps) {
              // Reuse the same props instance, qrls can use the current props instance
              // as a capture ref, so we can't change it.
              // We need to do this directly, because normally we would subscribe to the signals
              // if any signal is there.
              vNodeProps[_CONST_PROPS] = (jsxProps as PropsProxy)[_CONST_PROPS];
              vNodeProps[_VAR_PROPS] = (jsxProps as PropsProxy)[_VAR_PROPS];
            } else if (jsxProps) {
              // If there is no props instance, create a new one.
              // We can do this because we are not using the props instance for anything else.
              (host as VirtualVNode).setProp(ELEMENT_PROPS, jsxProps);
              vNodeProps = jsxProps;
            }
          }
          // Assign the new QRL instance to the host.
          // Unfortunately it is created every time, something to fix in the optimizer.
          (host as VirtualVNode).setProp(OnRenderProp, componentQRL);

          /**
           * Mark host as not deleted. The host could have been marked as deleted if it there was a
           * cleanup run. Now we found it and want to reuse it, so we need to mark it as not
           * deleted.
           */
          (host as VirtualVNode).flags &= ~VNodeFlags.Deleted;
          container.$scheduler$(ChoreType.COMPONENT, host, componentQRL, vNodeProps);
        }
      }
      descendContentToProject(jsxNode.children, host);
    } else {
      const lookupKey = jsxNode.key;
      const vNodeLookupKey = getKey(host);
      const lookupKeysAreEqual = lookupKey === vNodeLookupKey;
      const vNodeComponentHash = getComponentHash(host, container.$getObjectById$);
      const isInlineComponent = vNodeComponentHash == null;

      if ((host && !isInlineComponent) || lookupKey == null) {
        insertNewInlineComponent();
        host = vNewNode as VirtualVNode;
      } else if (!lookupKeysAreEqual) {
        const createNew = () => {
          // We did not find the inline component, create it.
          insertNewInlineComponent();
        };
        moveOrCreateKeyedNode(null, lookupKey, lookupKey, vParent as VirtualVNode, createNew);
        host = (vNewNode || vCurrent) as VirtualVNode;
      } else {
        // delete the key from the side buffer if it is the same component
        deleteFromSideBuffer(null, lookupKey);
      }

      if (host) {
        let componentHost: VNode | null = host;
        // Find the closest component host which has `OnRender` prop. This is need for subscriptions context.
        while (
          componentHost &&
          (vnode_isVirtualVNode(componentHost)
            ? (componentHost as VirtualVNode).getProp<OnRenderFn<any> | null>(
                OnRenderProp,
                null
              ) === null
            : true)
        ) {
          componentHost = componentHost.parent;
        }

        const jsxOutput = executeComponent(
          container,
          host,
          (componentHost || container.rootVNode) as HostElement,
          component as OnRenderFn<unknown>,
          jsxNode.props
        );

        asyncQueue.push(jsxOutput, host);
      }
    }
  }

  function insertNewComponent(
    host: VNode | null,
    componentQRL: QRLInternal<OnRenderFn<any>>,
    jsxProps: Props
  ) {
    if (host) {
      clearAllEffects(container, host);
    }
    vnode_insertBefore(
      journal,
      vParent as VirtualVNode,
      (vNewNode = vnode_newVirtual()),
      vCurrent && getInsertBefore()
    );
    const jsxNode = jsxValue as JSXNodeInternal;
    isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, VirtualType.Component);
    container.setHostProp(vNewNode, OnRenderProp, componentQRL);
    container.setHostProp(vNewNode, ELEMENT_PROPS, jsxProps);
    container.setHostProp(vNewNode, ELEMENT_KEY, jsxNode.key);
  }

  function insertNewInlineComponent() {
    vnode_insertBefore(
      journal,
      vParent as VirtualVNode,
      (vNewNode = vnode_newVirtual()),
      vCurrent && getInsertBefore()
    );
    const jsxNode = jsxValue as JSXNodeInternal;
    isDev && (vNewNode as VirtualVNode).setProp(DEBUG_TYPE, VirtualType.InlineComponent);
    (vNewNode as VirtualVNode).setProp(ELEMENT_PROPS, jsxNode.props);
    if (jsxNode.key) {
      (vNewNode as VirtualVNode).setProp(ELEMENT_KEY, jsxNode.key);
    }
  }

  function expectText(text: string) {
    if (vCurrent !== null) {
      const type = vnode_getType(vCurrent);
      if (type === 3 /* Text */) {
        if (text !== vnode_getText(vCurrent as TextVNode)) {
          vnode_setText(journal, vCurrent as TextVNode, text);
          return;
        }
        return;
      }
    }
    vnode_insertBefore(
      journal,
      vParent as VirtualVNode,
      (vNewNode = vnode_newText(container.document.createTextNode(text), text)),
      vCurrent
    );
  }
};

/**
 * Retrieve the key from the VNode.
 *
 * @param vNode - VNode to retrieve the key from
 * @returns Key
 */
function getKey(vNode: VNode | null): string | null {
  if (vNode == null) {
    return null;
  }
  return (vNode as VirtualVNode).getProp<string>(ELEMENT_KEY, null);
}

/**
 * Retrieve the component hash from the VNode.
 *
 * @param vNode - VNode to retrieve the key from
 * @param getObject - Function to retrieve the object by id for QComponent QRL
 * @returns Hash
 */
function getComponentHash(vNode: VNode | null, getObject: (id: string) => any): string | null {
  if (vNode == null) {
    return null;
  }
  const qrl = (vNode as VirtualVNode).getProp<QRLInternal>(OnRenderProp, getObject);
  return qrl ? qrl.$hash$ : null;
}

/**
 * Marker class for JSX projection.
 *
 * Assume you have component like so
 *
 * ```
 * <SomeComponent>
 *   some-text
 *   <span q:slot="name">some more text</span>
 *   more-text
 * </SomeComponent>
 * ```
 *
 * Before the `<SomeCompetent/>` is processed its children are transformed into:
 *
 * ```
 *   <Projection q:slot="">
 *     some-text
 *     more-text
 *   </Projection>
 *   <Projection q:slot="name">
 *     <span q:slot="name">some more text</span>
 *   </Projection>
 * ```
 */
function Projection() {}

function propsDiffer(src: Record<string, any>, dst: Record<string, any>): boolean {
  const srcEmpty = isPropsEmpty(src);
  const dstEmpty = isPropsEmpty(dst);
  if (srcEmpty && dstEmpty) {
    return false;
  }
  if (srcEmpty || dstEmpty) {
    return true;
  }

  const srcKeys = Object.keys(src);
  const dstKeys = Object.keys(dst);

  let srcLen = srcKeys.length;
  let dstLen = dstKeys.length;

  if ('children' in src) {
    srcLen--;
  }
  if (QBackRefs in src) {
    srcLen--;
  }
  if ('children' in dst) {
    dstLen--;
  }
  if (QBackRefs in dst) {
    dstLen--;
  }

  if (srcLen !== dstLen) {
    return true;
  }

  for (const key of srcKeys) {
    if (key === 'children' || key === QBackRefs) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(dst, key) || src[key] !== dst[key]) {
      return true;
    }
  }

  return false;
}

function isPropsEmpty(props: Record<string, any>): boolean {
  if (!props) {
    return true;
  }
  return Object.keys(props).length === 0;
}

/**
 * If vnode is removed, it is necessary to release all subscriptions associated with it.
 *
 * This function will traverse the vnode tree in depth-first order and release all subscriptions.
 *
 * The function takes into account:
 *
 * - Projection nodes by not recursing into them.
 * - Component nodes by recursing into the component content nodes (which may be projected).
 */
export function cleanup(container: ClientContainer, vNode: VNode) {
  let vCursor: VNode | null = vNode;
  // Depth first traversal
  if (vnode_isTextVNode(vNode)) {
    markVNodeAsDeleted(vCursor);
    // Text nodes don't have subscriptions or children;
    return;
  }
  let vParent: VNode | null = null;
  do {
    const type = vCursor.flags;
    if (type & VNodeFlags.ELEMENT_OR_VIRTUAL_MASK) {
      clearAllEffects(container, vCursor);
      markVNodeAsDeleted(vCursor);
      // Only elements and virtual nodes need to be traversed for children
      if (type & VNodeFlags.Virtual) {
        const seq = container.getHostProp<Array<any>>(vCursor as VirtualVNode, ELEMENT_SEQ);
        if (seq) {
          for (let i = 0; i < seq.length; i++) {
            const obj = seq[i];
            if (isTask(obj)) {
              const task = obj;
              clearAllEffects(container, task);
              if (task.$flags$ & TaskFlags.VISIBLE_TASK) {
                container.$scheduler$(ChoreType.CLEANUP_VISIBLE, task);
              } else {
                cleanupTask(task);
              }
            }
          }
        }
      }

      const isComponent =
        type & VNodeFlags.Virtual &&
        (vCursor as VirtualVNode).getProp<OnRenderFn<any> | null>(OnRenderProp, null) !== null;
      if (isComponent) {
        // SPECIAL CASE: If we are a component, we need to descend into the projected content and release the content.
        const attrs = vnode_getProps(vCursor as VirtualVNode);
        for (let i = 0; i < attrs.length; i = i + 2) {
          const key = attrs[i] as string;
          if (isSlotProp(key)) {
            const value = attrs[i + 1];
            if (value) {
              attrs[i + 1] = null; // prevent infinite loop
              const projection =
                typeof value === 'string'
                  ? vnode_locate(container.rootVNode, value)
                  : (value as unknown as VNode);
              let projectionChild = vnode_getFirstChild(projection);
              while (projectionChild) {
                cleanup(container, projectionChild);
                projectionChild = projectionChild.nextSibling as VNode | null;
              }

              cleanupStaleUnclaimedProjection(container.$journal$, projection);
            }
          }
        }
      }

      const isProjection = vnode_isProjection(vCursor);
      // Descend into children
      if (!isProjection) {
        // Only if it is not a projection
        const vFirstChild = vnode_getFirstChild(vCursor);
        if (vFirstChild) {
          vCursor = vFirstChild;
          continue;
        }
      } else if (vCursor === vNode) {
        /**
         * If it is a projection and we are at the root, then we should only walk the children to
         * materialize the projection content. This is because we could have references in the vnode
         * refs map which need to be materialized before cleanup.
         */
        const vFirstChild = vnode_getFirstChild(vCursor);
        if (vFirstChild) {
          vnode_walkVNode(vFirstChild, (vNode) => {
            /**
             * Instead of an ID, we store a direct reference to the VNode. This is necessary to
             * locate the slot's parent in a detached subtree, as the ID would become invalid.
             */
            if (vNode.flags & VNodeFlags.Virtual) {
              // The QSlotParent is used to find the slot parent during scheduling
              vNode.slotParent;
            }
          });
          return;
        }
      }
    } else if (type & VNodeFlags.Text) {
      markVNodeAsDeleted(vCursor);
    }
    // Out of children
    if (vCursor === vNode) {
      // we are where we started, this means that vNode has no children, so we are done.
      return;
    }
    // Out of children, go to next sibling
    const vNextSibling = vCursor.nextSibling as VNode | null;
    if (vNextSibling) {
      vCursor = vNextSibling;
      continue;
    }

    // Out of siblings, go to parent
    vParent = vCursor.parent;
    while (vParent) {
      if (vParent === vNode) {
        // We are back where we started, we are done.
        return;
      }
      const vNextParentSibling = vParent.nextSibling as VNode | null;
      if (vNextParentSibling) {
        vCursor = vNextParentSibling;
        break;
      }
      vParent = vParent.parent;
    }
    if (vParent == null) {
      // We are done.
      return;
    }
  } while (true as boolean);
}

function cleanupStaleUnclaimedProjection(journal: VNodeJournal, projection: VNode) {
  // we are removing a node where the projection would go after slot render.
  // This is not needed, so we need to cleanup still unclaimed projection
  const projectionParent = projection.parent;
  if (projectionParent) {
    const projectionParentType = projectionParent.flags;
    if (
      projectionParentType & VNodeFlags.Element &&
      vnode_getElementName(projectionParent as ElementVNode) === QTemplate
    ) {
      // if parent is the q:template element then projection is still unclaimed - remove it
      vnode_remove(journal, projectionParent as ElementVNode | VirtualVNode, projection, true);
    }
  }
}

function markVNodeAsDeleted(vCursor: VNode) {
  /**
   * Marks vCursor as deleted. We need to do this to prevent chores from running after the vnode is
   * removed. (for example signal subscriptions)
   */

  vCursor.flags |= VNodeFlags.Deleted;
}

/**
 * This marks the property as immutable. It is needed for the QRLs so that QwikLoader can get a hold
 * of them. This character must be `:` so that the `vnode_getAttr` can ignore them.
 */
export const HANDLER_PREFIX = ':';
let count = 0;
