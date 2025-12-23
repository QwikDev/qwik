import { isDev } from '@qwik.dev/core/build';
import { clearAllEffects, clearEffectSubscription } from '../reactive-primitives/cleanup';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import type { Signal } from '../reactive-primitives/signal.public';
import { SubscriptionData } from '../reactive-primitives/subscription-data';
import {
  EffectProperty,
  EffectSubscriptionProp,
  type Consumer,
} from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { executeComponent } from '../shared/component-execution';
import { SERIALIZABLE_STATE, type OnRenderFn } from '../shared/component.public';
import { assertDefined, assertFalse, assertTrue } from '../shared/error/assert';
import { QError, qError } from '../shared/error/error';
import { JSXNodeImpl, isJSXNode } from '../shared/jsx/jsx-node';
import { Fragment, type Props } from '../shared/jsx/jsx-runtime';
import {
  directGetPropsProxyProp,
  triggerPropsProxyEffect,
  type PropsProxy,
  type PropsProxyHandler,
} from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { SSRComment, SSRRaw, SkipRender } from '../shared/jsx/utils.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import type { HostElement, QElement, QwikLoaderEventScope, qWindow } from '../shared/types';
import { DEBUG_TYPE, QContainerValue, VirtualType } from '../shared/types';
import { escapeHTML } from '../shared/utils/character-escaping';
import { _CONST_PROPS, _OWNER, _PROPS_HANDLER, _VAR_PROPS } from '../shared/utils/constants';
import {
  fromCamelToKebabCase,
  getEventDataFromHtmlAttribute,
  getLoaderScopedEventName,
  getScopedEventName,
  isHtmlAttributeAnEventName,
} from '../shared/utils/event-names';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ,
  OnRenderProp,
  QBackRefs,
  QContainerAttr,
  QDefaultSlot,
  QSlot,
  QTemplate,
  dangerouslySetInnerHTML,
} from '../shared/utils/markers';
import { isPromise, retryOnPromise, catchError } from '../shared/utils/promises';
import { isSlotProp } from '../shared/utils/prop';
import { hasClassAttr } from '../shared/utils/scoped-styles';
import { serializeAttribute } from '../shared/utils/styles';
import { isArray, isObject, type ValueOrPromise } from '../shared/utils/types';
import { trackSignalAndAssignHost } from '../use/use-core';
import { TaskFlags, isTask } from '../use/use-task';
import { VNodeFlags, type ClientContainer } from './types';
import { mapApp_findIndx } from './util-mapArray';
import {
  vnode_ensureElementInflated,
  vnode_getDomParentVNode,
  vnode_getElementName,
  vnode_getFirstChild,
  vnode_getProjectionParentComponent,
  vnode_getProp,
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
  vnode_setAttr,
  vnode_setProp,
  vnode_setText,
  vnode_truncate,
  vnode_walkVNode,
  type VNodeJournal,
} from './vnode-utils';
import { getAttributeNamespace, getNewElementNamespaceData } from './vnode-namespace';
import { cleanupDestroyable } from '../use/utils/destroyable';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { isStore } from '../reactive-primitives/impl/store';
import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';
import type { VNode } from '../shared/vnode/vnode';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { TextVNode } from '../shared/vnode/text-vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { _EFFECT_BACK_REF } from '../reactive-primitives/backref';
import type { Cursor } from '../shared/cursor/cursor';

export const vnode_diff = (
  container: ClientContainer,
  journal: VNodeJournal,
  jsxNode: JSXChildren,
  vStartNode: VNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null
) => {
  /**
   * Stack is used to keep track of the state of the traversal.
   *
   * We push current state into the stack before descending into the child, and we pop the state
   * when we are done with the child.
   */
  const stack: any[] = [];

  const asyncQueue: Array<VNode | ValueOrPromise<JSXChildren> | Promise<JSXChildren>> = [];
  const asyncAttributePromises: Promise<void>[] = [];

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

  let vSiblings: Map<string, VNode> | null = null;
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

  function diff(jsxNode: JSXChildren, vStartNode: VNode) {
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
            expectVirtual(VirtualType.WrappedSignal, null);
            const unwrappedSignal =
              jsxValue instanceof WrappedSignalImpl ? jsxValue.$unwrapIfSignal$() : jsxValue;
            const hasUnwrappedSignal = vCurrent?.[_EFFECT_BACK_REF]
              ?.get(EffectProperty.VNODE)
              ?.[EffectSubscriptionProp.BACK_REF]?.has(unwrappedSignal);
            if (!hasUnwrappedSignal) {
              const vHost = (vNewNode || vCurrent)!;
              descend(
                resolveSignalAndDescend(() =>
                  trackSignalAndAssignHost(unwrappedSignal, vHost, EffectProperty.VNODE, container)
                ),
                true
              );
            }
          } else if (isPromise(jsxValue)) {
            expectVirtual(VirtualType.Awaited, null);
            asyncQueue.push(jsxValue, vNewNode || vCurrent);
          } else if (isJSXNode(jsxValue)) {
            const type = jsxValue.type;
            if (typeof type === 'string') {
              expectNoMoreTextNodes();
              expectElement(jsxValue, type);

              const hasDangerousInnerHTML =
                (jsxValue.constProps && dangerouslySetInnerHTML in jsxValue.constProps) ||
                dangerouslySetInnerHTML in jsxValue.varProps;
              if (hasDangerousInnerHTML) {
                expectNoChildren(false);
              } else {
                descend(jsxValue.children, true);
              }
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

  function resolveSignalAndDescend(fn: () => ValueOrPromise<any>): ValueOrPromise<any> {
    try {
      return fn();
    } catch (e) {
      // Signal threw a promise (async computed signal) - handle retry and async queue
      if (isPromise(e)) {
        // The thrown promise will resolve when the signal is ready, then retry fn() with retry logic
        const retryPromise = e.then(() => retryOnPromise(fn));
        asyncQueue.push(retryPromise, vNewNode || vCurrent);
        return null;
      }
      throw e;
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
      vSiblings = null;
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
      vSiblings = stack.pop();
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
      stack.push(vParent, vCurrent, vNewNode, vSiblingsArray, vSiblings, vSideBuffer);
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
      return new JSXNodeImpl(Projection, null, null, [], slotName);
    };

    const projections: Array<string | JSXNodeInternal> = [];
    if (host) {
      const props = host.props;
      if (props) {
        // we need to create empty projections for all the slots to remove unused slots content
        for (const prop of Object.keys(props)) {
          if (isSlotProp(prop)) {
            const slotName = prop;
            projections.push(slotName);
            projections.push(createProjectionJSXNode(slotName));
          }
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
    vCurrent = vnode_getProp<VNode | null>(vParent as VirtualVNode, slotName, (id: string) =>
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
      isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
      isDev && vnode_setProp(vNewNode as VirtualVNode, 'q:code', 'expectProjection');
      vnode_setProp(vNewNode as VirtualVNode, QSlot, slotName);
      (vNewNode as VirtualVNode).slotParent = vParent;
      vnode_setProp(vParent as VirtualVNode, slotName, vNewNode);
    }
  }

  function expectSlot() {
    const vHost = vnode_getProjectionParentComponent(vParent);

    const slotNameKey = getSlotNameKey(vHost);

    const vProjectedNode = vHost
      ? vnode_getProp<VirtualVNode | null>(
          vHost as VirtualVNode,
          slotNameKey,
          // for slots this id is vnode ref id
          null // Projections should have been resolved through container.ensureProjectionResolved
          //(id) => vnode_locate(container.rootVNode, id)
        )
      : null;

    if (vProjectedNode == null) {
      // Nothing to project, so render content of the slot.
      vnode_insertBefore(
        journal,
        vParent as ElementVNode | VirtualVNode,
        (vNewNode = vnode_newVirtual()),
        vCurrent && getInsertBefore()
      );
      vnode_setProp(vNewNode as VirtualVNode, QSlot, slotNameKey);
      vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, vNewNode);
      isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
      isDev && vnode_setProp(vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);
      return false;
    } else if (vProjectedNode === vCurrent) {
      // All is good.
    } else {
      // move from q:template to the target node
      vnode_insertBefore(
        journal,
        vParent as ElementVNode | VirtualVNode,
        (vNewNode = vProjectedNode),
        vCurrent && getInsertBefore()
      );
      vnode_setProp(vNewNode as VirtualVNode, QSlot, slotNameKey);
      vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, vNewNode);
      isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
      isDev && vnode_setProp(vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);
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
        cleanup(container, journal, vNode, cursor);
        vnode_remove(journal, vParent, vNode, true);
      }
      vSideBuffer.clear();
      vSideBuffer = null;
    }
    vCurrent = null;
  }

  function drainAsyncQueue(): ValueOrPromise<void> {
    while (asyncQueue.length) {
      const jsxNode = asyncQueue.shift() as ValueOrPromise<JSXChildren>;
      const vHostNode = asyncQueue.shift() as VNode;

      if (isPromise(jsxNode)) {
        return jsxNode
          .then((jsxNode) => {
            diff(jsxNode, vHostNode);
            return drainAsyncQueue();
          })
          .catch((e) => {
            container.handleError(e, vHostNode);
            return drainAsyncQueue();
          });
      } else {
        diff(jsxNode, vHostNode);
      }
    }
    // Wait for all async attribute promises to complete, then check for more work
    if (asyncAttributePromises.length) {
      const promises = asyncAttributePromises.splice(0);
      return Promise.all(promises).then(() => {
        // After attributes are set, check if there's more work in the queue
        return drainAsyncQueue();
      });
    }
  }

  function expectNoChildren(removeDOM = true) {
    const vFirstChild = vCurrent && vnode_getFirstChild(vCurrent);
    if (vFirstChild !== null) {
      let vChild: VNode | null = vFirstChild;
      while (vChild) {
        cleanup(container, journal, vChild, cursor);
        vChild = vChild.nextSibling as VNode | null;
      }
      vnode_truncate(journal, vCurrent as ElementVNode | VirtualVNode, vFirstChild, removeDOM);
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
          cleanup(container, journal, toRemove, cursor);
          // If we are diffing projection than the parent is not the parent of the node.
          // If that is the case we don't want to remove the node from the parent.
          vnode_remove(journal, vParent, toRemove, true);
        }
      }
    }
  }

  function expectNoMoreTextNodes() {
    while (vCurrent !== null && vnode_isTextVNode(vCurrent)) {
      cleanup(container, journal, vCurrent, cursor);
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

    function setAttribute(key: string, value: any, vHost: ElementVNode) {
      value = serializeAttribute(key, value, scopedStyleIdPrefix);
      if (value != null) {
        if (vHost.flags & VNodeFlags.NS_svg) {
          // only svg elements can have namespace attributes
          const namespace = getAttributeNamespace(key);
          if (namespace) {
            element.setAttributeNS(namespace, key, value);
            return;
          }
        }
        element.setAttribute(key, value);
      }
    }

    const { constProps } = jsx;
    let needsQDispatchEventPatch = false;
    if (constProps) {
      // Const props are, well, constant, they will never change!
      // For this reason we can cheat and write them directly into the DOM.
      // We never tell the vNode about them saving us time and memory.
      for (const key in constProps) {
        let value = constProps[key];
        if (isHtmlAttributeAnEventName(key)) {
          const data = getEventDataFromHtmlAttribute(key);
          if (data) {
            const [scope, eventName] = data;
            const scopedEvent = getScopedEventName(scope, eventName);
            const loaderScopedEvent = getLoaderScopedEventName(scope, scopedEvent);

            if (eventName) {
              vnode_setProp(vNewNode!, HANDLER_PREFIX + ':' + scopedEvent, value);
              if (scope) {
                // window and document need attrs so qwik loader can find them
                vnode_setAttr(journal, vNewNode!, key, '');
              }
              // register an event for qwik loader (window/document prefixed with '-')
              registerQwikLoaderEvent(loaderScopedEvent);
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
          const vHost = vNewNode as ElementVNode;
          const signal = value as Signal<unknown>;
          value = retryOnPromise(() =>
            trackSignalAndAssignHost(signal, vHost, key, container, CONST_SUBSCRIPTION_DATA)
          );
        }

        if (isPromise(value)) {
          const vHost = vNewNode as ElementVNode;
          const attributePromise = value.then((resolvedValue) =>
            setAttribute(key, resolvedValue, vHost)
          );
          asyncAttributePromises.push(attributePromise);
          continue;
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

        setAttribute(key, value, vNewNode as ElementVNode);
      }
    }
    const key = jsx.key;
    if (key) {
      (vNewNode as ElementVNode).key = key;
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
    const currentKey = getKey(vCurrent as VirtualVNode | ElementVNode | TextVNode | null);
    if (!isSameElementName || jsxKey !== currentKey) {
      const sideBufferKey = getSideBufferKey(elementName, jsxKey);
      const createNew = () => (needsQDispatchEventPatch = createNewElement(jsx, elementName));
      moveOrCreateKeyedNode(elementName, jsxKey, sideBufferKey, vParent as ElementVNode, createNew);
    } else {
      // delete the key from the side buffer if it is the same element
      deleteFromSideBuffer(elementName, jsxKey);
    }

    // reconcile attributes

    const jsxProps = jsx.varProps;
    const vNode = (vNewNode || vCurrent) as ElementVNode;

    const element = vNode.node as QElement;
    if (!element.vNode) {
      element.vNode = vNode;
    }

    if (jsxProps) {
      needsQDispatchEventPatch =
        diffProps(
          vNode,
          jsxProps,
          (vNode.props ||= {}),
          (isDev && getFileLocationFromJsx(jsx.dev)) || null
        ) || needsQDispatchEventPatch;
    }
    if (needsQDispatchEventPatch) {
      // Event handler needs to be patched onto the element.
      if (!element.qDispatchEvent) {
        element.qDispatchEvent = (event: Event, scope: QwikLoaderEventScope) => {
          if (vNode.flags & VNodeFlags.Deleted) {
            return;
          }
          const eventName = fromCamelToKebabCase(event.type);
          const eventProp = ':' + scope.substring(1) + ':' + eventName;
          const qrls = [
            vnode_getProp<QRL>(vNode, eventProp, null),
            vnode_getProp<QRL>(vNode, HANDLER_PREFIX + eventProp, null),
          ];

          for (const qrl of qrls.flat(2)) {
            if (qrl) {
              catchError(qrl(event, element), (e) => {
                container.handleError(e, vNode);
              });
            }
          }
        };
      }
    }
  }

  function diffProps(
    vnode: ElementVNode,
    newAttrs: Record<string, any>,
    oldAttrs: Record<string, any>,
    currentFile: string | null
  ): boolean {
    vnode_ensureElementInflated(vnode);
    let patchEventDispatch = false;

    const setAttribute = (vnode: ElementVNode, key: string, value: any) => {
      const serializedValue =
        value != null ? serializeAttribute(key, value, scopedStyleIdPrefix) : null;
      vnode_setAttr(journal, vnode, key, serializedValue);
    };

    const record = (key: string, value: any) => {
      if (key.startsWith(':')) {
        vnode_setProp(vnode, key, value);
        return;
      }

      if (key === 'ref') {
        const element = vnode.node;
        if (isSignal(value)) {
          value.value = element;
          return;
        } else if (typeof value === 'function') {
          value(element);
          return;
        } else {
          throw qError(QError.invalidRefValue, [currentFile]);
        }
      }

      const currentEffect = vnode[_EFFECT_BACK_REF]?.get(key);
      if (isSignal(value)) {
        const unwrappedSignal =
          value instanceof WrappedSignalImpl ? value.$unwrapIfSignal$() : value;
        const currentSignal = currentEffect?.[EffectSubscriptionProp.CONSUMER];
        if (currentSignal === unwrappedSignal) {
          return;
        }
        if (currentEffect) {
          clearEffectSubscription(container, currentEffect);
        }

        const vHost = vnode as ElementVNode;
        value = retryOnPromise(() =>
          trackSignalAndAssignHost(
            unwrappedSignal,
            vHost,
            key,
            container,
            NON_CONST_SUBSCRIPTION_DATA
          )
        );
      } else {
        if (currentEffect) {
          clearEffectSubscription(container, currentEffect);
        }
      }

      if (isPromise(value)) {
        const vHost = vnode as ElementVNode;
        const attributePromise = value.then((resolvedValue) => {
          setAttribute(vHost, key, resolvedValue);
        });
        asyncAttributePromises.push(attributePromise);
        return;
      }

      setAttribute(vnode, key, value);
    };

    const recordJsxEvent = (key: string, value: any) => {
      const data = getEventDataFromHtmlAttribute(key);
      if (data) {
        const [scope, eventName] = data;
        const scopedEvent = getScopedEventName(scope, eventName);
        const loaderScopedEvent = getLoaderScopedEventName(scope, scopedEvent);
        record(':' + scopedEvent, value);
        registerQwikLoaderEvent(loaderScopedEvent);
        patchEventDispatch = true;
      }
    };

    // Actual diffing logic
    // Apply all new attributes
    for (const key of Object.keys(newAttrs)) {
      const newValue = newAttrs[key];
      const isEvent = isHtmlAttributeAnEventName(key);

      if (key in oldAttrs) {
        if (newValue !== oldAttrs[key]) {
          isEvent ? recordJsxEvent(key, newValue) : record(key, newValue);
        }
      } else if (newValue != null) {
        isEvent ? recordJsxEvent(key, newValue) : record(key, newValue);
      }
    }

    // Remove attributes that no longer exist in new props
    for (const key of Object.keys(oldAttrs)) {
      if (
        !(key in newAttrs) &&
        !key.startsWith(HANDLER_PREFIX) &&
        !isHtmlAttributeAnEventName(key)
      ) {
        record(key, null);
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

  function retrieveChildWithKey(
    nodeName: string | null,
    key: string | null
  ): ElementVNode | VirtualVNode | null {
    let vNodeWithKey: ElementVNode | VirtualVNode | null = null;
    if (vSiblings === null) {
      // it is not materialized; so materialize it.
      vSiblings = new Map<string, VNode>();
      vSiblingsArray = [];
      let vNode = vCurrent;
      while (vNode) {
        const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
        const vKey =
          getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
          getComponentHash(vNode, container.$getObjectById$);
        if (vNodeWithKey === null && vKey == key && name == nodeName) {
          vNodeWithKey = vNode as ElementVNode | VirtualVNode;
        } else {
          if (vKey === null) {
            vSiblingsArray.push(name, vNode);
          } else {
            // we only add the elements which we did not find yet.
            vSiblings.set(getSideBufferKey(name, vKey), vNode);
          }
        }
        vNode = vNode.nextSibling as VNode | null;
      }
    } else {
      if (key === null) {
        for (let i = 0; i < vSiblingsArray!.length; i += 2) {
          if (vSiblingsArray![i] === nodeName) {
            vNodeWithKey = vSiblingsArray![i + 1] as ElementVNode | VirtualVNode;
            vSiblingsArray!.splice(i, 2);
            break;
          }
        }
      } else {
        const siblingsKey = getSideBufferKey(nodeName, key);
        if (vSiblings.has(siblingsKey)) {
          vNodeWithKey = vSiblings.get(siblingsKey) as ElementVNode | VirtualVNode;
          vSiblings.delete(siblingsKey);
        }
      }
    }

    collectSideBufferSiblings(vNodeWithKey);

    return vNodeWithKey;
  }

  function collectSideBufferSiblings(targetNode: VNode | null): void {
    if (!targetNode) {
      if (vCurrent) {
        const name = vnode_isElementVNode(vCurrent) ? vnode_getElementName(vCurrent) : null;
        const vKey =
          getKey(vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
          getComponentHash(vCurrent, container.$getObjectById$);
        if (vKey != null) {
          const sideBufferKey = getSideBufferKey(name, vKey);
          vSideBuffer ||= new Map();
          vSideBuffer.set(sideBufferKey, vCurrent);
          vSiblings?.delete(sideBufferKey);
        }
      }

      return;
    }

    // Walk from vCurrent up to the target node and collect all keyed siblings
    let vNode = vCurrent;
    while (vNode && vNode !== targetNode) {
      const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
      const vKey =
        getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(vNode, container.$getObjectById$);

      if (vKey != null) {
        const sideBufferKey = getSideBufferKey(name, vKey);
        vSideBuffer ||= new Map();
        vSideBuffer.set(sideBufferKey, vNode);
        vSiblings?.delete(sideBufferKey);
      }

      vNode = vNode.nextSibling as VNode | null;
    }
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
            getKey(vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
            getComponentHash(vCurrent, container.$getObjectById$);
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
        vnode_insertBefore(
          journal,
          parentForInsert as ElementVNode | VirtualVNode,
          buffered,
          vCurrent
        );
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
    const currentKey = getKey(vCurrent as VirtualVNode | ElementVNode | TextVNode | null);
    const currentIsVirtual = vCurrent && vnode_isVirtualVNode(vCurrent);
    const isSameNode = currentIsVirtual && currentKey === jsxKey && (checkKey ? !!jsxKey : true);

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
      (vNewNode as VirtualVNode).key = jsxKey;
      isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, type);
    };
    // For fragments without a key, always create a new virtual node (ensures rerender semantics)
    if (jsxKey === null) {
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
      const jsxProps = jsxNode.props as PropsProxy;
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
        const vNodeProps = vnode_getProp<PropsProxy | null>(
          host as VirtualVNode,
          ELEMENT_PROPS,
          container.$getObjectById$
        );
        if (!shouldRender) {
          shouldRender ||= handleProps(host, jsxProps, vNodeProps, container);
        }

        if (shouldRender) {
          // Assign the new QRL instance to the host.
          // Unfortunately it is created every time, something to fix in the optimizer.
          vnode_setProp(host as VirtualVNode, OnRenderProp, componentQRL);

          /**
           * Mark host as not deleted. The host could have been marked as deleted if it there was a
           * cleanup run. Now we found it and want to reuse it, so we need to mark it as not
           * deleted.
           */
          (host as VirtualVNode).flags &= ~VNodeFlags.Deleted;
          markVNodeDirty(container, host as VirtualVNode, ChoreBits.COMPONENT, cursor);
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
            ? vnode_getProp<OnRenderFn<any> | null>(
                componentHost as VirtualVNode,
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
    isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Component);
    vnode_setProp(vNewNode as VirtualVNode, OnRenderProp, componentQRL);
    vnode_setProp(vNewNode as VirtualVNode, ELEMENT_PROPS, jsxProps);
    (vNewNode as VirtualVNode).key = jsxNode.key;
  }

  function insertNewInlineComponent() {
    vnode_insertBefore(
      journal,
      vParent as VirtualVNode,
      (vNewNode = vnode_newVirtual()),
      vCurrent && getInsertBefore()
    );
    const jsxNode = jsxValue as JSXNodeInternal;
    isDev && vnode_setProp(vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.InlineComponent);
    vnode_setProp(vNewNode as VirtualVNode, ELEMENT_PROPS, jsxNode.props);
    if (jsxNode.key) {
      (vNewNode as VirtualVNode).key = jsxNode.key;
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
function getKey(vNode: VirtualVNode | ElementVNode | TextVNode | null): string | null {
  if (vNode == null || vnode_isTextVNode(vNode)) {
    return null;
  }
  return vNode.key;
}

/**
 * Retrieve the component hash from the VNode.
 *
 * @param vNode - VNode to retrieve the key from
 * @param getObject - Function to retrieve the object by id for QComponent QRL
 * @returns Hash
 */
function getComponentHash(vNode: VNode | null, getObject: (id: string) => any): string | null {
  if (vNode == null || vnode_isTextVNode(vNode)) {
    return null;
  }
  const qrl = vnode_getProp<QRLInternal>(vNode as VirtualVNode, OnRenderProp, getObject);
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

function handleProps(
  host: VirtualVNode,
  jsxProps: PropsProxy,
  vNodeProps: PropsProxy | null,
  container: ClientContainer
): boolean {
  let shouldRender = false;
  if (vNodeProps) {
    const effects = vNodeProps[_PROPS_HANDLER].$effects$;
    const constPropsDifferent = handleChangedProps(
      jsxProps[_CONST_PROPS],
      vNodeProps[_CONST_PROPS],
      vNodeProps[_PROPS_HANDLER],
      container,
      false
    );
    shouldRender ||= constPropsDifferent;
    if (effects && effects.size > 0) {
      handleChangedProps(
        jsxProps[_VAR_PROPS],
        vNodeProps[_VAR_PROPS],
        vNodeProps[_PROPS_HANDLER],
        container,
        true
      );
      // don't mark as should render, effects will take care of it
    }
    // Update the owner after all props have been synced
    vNodeProps[_OWNER] = (jsxProps as PropsProxy)[_OWNER];
  } else if (jsxProps) {
    // If there is no props instance, create a new one.
    // We can do this because we are not using the props instance for anything else.
    vnode_setProp(host as VirtualVNode, ELEMENT_PROPS, jsxProps);
    vNodeProps = jsxProps;
  }
  return shouldRender;
}

function handleChangedProps(
  src: Record<string, any> | null | undefined,
  dst: Record<string, any> | null | undefined,
  propsHandler: PropsProxyHandler,
  container: ClientContainer,
  triggerEffects: boolean = true
): boolean {
  if (isPropsEmpty(src) && isPropsEmpty(dst)) {
    return false;
  }

  propsHandler.$container$ = container;
  let changed = false;

  // Update changed/added props from src
  if (src) {
    for (const key in src) {
      if (key === 'children' || key === QBackRefs) {
        continue;
      }
      if (!dst || src[key] !== dst[key]) {
        changed = true;
        if (triggerEffects) {
          if (dst) {
            // Update the value in dst BEFORE triggering effects
            // so effects see the new value
            // Note: Value is not triggering effects, because we are modyfing direct VAR_PROPS object
            dst[key] = src[key];
          }
          triggerPropsProxyEffect(propsHandler, key);
        } else {
          // Early return for const props (no effects)
          return true;
        }
      }
    }
  }

  // Remove props that are in dst but not in src
  if (dst) {
    for (const key in dst) {
      if (key === 'children' || key === QBackRefs) {
        continue;
      }
      if (!src || !(key in src)) {
        changed = true;
        if (triggerEffects) {
          delete dst[key];
          triggerPropsProxyEffect(propsHandler, key);
        }
      }
    }
  }

  return changed;
}

function isPropsEmpty(props: Record<string, any> | null | undefined): boolean {
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
 *
 * @param cursorRoot - Optional cursor root (vStartNode) to propagate dirty bits to during diff.
 */
export function cleanup(
  container: ClientContainer,
  journal: VNodeJournal,
  vNode: VNode,
  cursorRoot: VNode | null = null
) {
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

      const isComponent =
        type & VNodeFlags.Virtual &&
        vnode_getProp<OnRenderFn<any> | null>(vCursor as VirtualVNode, OnRenderProp, null) !== null;
      if (isComponent) {
        // cleanup q:seq content
        const seq = container.getHostProp<Array<any>>(vCursor as VirtualVNode, ELEMENT_SEQ);
        if (seq) {
          for (let i = 0; i < seq.length; i++) {
            const obj = seq[i];
            if (isObject(obj)) {
              const objIsTask = isTask(obj);
              if (objIsTask && obj.$flags$ & TaskFlags.VISIBLE_TASK) {
                obj.$flags$ |= TaskFlags.NEEDS_CLEANUP;
                markVNodeDirty(container, vCursor, ChoreBits.CLEANUP, cursorRoot);

                // don't call cleanupDestroyable yet, do it by the scheduler
                continue;
              } else if (obj instanceof SignalImpl || isStore(obj)) {
                clearAllEffects(container, obj as Consumer);
              }

              if (objIsTask || obj instanceof AsyncComputedSignalImpl) {
                cleanupDestroyable(obj);
              }
            }
          }
        }

        // SPECIAL CASE: If we are a component, we need to descend into the projected content and release the content.
        const attrs = (vCursor as VirtualVNode).props;
        if (attrs) {
          for (const key of Object.keys(attrs)) {
            if (isSlotProp(key)) {
              const value = attrs[key];
              if (value) {
                attrs[key] = null; // prevent infinite loop
                const projection =
                  typeof value === 'string'
                    ? vnode_locate(container.rootVNode, value)
                    : (value as unknown as VNode);
                let projectionChild = vnode_getFirstChild(projection);
                while (projectionChild) {
                  cleanup(container, journal, projectionChild, cursorRoot);
                  projectionChild = projectionChild.nextSibling as VNode | null;
                }

                cleanupStaleUnclaimedProjection(journal, projection);
              }
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
      }
      // TODO: probably can be removed
      else if (vCursor === vNode) {
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
