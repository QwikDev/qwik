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
  getKey,
  getComponentHash,
} from './vnode-utils';
import {
  cleanupSideBuffer,
  deleteFromSideBuffer,
  getSideBufferKey,
  moveOrCreateKeyedNode,
} from './vnode-diff-side-buffer';
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

/**
 * Helper to get the next sibling of a VNode. Extracted to module scope to help V8 inline it
 * reliably.
 */
function peekNextSibling(vCurrent: VNode | null): VNode | null {
  return vCurrent ? (vCurrent.nextSibling as VNode | null) : null;
}

const _hasOwnProperty = Object.prototype.hasOwnProperty;

/** Helper to set an attribute on a vnode. Extracted to module scope to avoid closure allocation. */
function setAttribute(
  journal: VNodeJournal,
  vnode: ElementVNode,
  key: string,
  value: any,
  scopedStyleIdPrefix: string | null
) {
  const serializedValue =
    value != null ? serializeAttribute(key, value, scopedStyleIdPrefix) : null;
  vnode_setAttr(journal, vnode, key, serializedValue);
}

export interface DiffState {
  vParent: ElementVNode | VirtualVNode;
  /// Current node we compare against. (Think of it as a cursor.)
  /// (Node can be null, if we are at the end of the list.)
  vCurrent: VNode | null;
  /// When we insert new node we start it here so that we can descend into it.
  /// NOTE: it can't be stored in `vCurrent` because `vNewNode` is in journal
  /// and is not connected to the tree.
  vNewNode: VNode | null;
  vSiblings: Map<string, VNode> | null;
  /// The array even indices will contains keys and odd indices the non keyed siblings.
  vSiblingsArray: Array<string | VNode | null> | null;
  /// Side buffer to store nodes that are moved out of order during key scanning.
  /// This contains nodes that were found before the target key and need to be moved later.
  vSideBuffer: Map<string, VNode> | null;
  /// Current set of JSX children.
  jsxChildren: JSXChildren[];
  // Current JSX child.
  jsxValue: JSXChildren;
  jsxIdx: number;
  jsxCount: number;
  // When we descend into children, we need to skip advance() because we just descended.
  shouldAdvance: boolean;
}

export interface DiffContext {
  container: ClientContainer;
  journal: VNodeJournal;
  cursor: Cursor;
  scopedStyleIdPrefix: string | null;
  stack: any[];
  asyncQueue: Array<VNode | ValueOrPromise<JSXChildren> | Promise<JSXChildren>>;
  asyncAttributePromises: Promise<void>[];
  state: DiffState;
  constSubscriptionData: SubscriptionData;
  nonConstSubscriptionData: SubscriptionData;
}

export const vnode_diff = (
  container: ClientContainer,
  journal: VNodeJournal,
  jsxNode: JSXChildren,
  vStartNode: VNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null
) => {
  const ctx: DiffContext = {
    container,
    journal,
    cursor,
    scopedStyleIdPrefix,
    stack: [],
    asyncQueue: [],
    asyncAttributePromises: [],
    state: {
      vParent: null!,
      vCurrent: null,
      vNewNode: null,
      vSiblings: null,
      vSiblingsArray: null,
      vSideBuffer: null,
      jsxChildren: null!,
      jsxValue: null,
      jsxIdx: 0,
      jsxCount: 0,
      shouldAdvance: true,
    },
    constSubscriptionData: new SubscriptionData({
      $scopedStyleIdPrefix$: scopedStyleIdPrefix,
      $isConst$: true,
    }),
    nonConstSubscriptionData: new SubscriptionData({
      $scopedStyleIdPrefix$: scopedStyleIdPrefix,
      $isConst$: false,
    }),
  };

  diff(ctx, jsxNode, vStartNode);
  return drainAsyncQueue(ctx);
};

function diff(ctx: DiffContext, jsxNode: JSXChildren, vStartNode: VNode) {
  const { state, stack, container, journal, cursor } = ctx;
  assertFalse(vnode_isVNode(jsxNode), 'JSXNode should not be a VNode');
  assertTrue(vnode_isVNode(vStartNode), 'vStartNode should be a VNode');
  state.vParent = vStartNode as ElementVNode | VirtualVNode;
  state.vNewNode = null;
  state.vCurrent = vnode_getFirstChild(vStartNode);
  stackPush(ctx, jsxNode, true);

  if (state.vParent.flags & VNodeFlags.Deleted) {
    // Ignore diff if the parent is deleted.
    return;
  }

  while (stack.length) {
    while (state.jsxIdx < state.jsxCount) {
      assertFalse(state.vParent === state.vCurrent, "Parent and current can't be the same");
      if (typeof state.jsxValue === 'string') {
        expectText(ctx, state.jsxValue);
      } else if (typeof state.jsxValue === 'number') {
        expectText(ctx, String(state.jsxValue));
      } else if (state.jsxValue && typeof state.jsxValue === 'object') {
        if (Array.isArray(state.jsxValue)) {
          descend(ctx, state.jsxValue, false);
        } else if (isSignal(state.jsxValue)) {
          expectVirtual(ctx, VirtualType.WrappedSignal, null);
          const unwrappedSignal =
            state.jsxValue instanceof WrappedSignalImpl
              ? state.jsxValue.$unwrapIfSignal$()
              : state.jsxValue;
          const hasUnwrappedSignal = state.vCurrent?.[_EFFECT_BACK_REF]
            ?.get(EffectProperty.VNODE)
            ?.[EffectSubscriptionProp.BACK_REF]?.has(unwrappedSignal);
          if (!hasUnwrappedSignal) {
            const vHost = (state.vNewNode || state.vCurrent)!;
            descend(
              ctx,
              resolveSignalAndDescend(ctx, () =>
                trackSignalAndAssignHost(unwrappedSignal, vHost, EffectProperty.VNODE, container)
              ),
              true
            );
          }
        } else if (isPromise(state.jsxValue)) {
          expectVirtual(ctx, VirtualType.Awaited, null);
          ctx.asyncQueue.push(state.jsxValue, state.vNewNode || state.vCurrent);
        } else if (isJSXNode(state.jsxValue)) {
          const type = state.jsxValue.type;
          if (typeof type === 'string') {
            expectNoMoreTextNodes(ctx);
            expectElement(ctx, state.jsxValue, type);

            const hasDangerousInnerHTML =
              (state.jsxValue.constProps &&
                _hasOwnProperty.call(state.jsxValue.constProps, dangerouslySetInnerHTML)) ||
              _hasOwnProperty.call(state.jsxValue.varProps, dangerouslySetInnerHTML);
            if (hasDangerousInnerHTML) {
              expectNoChildren(ctx, false);
            } else {
              descend(ctx, state.jsxValue.children, true);
            }
          } else if (typeof type === 'function') {
            if (type === Fragment) {
              expectNoMoreTextNodes(ctx);
              expectVirtual(ctx, VirtualType.Fragment, state.jsxValue.key);
              descend(ctx, state.jsxValue.children, true);
            } else if (type === Slot) {
              expectNoMoreTextNodes(ctx);
              if (!expectSlot(ctx)) {
                // nothing to project, so try to render the Slot default content.
                descend(ctx, state.jsxValue.children, true);
              }
            } else if (type === Projection) {
              expectProjection(ctx);
              descend(
                ctx,
                state.jsxValue.children,
                true,
                // special case for projection, we don't want to expect no children
                // because the projection's children are not removed
                false
              );
            } else if (type === SSRComment) {
              expectNoMore(ctx);
            } else if (type === SSRRaw) {
              expectNoMore(ctx);
            } else {
              // Must be a component
              expectNoMoreTextNodes(ctx);
              expectComponent(ctx, type);
            }
          }
        }
      } else if (state.jsxValue === (SkipRender as JSXChildren)) {
        // do nothing, we are skipping this node
      } else {
        expectText(ctx, '');
      }
      advance(ctx);
    }
    expectNoMore(ctx);
    cleanupSideBuffer(state, container, journal, cursor);
    ascend(ctx);
  }
}

function resolveSignalAndDescend(
  ctx: DiffContext,
  fn: () => ValueOrPromise<any>
): ValueOrPromise<any> {
  try {
    return fn();
  } catch (e) {
    // Signal threw a promise (async computed signal) - handle retry and async queue
    if (isPromise(e)) {
      // The thrown promise will resolve when the signal is ready, then retry fn() with retry logic
      const retryPromise = e.then(() => retryOnPromise(fn));
      ctx.asyncQueue.push(retryPromise, ctx.state.vNewNode || ctx.state.vCurrent);
      return null;
    }
    throw e;
  }
}

function advance(ctx: DiffContext) {
  const { state, stack } = ctx;
  if (!state.shouldAdvance) {
    state.shouldAdvance = true;
    return;
  }
  state.jsxIdx++;
  if (state.jsxIdx < state.jsxCount) {
    state.jsxValue = state.jsxChildren[state.jsxIdx];
  } else if (stack.length > 0 && stack[stack.length - 1] === false) {
    // this was special `descendVNode === false` so pop and try again
    return ascend(ctx);
  }
  if (state.vNewNode !== null) {
    // We have a new Node.
    // This means that the `vCurrent` was deemed not useful and we inserted in front of it.
    // This means that the next node we should look at is the `vCurrent` so just clear the
    // vNewNode  and try again.
    state.vNewNode = null;
  } else {
    state.vCurrent = peekNextSibling(state.vCurrent);
  }
}

function descend(
  ctx: DiffContext,
  children: JSXChildren,
  descendVNode: boolean,
  shouldExpectNoChildren: boolean = true
) {
  const { state } = ctx;
  if (
    shouldExpectNoChildren &&
    (children == null || (descendVNode && isArray(children) && children.length === 0))
  ) {
    expectNoChildren(ctx);
    return;
  }
  stackPush(ctx, children, descendVNode);
  if (descendVNode) {
    assertDefined(state.vCurrent || state.vNewNode, 'Expecting vCurrent to be defined.');
    state.vSideBuffer = null;
    state.vSiblings = null;
    state.vSiblingsArray = null;
    state.vParent = (state.vNewNode || state.vCurrent!) as ElementVNode | VirtualVNode;
    state.vCurrent = vnode_getFirstChild(state.vParent);
    state.vNewNode = null;
  }
  state.shouldAdvance = false;
}

function ascend(ctx: DiffContext) {
  const { state, stack } = ctx;
  const descendVNode = stack.pop(); // boolean: descendVNode
  if (descendVNode) {
    state.vSideBuffer = stack.pop();
    state.vSiblings = stack.pop();
    state.vSiblingsArray = stack.pop();
    state.vNewNode = stack.pop();
    state.vCurrent = stack.pop();
    state.vParent = stack.pop();
  }
  state.jsxValue = stack.pop();
  state.jsxCount = stack.pop();
  state.jsxIdx = stack.pop();
  state.jsxChildren = stack.pop();
  advance(ctx);
}

function stackPush(ctx: DiffContext, children: JSXChildren, descendVNode: boolean) {
  const { state, stack } = ctx;
  stack.push(state.jsxChildren, state.jsxIdx, state.jsxCount, state.jsxValue);
  if (descendVNode) {
    stack.push(
      state.vParent,
      state.vCurrent,
      state.vNewNode,
      state.vSiblingsArray,
      state.vSiblings,
      state.vSideBuffer
    );
  }
  stack.push(descendVNode);
  if (Array.isArray(children)) {
    state.jsxIdx = 0;
    state.jsxCount = children.length;
    state.jsxChildren = children;
    state.jsxValue = state.jsxCount > 0 ? children[0] : null;
  } else if (children === undefined) {
    // no children
    state.jsxIdx = 0;
    state.jsxValue = null;
    state.jsxChildren = null!;
    state.jsxCount = 0;
  } else {
    state.jsxIdx = 0;
    state.jsxValue = children;
    state.jsxChildren = null!;
    state.jsxCount = 1;
  }
}

function getInsertBefore(ctx: DiffContext) {
  const { state } = ctx;
  if (state.vNewNode) {
    return state.vCurrent;
  } else {
    return peekNextSibling(state.vCurrent);
  }
}

function descendContentToProject(
  ctx: DiffContext,
  children: JSXChildren,
  host: VirtualVNode | null
) {
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
  descend(ctx, projections, true);
}

function expectProjection(ctx: DiffContext) {
  const { state, container } = ctx;
  const jsxNode = state.jsxValue as JSXNodeInternal;
  const slotName = jsxNode.key as string;
  // console.log('expectProjection', JSON.stringify(slotName));
  // The parent is the component and it should have our portal.
  state.vCurrent = vnode_getProp<VNode | null>(
    state.vParent as VirtualVNode,
    slotName,
    (id: string) => vnode_locate(container.rootVNode, id)
  );
  // if projection is marked as deleted then we need to create a new one
  state.vCurrent =
    state.vCurrent && state.vCurrent.flags & VNodeFlags.Deleted ? null : state.vCurrent;
  if (state.vCurrent == null) {
    state.vNewNode = vnode_newVirtual();
    // you may be tempted to add the projection into the current parent, but
    // that is wrong. We don't yet know if the projection will be projected, so
    // we should leave it unattached.
    // state.vNewNode[VNodeProps.parent] = state.vParent;
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, 'q:code', 'expectProjection');
    vnode_setProp(state.vNewNode as VirtualVNode, QSlot, slotName);
    (state.vNewNode as VirtualVNode).slotParent = state.vParent;
    vnode_setProp(state.vParent as VirtualVNode, slotName, state.vNewNode);
  }
}

function expectSlot(ctx: DiffContext) {
  const { state, journal } = ctx;
  const vHost = vnode_getProjectionParentComponent(state.vParent);

  const slotNameKey = getSlotNameKey(ctx, vHost);

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
      state.vParent as ElementVNode | VirtualVNode,
      (state.vNewNode = vnode_newVirtual()),
      state.vCurrent && getInsertBefore(ctx)
    );
    vnode_setProp(state.vNewNode as VirtualVNode, QSlot, slotNameKey);
    vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, state.vNewNode);
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);
    return false;
  } else if (vProjectedNode === state.vCurrent) {
    // All is good.
  } else {
    // move from q:template to the target node
    vnode_insertBefore(
      journal,
      state.vParent as ElementVNode | VirtualVNode,
      (state.vNewNode = vProjectedNode),
      state.vCurrent && getInsertBefore(ctx)
    );
    vnode_setProp(state.vNewNode as VirtualVNode, QSlot, slotNameKey);
    vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, state.vNewNode);
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);
  }
  return true;
}

function getSlotNameKey(ctx: DiffContext, vHost: VNode | null) {
  const { state, container } = ctx;
  const jsxNode = state.jsxValue as JSXNodeInternal;
  const constProps = jsxNode.constProps;
  if (constProps && typeof constProps == 'object' && _hasOwnProperty.call(constProps, 'name')) {
    const constValue = constProps.name;
    if (vHost && constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(constValue, vHost, EffectProperty.COMPONENT, container);
    }
  }
  return directGetPropsProxyProp(jsxNode, 'name') || QDefaultSlot;
}

function drainAsyncQueue(ctx: DiffContext): ValueOrPromise<void> {
  const { asyncQueue, container } = ctx;
  while (asyncQueue.length) {
    const jsxNode = asyncQueue.shift() as ValueOrPromise<JSXChildren>;
    const vHostNode = asyncQueue.shift() as VNode;

    if (isPromise(jsxNode)) {
      return jsxNode
        .then((jsxNode) => {
          diff(ctx, jsxNode, vHostNode);
          return drainAsyncQueue(ctx);
        })
        .catch((e) => {
          container.handleError(e, vHostNode);
          return drainAsyncQueue(ctx);
        });
    } else {
      diff(ctx, jsxNode, vHostNode);
    }
  }
  // Wait for all async attribute promises to complete, then check for more work
  if (ctx.asyncAttributePromises.length) {
    const promises = ctx.asyncAttributePromises.splice(0);
    return Promise.all(promises).then(() => {
      // After attributes are set, check if there's more work in the queue
      return drainAsyncQueue(ctx);
    });
  }
}

function expectNoChildren(ctx: DiffContext, removeDOM = true) {
  const { state, container, journal, cursor } = ctx;
  const vFirstChild = state.vCurrent && vnode_getFirstChild(state.vCurrent);
  if (vFirstChild !== null) {
    let vChild: VNode | null = vFirstChild;
    while (vChild) {
      cleanup(container, journal, vChild, cursor);
      vChild = vChild.nextSibling as VNode | null;
    }
    vnode_truncate(journal, state.vCurrent as ElementVNode | VirtualVNode, vFirstChild, removeDOM);
  }
}

/** Expect no more nodes - Any nodes which are still at cursor, need to be removed. */
function expectNoMore(ctx: DiffContext) {
  const { state, container, journal, cursor } = ctx;
  assertFalse(state.vParent === state.vCurrent, "Parent and current can't be the same");
  if (state.vCurrent !== null) {
    while (state.vCurrent) {
      const toRemove = state.vCurrent;
      state.vCurrent = peekNextSibling(state.vCurrent);
      if (state.vParent === toRemove.parent) {
        cleanup(container, journal, toRemove, cursor);
        // If we are diffing projection than the parent is not the parent of the node.
        // If that is the case we don't want to remove the node from the parent.
        vnode_remove(journal, state.vParent, toRemove, true);
      }
    }
  }
}

function expectNoMoreTextNodes(ctx: DiffContext) {
  const { state, container, journal, cursor } = ctx;
  while (state.vCurrent !== null && vnode_isTextVNode(state.vCurrent)) {
    cleanup(container, journal, state.vCurrent, cursor);
    const toRemove = state.vCurrent;
    state.vCurrent = peekNextSibling(state.vCurrent);
    vnode_remove(journal, state.vParent, toRemove, true);
  }
}

/**
 * Returns whether `qDispatchEvent` needs patching. This is true when one of the `jsx` argument's
 * const props has the name of an event.
 *
 * @returns {boolean}
 */
function createNewElement(
  ctx: DiffContext,
  jsx: JSXNodeInternal,
  elementName: string,
  currentFile?: string | null
): boolean {
  const { journal, state, container, scopedStyleIdPrefix } = ctx;
  const element = createElementWithNamespace(ctx, elementName);

  function setAttributeLocal(key: string, value: any, vHost: ElementVNode) {
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
            vnode_setProp(state.vNewNode!, '::' + scopedEvent, value);
            if (scope) {
              // window and document need attrs so qwik loader can find them
              vnode_setAttr(journal, state.vNewNode!, key, '');
            }
            // register an event for qwik loader (window/document prefixed with '-')
            registerQwikLoaderEvent(ctx, loaderScopedEvent);
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
        const vHost = state.vNewNode as ElementVNode;
        const signal = value as Signal<unknown>;
        value = retryOnPromise(() =>
          trackSignalAndAssignHost(signal, vHost, key, container, ctx.constSubscriptionData)
        );
      }

      if (isPromise(value)) {
        const vHost = state.vNewNode as ElementVNode;
        const attributePromise = value.then((resolvedValue) =>
          setAttributeLocal(key, resolvedValue, vHost)
        );
        ctx.asyncAttributePromises.push(attributePromise);
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

      setAttributeLocal(key, value, state.vNewNode as ElementVNode);
    }
  }
  const key = jsx.key;
  if (key) {
    (state.vNewNode as ElementVNode).key = key;
  }

  // append class attribute if styleScopedId exists and there is no class attribute
  if (scopedStyleIdPrefix) {
    const classAttributeExists =
      hasClassAttr(jsx.varProps) || (jsx.constProps && hasClassAttr(jsx.constProps));
    if (!classAttributeExists) {
      element.setAttribute('class', scopedStyleIdPrefix);
    }
  }

  vnode_insertBefore(
    journal,
    state.vParent as ElementVNode,
    state.vNewNode as ElementVNode,
    state.vCurrent
  );

  return needsQDispatchEventPatch;
}

function createElementWithNamespace(ctx: DiffContext, elementName: string): Element {
  const { state, container } = ctx;
  const domParentVNode = vnode_getDomParentVNode(state.vParent, true);
  const { elementNamespace, elementNamespaceFlag } = getNewElementNamespaceData(
    domParentVNode,
    elementName
  );

  const element = container.document.createElementNS(elementNamespace, elementName);
  state.vNewNode = vnode_newElement(element, elementName);
  state.vNewNode.flags |= elementNamespaceFlag;
  return element;
}

function expectElement(ctx: DiffContext, jsx: JSXNodeInternal, elementName: string) {
  const { state, container, journal } = ctx;
  const isSameElementName =
    state.vCurrent &&
    vnode_isElementVNode(state.vCurrent) &&
    elementName === vnode_getElementName(state.vCurrent);
  const jsxKey: string | null = jsx.key;
  let needsQDispatchEventPatch = false;
  const currentKey = getKey(state.vCurrent as VirtualVNode | ElementVNode | TextVNode | null);
  if (!isSameElementName || jsxKey !== currentKey) {
    const sideBufferKey = getSideBufferKey(elementName, jsxKey);
    if (
      moveOrCreateKeyedNode(
        state,
        container,
        journal,
        elementName,
        jsxKey,
        sideBufferKey,
        state.vParent as ElementVNode
      )
    ) {
      needsQDispatchEventPatch = createNewElement(ctx, jsx, elementName, null);
    }
  } else {
    // delete the key from the side buffer if it is the same element
    deleteFromSideBuffer(state, elementName, jsxKey);
  }

  // reconcile attributes

  const jsxProps = jsx.varProps;
  const vNode = (state.vNewNode || state.vCurrent) as ElementVNode;

  const element = vNode.node as QElement;

  if (jsxProps) {
    needsQDispatchEventPatch =
      diffProps(
        ctx,
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
  ctx: DiffContext,
  vnode: ElementVNode,
  newAttrs: Record<string, any>,
  oldAttrs: Record<string, any>,
  currentFile: string | null
): boolean {
  const { journal, container, scopedStyleIdPrefix } = ctx;
  vnode_ensureElementInflated(vnode);
  let patchEventDispatch = false;

  const record = (key: string, value: any) => {
    if (key.startsWith(':')) {
      // TODO: there is a potential deoptimization here, because we are setting different keys on props.
      // Eager bailout - Insufficient type feedback for generic keyed access
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
      const unwrappedSignal = value instanceof WrappedSignalImpl ? value.$unwrapIfSignal$() : value;
      if (currentEffect?.[EffectSubscriptionProp.BACK_REF]?.has(unwrappedSignal)) {
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
          ctx.nonConstSubscriptionData
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
        setAttribute(journal, vHost, key, resolvedValue, scopedStyleIdPrefix);
      });
      ctx.asyncAttributePromises.push(attributePromise);
      return;
    }

    setAttribute(journal, vnode, key, value, scopedStyleIdPrefix);
  };

  const recordJsxEvent = (key: string, value: any) => {
    const data = getEventDataFromHtmlAttribute(key);
    if (data) {
      const [scope, eventName] = data;
      const scopedEvent = getScopedEventName(scope, eventName);
      const loaderScopedEvent = getLoaderScopedEventName(scope, scopedEvent);
      record(':' + scopedEvent, value);
      registerQwikLoaderEvent(ctx, loaderScopedEvent);
      patchEventDispatch = true;
    }
  };

  // Actual diffing logic
  // Apply all new attributes
  for (const key of Object.keys(newAttrs)) {
    const newValue = newAttrs[key];
    const isEvent = isHtmlAttributeAnEventName(key);

    if (_hasOwnProperty.call(oldAttrs, key)) {
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
      !_hasOwnProperty.call(newAttrs, key) &&
      !key.startsWith(HANDLER_PREFIX) &&
      !isHtmlAttributeAnEventName(key)
    ) {
      record(key, null);
    }
  }

  return patchEventDispatch;
}

function registerQwikLoaderEvent(ctx: DiffContext, eventName: string) {
  const { container } = ctx;
  const qWindow = import.meta.env.TEST
    ? (container.document.defaultView as qWindow | null)
    : (window as unknown as qWindow);
  if (qWindow) {
    (qWindow.qwikevents ||= [] as any).push(eventName);
  }
}

function expectVirtual(ctx: DiffContext, type: VirtualType, jsxKey: string | null) {
  const { state, container, journal } = ctx;
  const checkKey = type === VirtualType.Fragment;
  const currentKey = getKey(state.vCurrent as VirtualVNode | ElementVNode | TextVNode | null);
  const currentIsVirtual = state.vCurrent && vnode_isVirtualVNode(state.vCurrent);
  const isSameNode = currentIsVirtual && currentKey === jsxKey && (checkKey ? !!jsxKey : true);

  if (isSameNode) {
    // All is good.
    deleteFromSideBuffer(state, null, currentKey);
    return;
  }

  // For fragments without a key, always create a new virtual node (ensures rerender semantics)
  if (jsxKey === null) {
    vnode_insertBefore(
      journal,
      state.vParent as VirtualVNode,
      (state.vNewNode = vnode_newVirtual()),
      state.vCurrent && getInsertBefore(ctx)
    );
    (state.vNewNode as VirtualVNode).key = jsxKey;
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, type);
    return;
  }
  if (
    moveOrCreateKeyedNode(
      state,
      container,
      journal,
      null,
      jsxKey,
      getSideBufferKey(null, jsxKey),
      state.vParent as VirtualVNode,
      true
    )
  ) {
    vnode_insertBefore(
      journal,
      state.vParent as VirtualVNode,
      (state.vNewNode = vnode_newVirtual()),
      state.vCurrent && getInsertBefore(ctx)
    );
    (state.vNewNode as VirtualVNode).key = jsxKey;
    isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, type);
  }
}

function expectComponent(ctx: DiffContext, component: Function) {
  const { state, container, journal, cursor } = ctx;
  const componentMeta = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  let host = (state.vNewNode || state.vCurrent) as VirtualVNode | null;
  const jsxNode = state.jsxValue as JSXNodeInternal;
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
      if (
        moveOrCreateKeyedNode(
          state,
          container,
          journal,
          null,
          lookupKey,
          lookupKey,
          state.vParent as VirtualVNode
        )
      ) {
        insertNewComponent(ctx, host, componentQRL, jsxProps);
        shouldRender = true;
      }
      host = (state.vNewNode || state.vCurrent) as VirtualVNode;
    } else if (!hashesAreEqual || !jsxNode.key) {
      insertNewComponent(ctx, host, componentQRL, jsxProps);
      host = state.vNewNode as VirtualVNode;
      shouldRender = true;
    } else {
      // delete the key from the side buffer if it is the same component
      deleteFromSideBuffer(state, null, lookupKey);
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
         * cleanup run. Now we found it and want to reuse it, so we need to mark it as not deleted.
         */
        (host as VirtualVNode).flags &= ~VNodeFlags.Deleted;
        markVNodeDirty(container, host as VirtualVNode, ChoreBits.COMPONENT, cursor);
      }
    }
    descendContentToProject(ctx, jsxNode.children, host);
  } else {
    const lookupKey = jsxNode.key;
    const vNodeLookupKey = getKey(host);
    const lookupKeysAreEqual = lookupKey === vNodeLookupKey;
    const vNodeComponentHash = getComponentHash(host, container.$getObjectById$);
    const isInlineComponent = vNodeComponentHash == null;

    if ((host && !isInlineComponent) || lookupKey == null) {
      insertNewInlineComponent(ctx);
      host = state.vNewNode as VirtualVNode;
    } else if (!lookupKeysAreEqual) {
      if (
        moveOrCreateKeyedNode(
          state,
          container,
          journal,
          null,
          lookupKey,
          lookupKey,
          state.vParent as VirtualVNode
        )
      ) {
        // We did not find the inline component, create it.
        insertNewInlineComponent(ctx);
      }
      host = (state.vNewNode || state.vCurrent) as VirtualVNode;
    } else {
      // delete the key from the side buffer if it is the same component
      deleteFromSideBuffer(state, null, lookupKey);
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

      ctx.asyncQueue.push(jsxOutput, host);
    }
  }
}

function insertNewComponent(
  ctx: DiffContext,
  host: VNode | null,
  componentQRL: QRLInternal<OnRenderFn<any>>,
  jsxProps: Props
) {
  const { state, journal, container } = ctx;
  if (host) {
    clearAllEffects(container, host);
  }
  vnode_insertBefore(
    journal,
    state.vParent as VirtualVNode,
    (state.vNewNode = vnode_newVirtual()),
    state.vCurrent && getInsertBefore(ctx)
  );
  const jsxNode = state.jsxValue as JSXNodeInternal;
  isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Component);
  vnode_setProp(state.vNewNode as VirtualVNode, OnRenderProp, componentQRL);
  vnode_setProp(state.vNewNode as VirtualVNode, ELEMENT_PROPS, jsxProps);
  (state.vNewNode as VirtualVNode).key = jsxNode.key;
}

function insertNewInlineComponent(ctx: DiffContext) {
  const { state, journal } = ctx;
  vnode_insertBefore(
    journal,
    state.vParent as VirtualVNode,
    (state.vNewNode = vnode_newVirtual()),
    state.vCurrent && getInsertBefore(ctx)
  );
  const jsxNode = state.jsxValue as JSXNodeInternal;
  isDev && vnode_setProp(state.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.InlineComponent);
  vnode_setProp(state.vNewNode as VirtualVNode, ELEMENT_PROPS, jsxNode.props);
  if (jsxNode.key) {
    (state.vNewNode as VirtualVNode).key = jsxNode.key;
  }
}

function expectText(ctx: DiffContext, text: string) {
  const { state, journal, container } = ctx;
  if (state.vCurrent !== null) {
    const type = vnode_getType(state.vCurrent);
    if (type === 3 /* Text */) {
      if (text !== vnode_getText(state.vCurrent as TextVNode)) {
        vnode_setText(journal, state.vCurrent as TextVNode, text);
        return;
      }
      return;
    }
  }
  vnode_insertBefore(
    journal,
    state.vParent as ElementVNode | VirtualVNode,
    (state.vNewNode = vnode_newText(container.document.createTextNode(text), text)),
    state.vCurrent
  );
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
      if (!src || !_hasOwnProperty.call(src, key)) {
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
