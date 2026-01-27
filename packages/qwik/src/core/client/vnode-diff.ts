import { isDev } from '@qwik.dev/core/build';
import { clearAllEffects, clearEffectSubscription } from '../reactive-primitives/cleanup';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import type { Signal } from '../reactive-primitives/signal.public';
import { SubscriptionData } from '../reactive-primitives/subscription-data';
import { EffectProperty, type Consumer } from '../reactive-primitives/types';
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
  ITERATION_ITEM_MULTI,
  ITERATION_ITEM_SINGLE,
  OnRenderProp,
  QBackRefs,
  QContainerAttr,
  QDefaultSlot,
  QSlot,
  QTemplate,
  dangerouslySetInnerHTML,
  debugStyleScopeIdPrefixAttr,
} from '../shared/utils/markers';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { isSlotProp } from '../shared/utils/prop';
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
import { getNewElementNamespaceData } from './vnode-namespace';
import { cleanupDestroyable } from '../use/utils/destroyable';
import { SignalImpl } from '../reactive-primitives/impl/signal-impl';
import { isStore } from '../reactive-primitives/impl/store';
import { AsyncComputedSignalImpl } from '../reactive-primitives/impl/async-computed-signal-impl';
import type { VNode } from '../shared/vnode/vnode';
import type { ElementVNode } from '../shared/vnode/element-vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import type { TextVNode } from '../shared/vnode/text-vnode';
import { addVNodeOperation, markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { _EFFECT_BACK_REF } from '../reactive-primitives/backref';
import type { Cursor } from '../shared/cursor/cursor';
import { createSetAttributeOperation } from '../shared/vnode/types/dom-vnode-operation';
import { callQrl } from './run-qrl';
import { directSetAttribute } from '../shared/utils/attribute';

export interface DiffContext {
  container: ClientContainer;
  journal: VNodeJournal;
  cursor: Cursor;
  scopedStyleIdPrefix: string | null;
  /**
   * Stack is used to keep track of the state of the traversal.
   *
   * We push current state into the stack before descending into the child, and we pop the state
   * when we are done with the child.
   */
  stack: any[];
  asyncQueue: Array<VNode | ValueOrPromise<JSXChildren> | Promise<JSXChildren>>;
  asyncAttributePromises: Promise<void>[];
  ////////////////////////////////
  //// Traverse state variables
  ////////////////////////////////
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
  jsxChildren: JSXChildren[] | null;
  // Current JSX child.
  jsxValue: JSXChildren | null;
  jsxIdx: number;
  jsxCount: number;
  // When we descend into children, we need to skip advance() because we just descended.
  shouldAdvance: boolean;
  isCreationMode: boolean;
  subscriptionData: {
    const: SubscriptionData;
    var: SubscriptionData;
  };
}

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
  scopedStyleIdPrefix: string | null,
  originalValue: any
) {
  import.meta.env.TEST &&
    scopedStyleIdPrefix &&
    vnode_setProp(vnode, debugStyleScopeIdPrefixAttr, scopedStyleIdPrefix);
  vnode_setProp(vnode, key, originalValue);
  addVNodeOperation(
    journal,
    createSetAttributeOperation(
      vnode.node,
      key,
      value,
      scopedStyleIdPrefix,
      (vnode.flags & VNodeFlags.NS_svg) !== 0
    )
  );
}

export const vnode_diff = (
  container: ClientContainer,
  journal: VNodeJournal,
  jsxNode: JSXChildren,
  vStartNode: VNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null
) => {
  const diffContext: DiffContext = {
    container,
    journal,
    cursor,
    scopedStyleIdPrefix,
    stack: [],
    asyncQueue: [],
    asyncAttributePromises: [],
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
    isCreationMode: false,
    subscriptionData: {
      const: new SubscriptionData({
        $scopedStyleIdPrefix$: scopedStyleIdPrefix,
        $isConst$: true,
      }),
      var: new SubscriptionData({
        $scopedStyleIdPrefix$: scopedStyleIdPrefix,
        $isConst$: false,
      }),
    },
  };
  ////////////////////////////////

  diff(diffContext, jsxNode, vStartNode);
  const result = drainAsyncQueue(diffContext);

  // Cleanup diffContext after completion
  if (isPromise(result)) {
    return result.finally(() => {
      cleanupDiffContext(diffContext);
    });
  } else {
    cleanupDiffContext(diffContext);
  }
};

//////////////////////////////////////////////
//////////////////////////////////////////////
//////////////////////////////////////////////

function diff(diffContext: DiffContext, jsxNode: JSXChildren, vStartNode: VNode) {
  isDev && assertFalse(vnode_isVNode(jsxNode), 'JSXNode should not be a VNode');
  isDev && assertTrue(vnode_isVNode(vStartNode), 'vStartNode should be a VNode');
  diffContext.vParent = vStartNode as ElementVNode | VirtualVNode;
  diffContext.vNewNode = null;
  diffContext.vCurrent = vnode_getFirstChild(vStartNode);
  stackPush(diffContext, jsxNode, true);

  if (diffContext.vParent.flags & VNodeFlags.Deleted) {
    // Ignore diff if the parent is deleted.
    return;
  }

  while (diffContext.stack.length) {
    while (diffContext.jsxIdx < diffContext.jsxCount) {
      isDev &&
        assertFalse(
          diffContext.vParent === diffContext.vCurrent,
          "Parent and current can't be the same"
        );
      if (typeof diffContext.jsxValue === 'string') {
        expectText(diffContext, diffContext.jsxValue);
      } else if (typeof diffContext.jsxValue === 'number') {
        expectText(diffContext, String(diffContext.jsxValue));
      } else if (diffContext.jsxValue && typeof diffContext.jsxValue === 'object') {
        if (isJSXNode(diffContext.jsxValue)) {
          const type = diffContext.jsxValue.type;
          if (typeof type === 'string') {
            expectNoMoreTextNodes(diffContext);
            expectElement(diffContext, diffContext.jsxValue, type);

            const hasDangerousInnerHTML =
              (diffContext.jsxValue.constProps &&
                _hasOwnProperty.call(diffContext.jsxValue.constProps, dangerouslySetInnerHTML)) ||
              _hasOwnProperty.call(diffContext.jsxValue.varProps, dangerouslySetInnerHTML);
            if (hasDangerousInnerHTML) {
              expectNoChildren(diffContext, false);
            } else {
              descend(diffContext, diffContext.jsxValue.children, true);
            }
          } else if (typeof type === 'function') {
            if (type === Fragment) {
              expectNoMoreTextNodes(diffContext);
              expectVirtual(diffContext, VirtualType.Fragment, diffContext.jsxValue.key);
              descend(diffContext, diffContext.jsxValue.children, true);
            } else if (type === Slot) {
              expectNoMoreTextNodes(diffContext);
              if (!expectSlot(diffContext)) {
                // nothing to project, so try to render the Slot default content.
                descend(diffContext, diffContext.jsxValue.children, true);
              }
            } else if (type === Projection) {
              expectProjection(diffContext);
              descend(
                diffContext,
                diffContext.jsxValue.children,
                true,
                // special case for projection, we don't want to expect no children
                // because the projection's children are not removed
                false
              );
            } else if (type === SSRComment) {
              expectNoMore(diffContext);
            } else if (type === SSRRaw) {
              expectNoMore(diffContext);
            } else {
              // Must be a component
              expectNoMoreTextNodes(diffContext);
              expectComponent(diffContext, type);
            }
          }
        } else if (Array.isArray(diffContext.jsxValue)) {
          descend(diffContext, diffContext.jsxValue, false);
        } else if (isSignal(diffContext.jsxValue)) {
          expectVirtual(diffContext, VirtualType.WrappedSignal, null);
          const unwrappedSignal =
            diffContext.jsxValue instanceof WrappedSignalImpl
              ? diffContext.jsxValue.$unwrapIfSignal$()
              : diffContext.jsxValue;
          const signals = diffContext.vCurrent?.[_EFFECT_BACK_REF]?.get(
            EffectProperty.VNODE
          )?.backRef;
          let hasUnwrappedSignal = signals?.has(unwrappedSignal);
          if (signals && unwrappedSignal instanceof WrappedSignalImpl) {
            hasUnwrappedSignal = containsWrappedSignal(signals, unwrappedSignal);
          }
          if (!hasUnwrappedSignal) {
            const vHost = (diffContext.vNewNode || diffContext.vCurrent)!;
            descend(
              diffContext,
              resolveSignalAndDescend(diffContext, () =>
                trackSignalAndAssignHost(
                  unwrappedSignal,
                  vHost,
                  EffectProperty.VNODE,
                  diffContext.container
                )
              ),
              true
            );
          }
        } else if (isPromise(diffContext.jsxValue)) {
          expectVirtual(diffContext, VirtualType.Awaited, null);
          diffContext.asyncQueue.push(
            diffContext.jsxValue,
            diffContext.vNewNode || diffContext.vCurrent
          );
        }
      } else if (diffContext.jsxValue === (SkipRender as JSXChildren)) {
        // do nothing, we are skipping this node
      } else {
        expectText(diffContext, '');
      }
      advance(diffContext);
    }
    expectNoMore(diffContext);
    cleanupSideBuffer(diffContext);
    ascend(diffContext);
  }
}

function resolveSignalAndDescend(
  diffContext: DiffContext,
  fn: () => ValueOrPromise<any>
): ValueOrPromise<any> {
  try {
    return fn();
  } catch (e) {
    // Signal threw a promise (async computed signal) - handle retry and async queue
    if (isPromise(e)) {
      // The thrown promise will resolve when the signal is ready, then retry fn() with retry logic
      const retryPromise = e.then(() => retryOnPromise(fn));
      diffContext.asyncQueue.push(retryPromise, diffContext.vNewNode || diffContext.vCurrent);
      return null;
    }
    throw e;
  }
}

function advance(diffContext: DiffContext) {
  if (!diffContext.shouldAdvance) {
    diffContext.shouldAdvance = true;
    return;
  }
  diffContext.jsxIdx++;
  if (diffContext.jsxIdx < diffContext.jsxCount) {
    diffContext.jsxValue = diffContext.jsxChildren![diffContext.jsxIdx];
  } else if (
    diffContext.stack.length > 0 &&
    diffContext.stack[diffContext.stack.length - 1] === false
  ) {
    // this was special `descendVNode === false` so pop and try again
    return ascend(diffContext);
  }
  if (diffContext.vNewNode !== null) {
    // We have a new Node.
    // This means that the `vCurrent` was deemed not useful and we inserted in front of it.
    // This means that the next node we should look at is the `vCurrent` so just clear the
    // vNewNode  and try again.
    diffContext.vNewNode = null;
  } else {
    diffContext.vCurrent = peekNextSibling(diffContext.vCurrent);
  }
}

/**
 * @param children
 * @param descendVNode - If true we are descending into vNode; This is set to false if we come
 *   across an array in jsx, and we need to descend into the array without actually descending into
 *   the vNode.
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
 *   In the above example all nodes are on same level so we don't `descendVNode` even thought there is
 *   an array produced by the `map` function.
 */
function descend(
  diffContext: DiffContext,
  children: JSXChildren,
  descendVNode: boolean,
  shouldExpectNoChildren: boolean = true
) {
  if (
    shouldExpectNoChildren &&
    (children == null || (descendVNode && isArray(children) && children.length === 0))
  ) {
    expectNoChildren(diffContext);
    return;
  }
  stackPush(diffContext, children, descendVNode);
  if (descendVNode) {
    isDev &&
      assertDefined(
        diffContext.vCurrent || diffContext.vNewNode,
        'Expecting vCurrent to be defined.'
      );
    let firstChild: VNode | null = null;
    let creationMode = diffContext.isCreationMode || !!diffContext.vNewNode;
    diffContext.isCreationMode = creationMode;
    diffContext.vSideBuffer = null;
    diffContext.vSiblings = null;
    diffContext.vSiblingsArray = null;
    diffContext.vParent = (diffContext.vNewNode || diffContext.vCurrent!) as
      | ElementVNode
      | VirtualVNode;
    if (!creationMode) {
      firstChild = vnode_getFirstChild(diffContext.vParent!);
      creationMode = !firstChild;
    }
    diffContext.vCurrent = firstChild;
    diffContext.vNewNode = null;
  }
  diffContext.shouldAdvance = false;
}

function ascend(diffContext: DiffContext) {
  const descendVNode = diffContext.stack.pop(); // boolean: descendVNode
  if (descendVNode) {
    diffContext.isCreationMode = diffContext.stack.pop();
    diffContext.vSideBuffer = diffContext.stack.pop();
    diffContext.vSiblings = diffContext.stack.pop();
    diffContext.vSiblingsArray = diffContext.stack.pop();
    diffContext.vNewNode = diffContext.stack.pop();
    diffContext.vCurrent = diffContext.stack.pop();
    diffContext.vParent = diffContext.stack.pop();
  }
  diffContext.jsxValue = diffContext.stack.pop();
  diffContext.jsxCount = diffContext.stack.pop();
  diffContext.jsxIdx = diffContext.stack.pop();
  diffContext.jsxChildren = diffContext.stack.pop();
  advance(diffContext);
}

function stackPush(diffContext: DiffContext, children: JSXChildren, descendVNode: boolean) {
  diffContext.stack.push(
    diffContext.jsxChildren,
    diffContext.jsxIdx,
    diffContext.jsxCount,
    diffContext.jsxValue
  );
  if (descendVNode) {
    diffContext.stack.push(
      diffContext.vParent,
      diffContext.vCurrent,
      diffContext.vNewNode,
      diffContext.vSiblingsArray,
      diffContext.vSiblings,
      diffContext.vSideBuffer,
      diffContext.isCreationMode
    );
  }
  diffContext.stack.push(descendVNode);
  if (Array.isArray(children)) {
    diffContext.jsxIdx = 0;
    diffContext.jsxCount = children.length;
    diffContext.jsxChildren = children;
    diffContext.jsxValue = diffContext.jsxCount > 0 ? children[0] : null;
  } else if (children === undefined) {
    // no children
    diffContext.jsxIdx = 0;
    diffContext.jsxValue = null;
    diffContext.jsxChildren = null!;
    diffContext.jsxCount = 0;
  } else {
    diffContext.jsxIdx = 0;
    diffContext.jsxValue = children;
    diffContext.jsxChildren = null!;
    diffContext.jsxCount = 1;
  }
}

function getInsertBefore(diffContext: DiffContext) {
  if (diffContext.vNewNode) {
    return diffContext.vCurrent;
  } else {
    return peekNextSibling(diffContext.vCurrent);
  }
}

/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

function descendContentToProject(
  diffContext: DiffContext,
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
  descend(diffContext, projections, true);
}

function expectProjection(diffContext: DiffContext) {
  const jsxNode = diffContext.jsxValue as JSXNodeInternal;
  const slotName = jsxNode.key as string;
  // console.log('expectProjection', JSON.stringify(slotName));
  // The parent is the component and it should have our portal.
  diffContext.vCurrent = vnode_getProp<VNode | null>(
    diffContext.vParent as VirtualVNode,
    slotName,
    (id: string) => vnode_locate(diffContext.container.rootVNode, id)
  );
  // if projection is marked as deleted then we need to create a new one
  diffContext.vCurrent =
    diffContext.vCurrent && diffContext.vCurrent.flags & VNodeFlags.Deleted
      ? null
      : diffContext.vCurrent;
  if (diffContext.vCurrent == null) {
    diffContext.vNewNode = vnode_newVirtual();
    // you may be tempted to add the projection into the current parent, but
    // that is wrong. We don't yet know if the projection will be projected, so
    // we should leave it unattached.
    // vNewNode[VNodeProps.parent] = vParent;
    isDev &&
      vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, 'q:code', 'expectProjection');
    vnode_setProp(diffContext.vNewNode as VirtualVNode, QSlot, slotName);
    (diffContext.vNewNode as VirtualVNode).slotParent = diffContext.vParent;
    vnode_setProp(diffContext.vParent as VirtualVNode, slotName, diffContext.vNewNode);
  }
}

function expectSlot(diffContext: DiffContext) {
  const vHost = vnode_getProjectionParentComponent(diffContext.vParent);

  const slotNameKey = getSlotNameKey(diffContext, vHost);

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
      diffContext.journal,
      diffContext.vParent as ElementVNode | VirtualVNode,
      (diffContext.vNewNode = vnode_newVirtual()),
      diffContext.vCurrent && getInsertBefore(diffContext)
    );
    vnode_setProp(diffContext.vNewNode as VirtualVNode, QSlot, slotNameKey);
    vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, diffContext.vNewNode);
    isDev &&
      vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);
    return false;
  } else if (vProjectedNode === diffContext.vCurrent) {
    // All is good.
  } else {
    // move from q:template to the target node
    const oldParent = vProjectedNode.parent;
    vnode_insertBefore(
      diffContext.journal,
      diffContext.vParent as ElementVNode | VirtualVNode,
      (diffContext.vNewNode = vProjectedNode),
      diffContext.vCurrent && getInsertBefore(diffContext)
    );
    vnode_setProp(diffContext.vNewNode as VirtualVNode, QSlot, slotNameKey);
    vHost && vnode_setProp(vHost as VirtualVNode, slotNameKey, diffContext.vNewNode);
    isDev &&
      vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Projection);
    isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, 'q:code', 'expectSlot' + count++);

    // If we moved from a q:template and it's now empty, remove it
    if (
      oldParent &&
      vnode_isElementVNode(oldParent) &&
      !oldParent.firstChild &&
      vnode_getElementName(oldParent) === QTemplate
    ) {
      vnode_remove(
        diffContext.journal,
        oldParent.parent as ElementVNode | VirtualVNode,
        oldParent,
        true
      );
    }
  }
  return true;
}

function getSlotNameKey(diffContext: DiffContext, vHost: VNode | null) {
  const jsxNode = diffContext.jsxValue as JSXNodeInternal;
  const constProps = jsxNode.constProps;
  if (constProps && typeof constProps == 'object' && _hasOwnProperty.call(constProps, 'name')) {
    const constValue = constProps.name;
    if (vHost && constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(
        constValue,
        vHost,
        EffectProperty.COMPONENT,
        diffContext.container
      );
    }
  }
  return directGetPropsProxyProp(jsxNode, 'name') || QDefaultSlot;
}

function cleanupSideBuffer(diffContext: DiffContext) {
  if (diffContext.vSideBuffer) {
    // Remove all nodes in the side buffer as they are no longer needed
    for (const vNode of diffContext.vSideBuffer.values()) {
      if (vNode.flags & VNodeFlags.Deleted) {
        continue;
      }
      cleanup(diffContext.container, diffContext.journal, vNode, diffContext.cursor);
      vnode_remove(diffContext.journal, diffContext.vParent, vNode, true);
    }
    diffContext.vSideBuffer.clear();
    diffContext.vSideBuffer = null;
  }
  diffContext.vCurrent = null;
}

function drainAsyncQueue(diffContext: DiffContext): ValueOrPromise<void> {
  while (diffContext.asyncQueue.length) {
    const jsxNode = diffContext.asyncQueue.shift() as ValueOrPromise<JSXChildren>;
    const vHostNode = diffContext.asyncQueue.shift() as VNode;

    if (isPromise(jsxNode)) {
      return jsxNode
        .then((jsxNode) => {
          diff(diffContext, jsxNode, vHostNode);
          return drainAsyncQueue(diffContext);
        })
        .catch((e) => {
          diffContext.container.handleError(e, vHostNode);
          return drainAsyncQueue(diffContext);
        });
    } else {
      diff(diffContext, jsxNode, vHostNode);
    }
  }
  // Wait for all async attribute promises to complete, then check for more work
  if (diffContext.asyncAttributePromises.length) {
    const promises = diffContext.asyncAttributePromises.splice(0);
    return Promise.all(promises).then(() => {
      // After attributes are set, check if there's more work in the queue
      return drainAsyncQueue(diffContext);
    });
  }
}

function cleanupDiffContext(diffContext: DiffContext): void {
  diffContext.journal = null!;
  diffContext.cursor = null!;
}

function expectNoChildren(diffContext: DiffContext, removeDOM = true) {
  const vFirstChild = diffContext.vCurrent && vnode_getFirstChild(diffContext.vCurrent);
  if (vFirstChild !== null) {
    let vChild: VNode | null = vFirstChild;
    while (vChild) {
      cleanup(diffContext.container, diffContext.journal, vChild, diffContext.cursor);
      vChild = vChild.nextSibling as VNode | null;
    }
    vnode_truncate(
      diffContext.journal,
      diffContext.vCurrent as ElementVNode | VirtualVNode,
      vFirstChild,
      removeDOM
    );
  }
}

/** Expect no more nodes - Any nodes which are still at cursor, need to be removed. */
function expectNoMore(diffContext: DiffContext) {
  isDev &&
    assertFalse(
      diffContext.vParent === diffContext.vCurrent,
      "Parent and current can't be the same"
    );
  if (diffContext.vCurrent !== null) {
    while (diffContext.vCurrent) {
      const toRemove = diffContext.vCurrent;
      diffContext.vCurrent = peekNextSibling(diffContext.vCurrent);
      if (diffContext.vParent === toRemove.parent) {
        cleanup(diffContext.container, diffContext.journal, toRemove, diffContext.cursor);
        // If we are diffing projection than the parent is not the parent of the node.
        // If that is the case we don't want to remove the node from the parent.
        vnode_remove(diffContext.journal, diffContext.vParent, toRemove, true);
      }
    }
  }
}

function expectNoMoreTextNodes(diffContext: DiffContext) {
  while (diffContext.vCurrent !== null && vnode_isTextVNode(diffContext.vCurrent)) {
    cleanup(diffContext.container, diffContext.journal, diffContext.vCurrent, diffContext.cursor);
    const toRemove = diffContext.vCurrent;
    diffContext.vCurrent = peekNextSibling(diffContext.vCurrent);
    vnode_remove(diffContext.journal, diffContext.vParent, toRemove, true);
  }
}

/**
 * Returns whether `qDispatchEvent` needs patching. This is true when one of the `jsx` argument's
 * const props has the name of an event.
 *
 * @returns {boolean}
 */
function createNewElement(
  diffContext: DiffContext,
  jsx: JSXNodeInternal,
  elementName: string,
  currentFile?: string | null
): boolean {
  const element = createElementWithNamespace(diffContext, elementName);
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
            vnode_setProp(diffContext.vNewNode!, '::' + scopedEvent, value);
            if (scope) {
              // window and document need attrs so qwik loader can find them
              vnode_setAttr(diffContext.journal, diffContext.vNewNode!, key, '');
            }
            // register an event for qwik loader (window/document prefixed with '-')
            registerQwikLoaderEvent(diffContext, loaderScopedEvent);
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
        const vHost = diffContext.vNewNode as ElementVNode;
        const signal = value as Signal<unknown>;
        value = retryOnPromise(() =>
          trackSignalAndAssignHost(
            signal,
            vHost,
            key,
            diffContext.container,
            diffContext.subscriptionData.const
          )
        );
      }

      if (isPromise(value)) {
        const vHost = diffContext.vNewNode as ElementVNode;
        const attributePromise = value.then((resolvedValue) =>
          directSetAttribute(
            element,
            key,
            serializeAttribute(key, resolvedValue, diffContext.scopedStyleIdPrefix),
            (vHost.flags & VNodeFlags.NS_svg) !== 0
          )
        );
        diffContext.asyncAttributePromises.push(attributePromise);
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

      directSetAttribute(
        element,
        key,
        serializeAttribute(key, value, diffContext.scopedStyleIdPrefix),
        ((diffContext.vNewNode as ElementVNode).flags & VNodeFlags.NS_svg) !== 0
      );
    }
  }
  const key = jsx.key;
  if (key) {
    (diffContext.vNewNode as ElementVNode).key = key;
  }

  // append class attribute if styleScopedId exists and there is no class attribute
  if (diffContext.scopedStyleIdPrefix) {
    const classAttributeExists =
      _hasOwnProperty.call(jsx.varProps, 'class') ||
      (jsx.constProps && _hasOwnProperty.call(jsx.constProps, 'class'));
    if (!classAttributeExists) {
      element.setAttribute('class', diffContext.scopedStyleIdPrefix);
    }
  }

  vnode_insertBefore(
    diffContext.journal,
    diffContext.vParent as ElementVNode,
    diffContext.vNewNode as ElementVNode,
    diffContext.vCurrent
  );

  return needsQDispatchEventPatch;
}

function createElementWithNamespace(diffContext: DiffContext, elementName: string): Element {
  const domParentVNode = vnode_getDomParentVNode(diffContext.vParent, true);
  const namespaceData = getNewElementNamespaceData(domParentVNode, elementName);

  const currentDocument = import.meta.env.TEST ? diffContext.container.document : document;

  const element =
    namespaceData.elementNamespaceFlag === VNodeFlags.NS_html
      ? currentDocument.createElement(elementName)
      : currentDocument.createElementNS(namespaceData.elementNamespace, elementName);
  diffContext.vNewNode = vnode_newElement(element, elementName);
  diffContext.vNewNode.flags |= namespaceData.elementNamespaceFlag;
  return element;
}

function expectElement(diffContext: DiffContext, jsx: JSXNodeInternal, elementName: string) {
  let needsQDispatchEventPatch = false;
  if (diffContext.isCreationMode) {
    needsQDispatchEventPatch = createNewElement(diffContext, jsx, elementName, null);
  } else {
    const isElementVNode = diffContext.vCurrent && vnode_isElementVNode(diffContext.vCurrent);
    const isSameElementName =
      isElementVNode && elementName === vnode_getElementName(diffContext.vCurrent as ElementVNode);
    const jsxKey: string | null = jsx.key;
    const currentKey = isElementVNode && (diffContext.vCurrent as ElementVNode).key;
    if (!isSameElementName || jsxKey !== currentKey) {
      const sideBufferKey = getSideBufferKey(elementName, jsxKey);
      if (
        moveOrCreateKeyedNode(
          diffContext,
          elementName,
          jsxKey,
          sideBufferKey,
          diffContext.vParent as ElementVNode
        )
      ) {
        needsQDispatchEventPatch = createNewElement(diffContext, jsx, elementName, null);
      }
    } else {
      // delete the key from the side buffer if it is the same element
      deleteFromSideBuffer(diffContext, elementName, jsxKey);
    }
  }

  // reconcile attributes

  const jsxProps = jsx.varProps;
  const vNode = (diffContext.vNewNode || diffContext.vCurrent) as ElementVNode;

  const element = vNode.node as QElement;

  if (jsxProps) {
    needsQDispatchEventPatch =
      diffProps(diffContext, vNode, jsxProps, (isDev && getFileLocationFromJsx(jsx.dev)) || null) ||
      needsQDispatchEventPatch;
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
            callQrl(diffContext.container, vNode, qrl, event, vNode.node, false).catch((e) => {
              diffContext.container.handleError(e, vNode);
            });
          }
        }
      };
    }
  }
}

function diffProps(
  diffContext: DiffContext,
  vnode: ElementVNode,
  newAttrs: Record<string, any>,
  currentFile: string | null
): boolean {
  if (!diffContext.isCreationMode) {
    // inflate only resumed vnodes
    vnode_ensureElementInflated(vnode);
  }
  const oldAttrs = vnode.props;
  let patchEventDispatch = false;

  // Actual diffing logic
  // Apply all new attributes
  for (const key in newAttrs) {
    const newValue = newAttrs[key];
    const isEvent = isHtmlAttributeAnEventName(key);

    if (oldAttrs && _hasOwnProperty.call(oldAttrs, key)) {
      const oldValue = oldAttrs[key];
      if (newValue !== oldValue) {
        if (
          newValue instanceof WrappedSignalImpl &&
          oldValue instanceof WrappedSignalImpl &&
          areWrappedSignalsEqual(newValue, oldValue)
        ) {
          continue;
        }
        if (isEvent) {
          const result = recordJsxEvent(diffContext, vnode, key, newValue, currentFile);
          patchEventDispatch ||= result;
        } else {
          patchProperty(diffContext, vnode, key, newValue, currentFile);
        }
      }
    } else if (newValue != null) {
      if (isEvent) {
        const result = recordJsxEvent(diffContext, vnode, key, newValue, currentFile);
        patchEventDispatch ||= result;
      } else {
        patchProperty(diffContext, vnode, key, newValue, currentFile);
      }
    }
  }

  if (oldAttrs) {
    // Remove attributes that no longer exist in new props
    for (const key in oldAttrs) {
      if (
        !_hasOwnProperty.call(newAttrs, key) &&
        !key.startsWith(HANDLER_PREFIX) &&
        !isHtmlAttributeAnEventName(key)
      ) {
        patchProperty(diffContext, vnode, key, null, currentFile);
      }
    }
  }

  return patchEventDispatch;
}

const patchProperty = (
  diffContext: DiffContext,
  vnode: ElementVNode,
  key: string,
  value: any,
  currentFile: string | null
) => {
  if (
    // set only property for iteration item, not an attribute
    key === ITERATION_ITEM_SINGLE ||
    key === ITERATION_ITEM_MULTI ||
    key.charAt(0) === HANDLER_PREFIX
  ) {
    // TODO: there is a potential deoptimization here, because we are setting different keys on props.
    // Eager bailout - Insufficient type feedback for generic keyed access
    vnode_setProp(vnode, key, value);
    return;
  }
  const originalValue = value;

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
    if (currentEffect?.backRef?.has(unwrappedSignal)) {
      return;
    }
    if (currentEffect) {
      clearEffectSubscription(diffContext.container, currentEffect);
    }

    const vHost = vnode as ElementVNode;
    value = retryOnPromise(() =>
      trackSignalAndAssignHost(
        unwrappedSignal,
        vHost,
        key,
        diffContext.container,
        diffContext.subscriptionData.var
      )
    );
  } else {
    if (currentEffect) {
      clearEffectSubscription(diffContext.container, currentEffect);
    }
  }

  if (isPromise(value)) {
    const vHost = vnode as ElementVNode;
    const attributePromise = value.then((resolvedValue) => {
      setAttribute(
        diffContext.journal,
        vHost,
        key,
        resolvedValue,
        diffContext.scopedStyleIdPrefix,
        originalValue
      );
    });
    diffContext.asyncAttributePromises.push(attributePromise);
    return;
  }

  setAttribute(
    diffContext.journal,
    vnode,
    key,
    value,
    diffContext.scopedStyleIdPrefix,
    originalValue
  );
};

const recordJsxEvent = (
  diffContext: DiffContext,
  vnode: ElementVNode,
  key: string,
  value: any,
  currentFile: string | null
) => {
  const data = getEventDataFromHtmlAttribute(key);
  if (data) {
    const props = vnode.props;
    const [scope, eventName] = data;
    const scopedEvent = getScopedEventName(scope, eventName);
    const loaderScopedEvent = getLoaderScopedEventName(scope, scopedEvent);
    const scopedEventKey = ':' + scopedEvent;
    if (props && _hasOwnProperty.call(props, scopedEventKey)) {
      return false;
    }
    patchProperty(diffContext, vnode, scopedEventKey, value, currentFile);
    registerQwikLoaderEvent(diffContext, loaderScopedEvent);
    return true;
  }
  return false;
};

function registerQwikLoaderEvent(diffContext: DiffContext, eventName: string) {
  const qWindow = import.meta.env.TEST
    ? (diffContext.container.document.defaultView as qWindow | null)
    : (window as unknown as qWindow);
  if (qWindow) {
    (qWindow.qwikevents ||= [] as any).push(eventName);
  }
}

function retrieveChildWithKey(
  diffContext: DiffContext,
  nodeName: string | null,
  key: string | null
): ElementVNode | VirtualVNode | null {
  let vNodeWithKey: ElementVNode | VirtualVNode | null = null;
  if (diffContext.vSiblings === null) {
    // check if the current node is the one we are looking for
    const vCurrent = diffContext.vCurrent;
    if (vCurrent) {
      const name = vnode_isElementVNode(vCurrent) ? vnode_getElementName(vCurrent) : null;
      const vKey =
        getKey(vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(vCurrent, diffContext.container.$getObjectById$);
      if (vKey === key && name === nodeName) {
        return vCurrent as ElementVNode | VirtualVNode;
      }
    }

    // it is not materialized; so materialize it.
    diffContext.vSiblings = new Map<string, VNode>();
    diffContext.vSiblingsArray = [];
    let vNode = diffContext.vCurrent;
    while (vNode) {
      const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
      const vKey =
        getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(vNode, diffContext.container.$getObjectById$);
      if (vNodeWithKey === null && vKey == key && name == nodeName) {
        vNodeWithKey = vNode as ElementVNode | VirtualVNode;
      } else {
        if (vKey === null) {
          diffContext.vSiblingsArray.push(name, vNode);
        } else {
          // we only add the elements which we did not find yet.
          diffContext.vSiblings.set(getSideBufferKey(name, vKey), vNode);
        }
      }
      vNode = vNode.nextSibling as VNode | null;
    }
  } else {
    if (key === null) {
      for (let i = 0; i < diffContext.vSiblingsArray!.length; i += 2) {
        if (diffContext.vSiblingsArray![i] === nodeName) {
          vNodeWithKey = diffContext.vSiblingsArray![i + 1] as ElementVNode | VirtualVNode;
          diffContext.vSiblingsArray!.splice(i, 2);
          break;
        }
      }
    } else {
      const siblingsKey = getSideBufferKey(nodeName, key);
      const sibling = diffContext.vSiblings.get(siblingsKey);
      if (sibling) {
        vNodeWithKey = sibling as ElementVNode | VirtualVNode;
        diffContext.vSiblings.delete(siblingsKey);
      }
    }
  }

  collectSideBufferSiblings(diffContext, vNodeWithKey);

  return vNodeWithKey;
}

function collectSideBufferSiblings(diffContext: DiffContext, targetNode: VNode | null): void {
  if (!targetNode) {
    if (diffContext.vCurrent) {
      const name = vnode_isElementVNode(diffContext.vCurrent)
        ? vnode_getElementName(diffContext.vCurrent)
        : null;
      const vKey =
        getKey(diffContext.vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
        getComponentHash(diffContext.vCurrent, diffContext.container.$getObjectById$);
      if (vKey != null) {
        const sideBufferKey = getSideBufferKey(name, vKey);
        diffContext.vSideBuffer ||= new Map();
        diffContext.vSideBuffer.set(sideBufferKey, diffContext.vCurrent);
        diffContext.vSiblings?.delete(sideBufferKey);
      }
    }

    return;
  }

  // Walk from vCurrent up to the target node and collect all keyed siblings
  let vNode = diffContext.vCurrent;
  while (vNode && vNode !== targetNode) {
    const name = vnode_isElementVNode(vNode) ? vnode_getElementName(vNode) : null;
    const vKey =
      getKey(vNode as VirtualVNode | ElementVNode | TextVNode | null) ||
      getComponentHash(vNode, diffContext.container.$getObjectById$);

    if (vKey != null) {
      const sideBufferKey = getSideBufferKey(name, vKey);
      diffContext.vSideBuffer ||= new Map();
      diffContext.vSideBuffer.set(sideBufferKey, vNode);
      diffContext.vSiblings?.delete(sideBufferKey);
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

function deleteFromSideBuffer(
  diffContext: DiffContext,
  nodeName: string | null,
  key: string | null
): boolean {
  const sbKey = getSideBufferKey(nodeName, key);
  if (sbKey && diffContext.vSideBuffer?.has(sbKey)) {
    diffContext.vSideBuffer.delete(sbKey);
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
  diffContext: DiffContext,
  nodeName: string | null,
  lookupKey: string | null,
  sideBufferKey: string | null,
  parentForInsert: VNode,
  addCurrentToSideBufferOnSideInsert?: boolean
): boolean {
  // 1) Try to find the node among upcoming siblings
  diffContext.vNewNode = retrieveChildWithKey(diffContext, nodeName, lookupKey);

  if (diffContext.vNewNode) {
    vnode_insertBefore(
      diffContext.journal,
      parentForInsert as ElementVNode | VirtualVNode,
      diffContext.vNewNode,
      diffContext.vCurrent
    );
    diffContext.vCurrent = diffContext.vNewNode;
    diffContext.vNewNode = null;
    return false;
  }

  // 2) Try side buffer
  if (sideBufferKey != null) {
    const buffered = diffContext.vSideBuffer?.get(sideBufferKey) || null;
    if (buffered) {
      diffContext.vSideBuffer!.delete(sideBufferKey);
      if (addCurrentToSideBufferOnSideInsert && diffContext.vCurrent) {
        const currentKey =
          getKey(diffContext.vCurrent as VirtualVNode | ElementVNode | TextVNode | null) ||
          getComponentHash(diffContext.vCurrent, diffContext.container.$getObjectById$);
        if (currentKey != null) {
          const currentName = vnode_isElementVNode(diffContext.vCurrent)
            ? vnode_getElementName(diffContext.vCurrent)
            : null;
          const currentSideKey = getSideBufferKey(currentName, currentKey);
          if (currentSideKey != null) {
            diffContext.vSideBuffer ||= new Map();
            diffContext.vSideBuffer.set(currentSideKey, diffContext.vCurrent);
          }
        }
      }
      vnode_insertBefore(
        diffContext.journal,
        parentForInsert as ElementVNode | VirtualVNode,
        buffered,
        diffContext.vCurrent
      );
      diffContext.vCurrent = buffered;
      diffContext.vNewNode = null;
      return false;
    }
  }

  // 3) Create new
  return true;
}

function expectVirtual(diffContext: DiffContext, type: VirtualType, jsxKey: string | null) {
  const checkKey = type === VirtualType.Fragment;
  const currentKey = getKey(diffContext.vCurrent as VirtualVNode | ElementVNode | TextVNode | null);
  const currentIsVirtual = diffContext.vCurrent && vnode_isVirtualVNode(diffContext.vCurrent);
  const isSameNode = currentIsVirtual && currentKey === jsxKey && (checkKey ? !!jsxKey : true);

  if (isSameNode) {
    // All is good.
    deleteFromSideBuffer(diffContext, null, currentKey);
    return;
  }

  // For fragments without a key, always create a new virtual node (ensures rerender semantics)
  if (jsxKey === null || diffContext.isCreationMode) {
    vnode_insertBefore(
      diffContext.journal,
      diffContext.vParent as VirtualVNode,
      (diffContext.vNewNode = vnode_newVirtual()),
      diffContext.vCurrent && getInsertBefore(diffContext)
    );
    (diffContext.vNewNode as VirtualVNode).key = jsxKey;
    isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, type);
    return;
  }
  if (
    moveOrCreateKeyedNode(
      diffContext,
      null,
      jsxKey,
      getSideBufferKey(null, jsxKey),
      diffContext.vParent as VirtualVNode,
      true
    )
  ) {
    vnode_insertBefore(
      diffContext.journal,
      diffContext.vParent as VirtualVNode,
      (diffContext.vNewNode = vnode_newVirtual()),
      diffContext.vCurrent && getInsertBefore(diffContext)
    );
    (diffContext.vNewNode as VirtualVNode).key = jsxKey;
    isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, type);
  }
}

function expectComponent(diffContext: DiffContext, component: Function) {
  const componentMeta = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];
  let host = (diffContext.vNewNode || diffContext.vCurrent) as VirtualVNode | null;
  const jsxNode = diffContext.jsxValue as JSXNodeInternal;
  if (componentMeta) {
    const jsxProps = jsxNode.props as PropsProxy;
    // QComponent
    let shouldRender = false;
    const [componentQRL] = componentMeta;

    const componentHash = componentQRL.$hash$;
    const vNodeComponentHash = getComponentHash(host, diffContext.container.$getObjectById$);

    const lookupKey = jsxNode.key || componentHash;
    const vNodeLookupKey = getKey(host) || vNodeComponentHash;

    const lookupKeysAreEqual = lookupKey === vNodeLookupKey;
    const hashesAreEqual = componentHash === vNodeComponentHash;

    if (!lookupKeysAreEqual) {
      if (
        moveOrCreateKeyedNode(
          diffContext,
          null,
          lookupKey,
          lookupKey,
          diffContext.vParent as VirtualVNode
        )
      ) {
        insertNewComponent(diffContext, host, componentQRL, jsxProps);
        shouldRender = true;
      }
      host = (diffContext.vNewNode || diffContext.vCurrent) as VirtualVNode;
    } else if (!hashesAreEqual || !jsxNode.key) {
      insertNewComponent(diffContext, host, componentQRL, jsxProps);
      host = diffContext.vNewNode as VirtualVNode;
      shouldRender = true;
    } else {
      // delete the key from the side buffer if it is the same component
      deleteFromSideBuffer(diffContext, null, lookupKey);
    }

    if (host) {
      const vNodeProps = vnode_getProp<PropsProxy | null>(
        host as VirtualVNode,
        ELEMENT_PROPS,
        diffContext.container.$getObjectById$
      );
      if (!shouldRender) {
        shouldRender ||= handleProps(host, jsxProps, vNodeProps, diffContext.container);
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
        markVNodeDirty(
          diffContext.container,
          host as VirtualVNode,
          ChoreBits.COMPONENT,
          diffContext.cursor
        );
      }
    }
    descendContentToProject(diffContext, jsxNode.children, host);
  } else {
    const lookupKey = jsxNode.key;
    const vNodeLookupKey = getKey(host);
    const lookupKeysAreEqual = lookupKey === vNodeLookupKey;
    const vNodeComponentHash = getComponentHash(host, diffContext.container.$getObjectById$);
    const isInlineComponent = vNodeComponentHash == null;

    if ((host && !isInlineComponent) || lookupKey == null) {
      insertNewInlineComponent(diffContext);
      host = diffContext.vNewNode as VirtualVNode;
    } else if (!lookupKeysAreEqual) {
      if (
        moveOrCreateKeyedNode(
          diffContext,
          null,
          lookupKey,
          lookupKey,
          diffContext.vParent as VirtualVNode
        )
      ) {
        // We did not find the inline component, create it.
        insertNewInlineComponent(diffContext);
      }
      host = (diffContext.vNewNode || diffContext.vCurrent) as VirtualVNode;
    } else {
      // delete the key from the side buffer if it is the same component
      deleteFromSideBuffer(diffContext, null, lookupKey);
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
        diffContext.container,
        host,
        (componentHost || diffContext.container.rootVNode) as HostElement,
        component as OnRenderFn<unknown>,
        jsxNode.props
      );

      diffContext.asyncQueue.push(jsxOutput, host);
    }
  }
}

function insertNewComponent(
  diffContext: DiffContext,
  host: VNode | null,
  componentQRL: QRLInternal<OnRenderFn<any>>,
  jsxProps: Props
) {
  if (host) {
    clearAllEffects(diffContext.container, host);
  }
  vnode_insertBefore(
    diffContext.journal,
    diffContext.vParent as VirtualVNode,
    (diffContext.vNewNode = vnode_newVirtual()),
    diffContext.vCurrent && getInsertBefore(diffContext)
  );
  const jsxNode = diffContext.jsxValue as JSXNodeInternal;
  isDev && vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.Component);
  vnode_setProp(diffContext.vNewNode as VirtualVNode, OnRenderProp, componentQRL);
  vnode_setProp(diffContext.vNewNode as VirtualVNode, ELEMENT_PROPS, jsxProps);
  (diffContext.vNewNode as VirtualVNode).key = jsxNode.key;
}

function insertNewInlineComponent(diffContext: DiffContext) {
  vnode_insertBefore(
    diffContext.journal,
    diffContext.vParent as VirtualVNode,
    (diffContext.vNewNode = vnode_newVirtual()),
    diffContext.vCurrent && getInsertBefore(diffContext)
  );
  const jsxNode = diffContext.jsxValue as JSXNodeInternal;
  isDev &&
    vnode_setProp(diffContext.vNewNode as VirtualVNode, DEBUG_TYPE, VirtualType.InlineComponent);
  vnode_setProp(diffContext.vNewNode as VirtualVNode, ELEMENT_PROPS, jsxNode.props);
  if (jsxNode.key) {
    (diffContext.vNewNode as VirtualVNode).key = jsxNode.key;
  }
}

function expectText(diffContext: DiffContext, text: string) {
  if (diffContext.vCurrent !== null) {
    const type = vnode_getType(diffContext.vCurrent);
    if (type === 3 /* Text */) {
      if (text !== vnode_getText(diffContext.vCurrent as TextVNode)) {
        vnode_setText(diffContext.journal, diffContext.vCurrent as TextVNode, text);
        return;
      }
      return;
    }
  }
  vnode_insertBefore(
    diffContext.journal,
    diffContext.vParent as VirtualVNode,
    (diffContext.vNewNode = vnode_newText(
      (import.meta.env.TEST ? diffContext.container.document : document).createTextNode(text),
      text
    )),
    diffContext.vCurrent
  );
}

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
    const constPropsDifferent = handleChangedProps(
      jsxProps[_CONST_PROPS],
      vNodeProps[_CONST_PROPS],
      vNodeProps[_PROPS_HANDLER],
      container,
      false
    );
    shouldRender ||= constPropsDifferent;
    const varPropsDifferent = handleChangedProps(
      jsxProps[_VAR_PROPS],
      vNodeProps[_VAR_PROPS],
      vNodeProps[_PROPS_HANDLER],
      container,
      true
    );
    shouldRender ||= varPropsDifferent;
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
        if (triggerEffects) {
          if (dst) {
            // Update the value in dst BEFORE triggering effects
            // so effects see the new value
            // Note: Value is not triggering effects, because we are modyfing direct VAR_PROPS object
            dst[key] = src[key];
          }
          const didTigger = triggerPropsProxyEffect(propsHandler, key);
          if (!didTigger) {
            // If the effect was not triggered, then the prop has changed and we should rerender
            changed = true;
          }
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
        if (triggerEffects) {
          delete dst[key];
          const didTigger = triggerPropsProxyEffect(propsHandler, key);
          if (!didTigger) {
            // If the effect was not triggered, then the prop has changed and we should rerender
            changed = true;
          }
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

function areWrappedSignalsEqual(
  oldSignal: WrappedSignalImpl<any>,
  newSignal: WrappedSignalImpl<any>
): boolean {
  if (oldSignal === newSignal) {
    return true;
  }
  return (
    newSignal.$func$ === oldSignal.$func$ && areArgumentsEqual(newSignal.$args$, oldSignal.$args$)
  );
}

function areArgumentsEqual(oldArgs: any[] | undefined, newArgs: any[] | undefined): boolean {
  if (oldArgs === newArgs) {
    return true;
  }
  if (!oldArgs || !newArgs || oldArgs.length !== newArgs.length) {
    return false;
  }
  for (let i = 0; i < oldArgs.length; i++) {
    if (oldArgs[i] !== newArgs[i]) {
      return false;
    }
  }
  return true;
}

function containsWrappedSignal(data: unknown[], signal: Signal<any>): boolean {
  if (!(signal instanceof WrappedSignalImpl)) {
    return false;
  }
  for (const item of data) {
    if (item instanceof WrappedSignalImpl && areWrappedSignalsEqual(item, signal)) {
      return true;
    }
  }
  return false;
}

/**
 * This marks the property as immutable. It is needed for the QRLs so that QwikLoader can get a hold
 * of them. This character must be `:` so that the `vnode_getAttr` can ignore them.
 */
export const HANDLER_PREFIX = ':';
let count = 0;
