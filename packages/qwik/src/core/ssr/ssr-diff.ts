/**
 * @file SSR diff — processes JSX into SsrNode children using a DiffContext state machine.
 *
 *   This is the SSR equivalent of client `vnode_diff`. It follows the same DiffContext-based
 *   traversal pattern: a while-loop dispatching on JSX type, with descend/ascend/advance stack
 *   mechanics shared via BaseDiffContext.
 *
 *   Key differences from client:
 *   - Component$ is DEFERRED: creates SsrNode, stores QRL+props, marks COMPONENT dirty.
 *     The cursor walker executes component rendering via executeSsrComponent.
 *   - Inline components are executed immediately and their JSX pushed to asyncQueue.
 *   - SSR-specific JSX types (SSRComment, SSRRaw, SSRStream, SSRStreamBlock, Suspense).
 *   - On first render, always in creation mode (no existing children to reconcile).
 *   - On re-render (signal/task re-dirty), reconciles against existing SsrNode children.
 *
 *   Container open/close methods (openElement/closeElement, openFragment/closeFragment) manage
 *   the element frame stack and VNodeData. Close callbacks are stored on a `$closeStack$` that
 *   is synchronized with the DiffContext's descend/ascend operations.
 */

import { isDev } from '@qwik.dev/core/build';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
import { EffectProperty } from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { isQwikComponent, SERIALIZABLE_STATE, type OnRenderFn } from '../shared/component.public';
import type { Cursor } from '../shared/cursor/cursor';
import {
  type BaseDiffContext,
  advance as baseAdvance,
  stackPush as baseStackPush,
  stackPopBase,
} from '../shared/diff-context';
import { Fragment } from '../shared/jsx/jsx-runtime';
import { isJSXNode } from '../shared/jsx/jsx-node';
import { directGetPropsProxyProp } from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import { JSXNodeFlags, type JSXNodeInternal, type JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import {
  SSRComment,
  SSRRaw,
  SSRStream,
  SSRStreamBlock,
  Suspense,
  type SSRStreamChildren,
} from '../shared/jsx/utils.public';
import type { QRLInternal } from '../shared/qrl/qrl-class';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { EMPTY_OBJ } from '../shared/utils/flyweight';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import {
  ELEMENT_KEY,
  ELEMENT_PROPS,
  OnRenderProp,
  QDefaultSlot,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { isPromise, maybeThen, retryOnPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import type { VNode } from '../shared/vnode/vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { trackSignalAndAssignHost } from '../use/use-core';
import type { SerializationContext } from '../shared/serdes/index';
import type { ISsrComponentFrame, ISsrNode, SSRContainer } from './ssr-types';
import { applyInlineComponent } from './ssr-render-component';

/** Non-serializable prop key for storing the component frame on the host SsrNode. */
const SSR_COMPONENT_FRAME = ':componentFrame';
import { isAsyncGenerator } from '../shared/utils/async-generator';

// ============================================================================
// SsrDiffContext
// ============================================================================

export interface SsrDiffContext extends BaseDiffContext {
  $container$: SSRContainer;
  /** Current scoped style prefix for class injection */
  $currentStyleScoped$: string | null;
  /** Current component frame for slot distribution */
  $parentComponentFrame$: ISsrComponentFrame | null;
  /**
   * Close callback stack — synchronized with DiffContext stack.
   * Each ssrDescend pushes a callback (or null), each ssrAscend pops and executes it.
   * This ensures container open/close operations (element frames, fragment boundaries)
   * are properly balanced with the DiffContext's descend/ascend.
   */
  $closeStack$: Array<(() => void) | null>;
}

function createSsrDiffContext(
  container: SSRContainer,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null,
  parentComponentFrame: ISsrComponentFrame | null
): SsrDiffContext {
  return {
    $container$: container,
    $cursor$: cursor,
    $scopedStyleIdPrefix$: scopedStyleIdPrefix,
    $stack$: [],
    $asyncQueue$: [],
    $vParent$: null!,
    $vCurrent$: null,
    $vNewNode$: null,
    $vSiblings$: null,
    $vSiblingsArray$: null,
    $vSideBuffer$: null,
    $jsxChildren$: null!,
    $jsxValue$: null,
    $jsxIdx$: 0,
    $jsxCount$: 0,
    $shouldAdvance$: true,
    $isCreationMode$: true,
    $currentStyleScoped$: scopedStyleIdPrefix,
    $parentComponentFrame$: parentComponentFrame,
    $closeStack$: [],
  };
}

// ============================================================================
// Stack mechanics with close callback synchronization
// ============================================================================

/** Descend into children, optionally registering a close callback for ascend. */
function ssrDescend(
  ctx: SsrDiffContext,
  children: JSXChildren,
  descendVNode: boolean,
  closeCallback: (() => void) | null = null
) {
  ctx.$closeStack$.push(closeCallback);
  baseStackPush(ctx, children, descendVNode);
  if (descendVNode) {
    const parent = (ctx.$vNewNode$ || ctx.$vCurrent$)!;
    const parentVirtual = parent as unknown as VirtualVNode;
    ctx.$isCreationMode$ =
      ctx.$isCreationMode$ || !!ctx.$vNewNode$ || !parentVirtual.firstChild;
    ctx.$vSideBuffer$ = null;
    ctx.$vSiblings$ = null;
    ctx.$vSiblingsArray$ = null;
    ctx.$vParent$ = parent;
    ctx.$vCurrent$ = (parentVirtual.firstChild as VNode | null) ?? null;
    ctx.$vNewNode$ = null;
  }
  ctx.$shouldAdvance$ = false;
}

/** Ascend from children, executing the close callback pushed during ssrDescend. */
function ssrAscend(ctx: SsrDiffContext) {
  const cb = ctx.$closeStack$.pop();
  stackPopBase(ctx);
  if (cb) {
    cb();
  }
  ssrAdvance(ctx);
}

function ssrAdvance(ctx: SsrDiffContext) {
  baseAdvance(ctx, ssrAscend);
}

// ============================================================================
// Main entry point
// ============================================================================

/**
 * Process JSX and create/reconcile child SsrNodes under a parent VNode.
 *
 * @param container - The SSR container
 * @param jsx - JSX to process
 * @param parentVNode - Parent VNode (cursor tree node for dirty propagation)
 * @param cursor - The cursor driving this diff
 * @param scopedStyleIdPrefix - Current scoped style prefix
 * @param parentComponentFrame - Current component frame for slot distribution
 */
export function ssrDiff(
  container: SSRContainer,
  jsx: JSXOutput,
  parentVNode: VNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null,
  parentComponentFrame: ISsrComponentFrame | null = null
): ValueOrPromise<void> {
  const ctx = createSsrDiffContext(container, cursor, scopedStyleIdPrefix, parentComponentFrame);
  diff(ctx, jsx as JSXChildren, parentVNode);
  return drainAsyncQueue(ctx);
}

// ============================================================================
// Core diff loop
// ============================================================================

function diff(ctx: SsrDiffContext, jsxNode: JSXChildren, vStartNode: VNode) {
  const ssr = ctx.$container$;
  ctx.$vParent$ = vStartNode;
  ctx.$vNewNode$ = null;
  ctx.$vCurrent$ = ((vStartNode as unknown as VirtualVNode).firstChild as VNode | null) ?? null;
  // Root-level push: no close callback needed
  ctx.$closeStack$.push(null);
  baseStackPush(ctx, jsxNode, true);

  while (ctx.$stack$.length) {
    while (ctx.$jsxIdx$ < ctx.$jsxCount$) {
      const value = ctx.$jsxValue$;

      if (typeof value === 'string') {
        ssr.textNode(value);
      } else if (typeof value === 'number') {
        ssr.textNode(String(value));
      } else if (value == null || typeof value === 'boolean') {
        ssr.textNode('');
      } else if (typeof value === 'object') {
        if (isJSXNode(value)) {
          const jsx = value as JSXNodeInternal;
          const type = jsx.type;

          if (typeof type === 'string') {
            ssrElement(ctx, jsx, type);
          } else if (typeof type === 'function') {
            if (type === Fragment) {
              ssrFragment(ctx, jsx);
            } else if (type === Slot) {
              ssrSlot(ctx, jsx);
            } else if (type === SSRComment) {
              ssr.commentNode(directGetPropsProxyProp(jsx, 'data') || '');
            } else if (type === SSRRaw) {
              ssr.htmlNode(directGetPropsProxyProp(jsx, 'data'));
            } else if (type === SSRStream) {
              ssrStream(ctx, jsx);
            } else if (type === SSRStreamBlock) {
              ssrStreamBlock(ctx, jsx);
            } else if (type === Suspense) {
              ssrSuspense(ctx, jsx);
            } else if (isQwikComponent(type)) {
              ssrComponent(ctx, jsx, type);
            } else {
              ssrInlineComponent(ctx, jsx, type);
            }
          }
        } else if (Array.isArray(value)) {
          ssrDescend(ctx, value, false);
        } else if (isSignal(value)) {
          ssrSignal(ctx, value);
        } else if (isPromise(value)) {
          ssrPromise(ctx, value);
        } else if (isAsyncGenerator(value)) {
          ssrAsyncGenerator(ctx, value);
        }
      }
      ssrAdvance(ctx);
    }
    ssrAscend(ctx);
  }
}

// ============================================================================
// Async queue draining
// ============================================================================

function drainAsyncQueue(ctx: SsrDiffContext): ValueOrPromise<void> {
  while (ctx.$asyncQueue$.length > 0) {
    const jsxOrPromise = ctx.$asyncQueue$.shift()!;
    const vNode = ctx.$asyncQueue$.shift() as VNode;

    if (isPromise(jsxOrPromise)) {
      return maybeThen(jsxOrPromise as Promise<JSXOutput>, (resolvedJsx) => {
        diff(ctx, resolvedJsx as JSXChildren, vNode);
        return drainAsyncQueue(ctx);
      });
    } else {
      diff(ctx, jsxOrPromise as JSXChildren, vNode);
    }
  }
}

// ============================================================================
// JSX type handlers
// ============================================================================

/** HTML element: open, descend into children, close on ascend. */
function ssrElement(ctx: SsrDiffContext, jsx: JSXNodeInternal, tagName: string) {
  const ssr = ctx.$container$;

  appendClassIfScopedStyleExists(jsx, ctx.$currentStyleScoped$);

  let currentFile: string | null = null;
  if (isDev && jsx.dev && tagName !== 'head') {
    currentFile = getFileLocationFromJsx(jsx.dev);
    if (qInspector) {
      appendQwikInspectorAttribute(jsx, currentFile);
    }
  }

  const innerHTML = ssr.openElement(
    tagName,
    jsx.key,
    jsx.varProps,
    jsx.constProps,
    ctx.$currentStyleScoped$,
    currentFile,
    !!(jsx.flags & JSXNodeFlags.HasCapturedProps)
  );

  if (innerHTML) {
    ssr.htmlNode(innerHTML);
  }

  // Handle special elements
  if (tagName === 'head') {
    ssr.emitQwikLoaderAtTopIfNeeded();
    ssr.emitPreloaderPre();
    // Additional head nodes processed after children via async queue
    const headNodes = ssr.additionalHeadNodes;
    if (headNodes.length > 0) {
      ctx.$asyncQueue$.push(headNodes as unknown as JSXChildren, ctx.$vParent$);
    }
  } else if (tagName === 'body') {
    const bodyNodes = ssr.additionalBodyNodes;
    if (bodyNodes.length > 0) {
      ctx.$asyncQueue$.push(bodyNodes as unknown as JSXChildren, ctx.$vParent$);
    }
  } else if (!ssr.isHtml && !(ssr as any)._didAddQwikLoader) {
    ssr.emitQwikLoaderAtTopIfNeeded();
    ssr.emitPreloaderPre();
    (ssr as any)._didAddQwikLoader = true;
  }

  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;

  const children = jsx.children as JSXOutput;
  if (children != null && !innerHTML) {
    ssrDescend(ctx, children as JSXChildren, true, () => ssr.closeElement());
  } else {
    ssr.closeElement();
  }
}

/** Fragment: open virtual node, descend, close on ascend. */
function ssrFragment(ctx: SsrDiffContext, jsx: JSXNodeInternal) {
  const ssr = ctx.$container$;
  const attrs: Record<string, string | null> = jsx.key != null ? { [ELEMENT_KEY]: jsx.key } : {};
  if (isDev) {
    attrs[DEBUG_TYPE] = VirtualType.Fragment;
  }
  ssr.openFragment(attrs);
  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;

  const children = jsx.children as JSXOutput;
  if (children != null) {
    ssrDescend(ctx, children as JSXChildren, true, () => ssr.closeFragment());
  } else {
    ssr.closeFragment();
  }
}

/**
 * Component$ (DEFERRED): create boundary, store QRL+props, distribute slots,
 * mark COMPONENT dirty, close boundary. Does NOT execute or descend.
 */
function ssrComponent(ctx: SsrDiffContext, jsx: JSXNodeInternal, component: Function) {
  const ssr = ctx.$container$;
  const [componentQRL] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];

  const componentAttrs: Record<string, string | null> = {};
  if (isDev) {
    componentAttrs[DEBUG_TYPE] = VirtualType.Component;
  }
  ssr.openComponent(componentAttrs);
  const host = ssr.getOrCreateLastNode();
  const componentFrame = ssr.getParentComponentFrame()!;

  // Distribute jsx.children into slot buckets
  componentFrame.distributeChildrenIntoSlots(
    jsx.children,
    ctx.$currentStyleScoped$,
    ctx.$parentComponentFrame$
  );

  // Store QRL and props on the host node
  const srcProps = jsx.props;
  if (srcProps && srcProps.children) {
    delete srcProps.children;
  }
  host.setProp(OnRenderProp, componentQRL);
  host.setProp(ELEMENT_PROPS, srcProps);
  if (jsx.key !== null) {
    host.setProp(ELEMENT_KEY, jsx.key);
  }

  // Store component frame on host for later use by executeSsrComponent
  host.setProp(SSR_COMPONENT_FRAME, componentFrame);

  // Set VNode parent for dirty propagation
  const hostVNode = host as unknown as VNode;
  hostVNode.parent = ctx.$vParent$;

  // Mark COMPONENT dirty — cursor walker will execute the component
  markVNodeDirty(ssr, hostVNode, ChoreBits.COMPONENT, ctx.$cursor$);

  // Close boundary immediately (no children to descend into)
  // Lightweight close: pop component frame and fragment, but skip unclaimed projections
  // (those are handled by executeSsrComponent after execution)
  const walkCtx = (ssr as any).activeWalkCtx;
  walkCtx.componentStack.pop();
  ssr.closeFragment();
  walkCtx.currentComponentNode =
    walkCtx.currentComponentNode?.parentComponent || null;
  // Restore parentVNode for cursor tree
  if ((ssr as any)._parentVNodeStack.length > 0) {
    (ssr as any)._currentParentVNode = (ssr as any)._parentVNodeStack.pop()!;
  }
}

/**
 * Inline component: open fragment, execute component function, push result to async queue.
 * Close fragment after async queue processes the result.
 */
function ssrInlineComponent(ctx: SsrDiffContext, jsx: JSXNodeInternal, inlineFn: Function) {
  const ssr = ctx.$container$;

  const inlineAttrs: Record<string, string | null> = { [ELEMENT_KEY]: jsx.key };
  if (isDev) {
    inlineAttrs[DEBUG_TYPE] = VirtualType.InlineComponent;
  }
  ssr.openFragment(inlineAttrs);
  const node = ssr.getOrCreateLastNode();

  const component = ssr.getParentComponentFrame();
  const jsxOutput = applyInlineComponent(
    ssr,
    component && component.componentNode,
    inlineFn as OnRenderFn<any>,
    jsx
  );

  // The inline component's output will be processed as children of this fragment.
  // Push (output, fragmentNode) to asyncQueue. The drainAsyncQueue will call diff()
  // which opens a new stack level under the fragment node.
  const fragmentVNode = node as unknown as VNode;

  if (isPromise(jsxOutput)) {
    ctx.$asyncQueue$.push(jsxOutput as Promise<JSXOutput>, fragmentVNode);
  } else {
    ctx.$asyncQueue$.push(jsxOutput as unknown as JSXChildren, fragmentVNode);
  }

  // Close fragment will happen after asyncQueue processes the component output.
  // We need to defer it. Push a special "close" entry to the async queue.
  ctx.$asyncQueue$.push(
    { then: (cb: any) => cb(undefined) } as any, // resolved micro-promise
    { firstChild: null, parent: null } as any // dummy vNode — diff will be a no-op
  );
  // Actually, we can't reliably close the fragment via asyncQueue because
  // other async items might interleave. Instead, close the fragment now —
  // the container's ssrNodeStack and frame are restored, but the SsrNode
  // remains in the tree with its children populated by the async diff.
  ssr.closeFragment();
}

/** Signal: wrap in virtual node, track, descend into value. */
function ssrSignal(ctx: SsrDiffContext, signal: any) {
  const ssr = ctx.$container$;

  maybeAddPollingAsyncSignalToEagerResume(ssr.serializationCtx, signal);

  const attrs: Record<string, any> = isDev
    ? { [DEBUG_TYPE]: VirtualType.WrappedSignal }
    : EMPTY_OBJ;
  ssr.openFragment(attrs);
  const signalNode = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = signalNode as unknown as VNode;

  const unwrappedSignal = signal instanceof WrappedSignalImpl ? signal.$unwrapIfSignal$() : signal;

  const trackFn = () =>
    trackSignalAndAssignHost(unwrappedSignal, signalNode as unknown as VNode, EffectProperty.VNODE, ssr);

  // Signal tracking may throw a promise (async signals)
  const trackedValue = retryOnPromise(trackFn);
  if (isPromise(trackedValue)) {
    // Push to async queue for later resolution
    ctx.$asyncQueue$.push(trackedValue as Promise<JSXOutput>, signalNode as unknown as VNode);
    ssr.closeFragment();
  } else {
    // Descend into the tracked signal value synchronously
    ssrDescend(ctx, trackedValue as JSXChildren, true, () => ssr.closeFragment());
  }
}

/** Promise: wrap in virtual node, flush stream, push to async queue. */
function ssrPromise(ctx: SsrDiffContext, promise: Promise<any>) {
  const ssr = ctx.$container$;

  const attrs: Record<string, any> = isDev ? { [DEBUG_TYPE]: VirtualType.Awaited } : EMPTY_OBJ;
  ssr.openFragment(attrs);
  const node = ssr.getOrCreateLastNode();

  ssr.streamHandler.flush();

  // Push promise to async queue — diff will process resolved value under this fragment
  ctx.$asyncQueue$.push(promise as Promise<JSXOutput>, node as unknown as VNode);
  ssr.closeFragment();
}

/** Slot: consume projected content from component frame. */
function ssrSlot(ctx: SsrDiffContext, jsx: JSXNodeInternal) {
  const ssr = ctx.$container$;
  const componentFrame = ctx.$parentComponentFrame$;

  if (componentFrame) {
    const compId = componentFrame.componentNode.id || '';
    const projectionAttrs: Record<string, string | null> = isDev
      ? { [DEBUG_TYPE]: VirtualType.Projection }
      : {};
    projectionAttrs[QSlotParent] = compId;
    ssr.openProjection(projectionAttrs);

    const host = componentFrame.componentNode;
    const node = ssr.getOrCreateLastNode();
    const slotName = getSlotName(host, jsx, ssr);
    projectionAttrs[QSlot] = slotName;

    const slotDefaultChildren: JSXChildren | null = jsx.children || null;
    const slotChildren =
      componentFrame.consumeChildrenForSlot(node, slotName) || slotDefaultChildren;
    if (slotDefaultChildren && slotChildren !== slotDefaultChildren) {
      ssr.addUnclaimedProjection(componentFrame, QDefaultSlot, slotDefaultChildren);
    }

    // Save style/component frame, switch to projection's scope
    const savedStyleScoped = ctx.$currentStyleScoped$;
    const savedComponentFrame = ctx.$parentComponentFrame$;
    ctx.$currentStyleScoped$ = componentFrame.projectionScopedStyle;
    ctx.$parentComponentFrame$ = componentFrame.projectionComponentFrame;

    if (slotChildren != null) {
      ssrDescend(ctx, slotChildren as JSXChildren, true, () => {
        ssr.closeProjection();
        ctx.$currentStyleScoped$ = savedStyleScoped;
        ctx.$parentComponentFrame$ = savedComponentFrame;
      });
    } else {
      ssr.closeProjection();
      ctx.$currentStyleScoped$ = savedStyleScoped;
      ctx.$parentComponentFrame$ = savedComponentFrame;
    }
  } else {
    // No component frame — emit empty projection marker
    let projectionAttrs = EMPTY_OBJ;
    if (isDev) {
      projectionAttrs = { [DEBUG_TYPE]: VirtualType.Projection };
    }
    ssr.openFragment(projectionAttrs);
    ssr.closeFragment();
  }
}

/** Suspense: create boundary, process fallback inline, create sub-cursor for children. */
function ssrSuspense(ctx: SsrDiffContext, jsx: JSXNodeInternal) {
  const ssr = ctx.$container$;
  const fallback = directGetPropsProxyProp(jsx, 'fallback') as JSXOutput;

  const suspenseAttrs: Record<string, string | null> = {};
  if (isDev) {
    suspenseAttrs[DEBUG_TYPE] = VirtualType.InlineComponent;
  }
  ssr.openSuspenseBoundary(suspenseAttrs);
  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;

  // Create sub-cursor for Suspense children before processing fallback
  const children = jsx.children as JSXOutput;
  if (children != null) {
    (ssr as any).createSuspenseSubCursor(children);
  }

  if (fallback != null) {
    ssrDescend(ctx, fallback as JSXChildren, true, () => ssr.closeSuspenseBoundary());
  } else {
    ssr.closeSuspenseBoundary();
  }
}

/** SSRStream: flush and process generator or async value. */
function ssrStream(ctx: SsrDiffContext, jsx: JSXNodeInternal) {
  const ssr = ctx.$container$;
  ssr.streamHandler.flush();

  const generator = jsx.children as SSRStreamChildren;
  let value: AsyncGenerator | Promise<void>;

  if (isFunction(generator)) {
    value = generator({
      async write(chunk) {
        await ssrDiff(
          ssr,
          chunk,
          ctx.$vParent$,
          ctx.$cursor$,
          ctx.$currentStyleScoped$,
          ctx.$parentComponentFrame$
        );
        ssr.streamHandler.flush();
      },
    });
  } else {
    value = generator;
  }

  if (isPromise(value)) {
    ctx.$asyncQueue$.push(value as unknown as JSXChildren, ctx.$vParent$);
  }
}

/** SSRStreamBlock: wrap children in stream block markers. */
function ssrStreamBlock(ctx: SsrDiffContext, jsx: JSXNodeInternal) {
  const ssr = ctx.$container$;
  ssr.streamHandler.streamBlockStart();

  const children = jsx.children as JSXOutput;
  if (children != null) {
    ssrDescend(ctx, children as JSXChildren, false, () => ssr.streamHandler.streamBlockEnd());
  } else {
    ssr.streamHandler.streamBlockEnd();
  }
}

/** Async generator: process chunks as they arrive. */
function ssrAsyncGenerator(ctx: SsrDiffContext, generator: AsyncGenerator) {
  const ssr = ctx.$container$;

  const processGenerator = async () => {
    for await (const chunk of generator) {
      await ssrDiff(
        ssr,
        chunk as JSXOutput,
        ctx.$vParent$,
        ctx.$cursor$,
        ctx.$currentStyleScoped$,
        ctx.$parentComponentFrame$
      );
      ssr.streamHandler.flush();
    }
  };

  ctx.$asyncQueue$.push(processGenerator() as unknown as JSXChildren, ctx.$vParent$);
}

// ============================================================================
// Utility helpers
// ============================================================================

function getSlotName(host: ISsrNode, jsx: JSXNodeInternal, ssr: SSRContainer): string {
  const constProps = jsx.constProps;
  if (constProps && typeof constProps == 'object' && 'name' in constProps) {
    const constValue = constProps.name;
    if (constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(constValue, host as unknown as VNode, EffectProperty.COMPONENT, ssr);
    }
  }
  return directGetPropsProxyProp(jsx, 'name') || QDefaultSlot;
}

function appendQwikInspectorAttribute(jsx: JSXNodeInternal, value: string | null) {
  if (value && (!jsx.constProps || !(qwikInspectorAttr in jsx.constProps))) {
    (jsx.constProps ||= {})[qwikInspectorAttr] = value;
  }
}

function appendClassIfScopedStyleExists(jsx: JSXNodeInternal, styleScoped: string | null) {
  const classExists = directGetPropsProxyProp(jsx, 'class') != null;
  if (!classExists && styleScoped) {
    if (!jsx.constProps) {
      jsx.constProps = {};
    }
    jsx.constProps['class'] = '';
  }
}

function maybeAddPollingAsyncSignalToEagerResume(
  serializationCtx: SerializationContext,
  signal: unknown
) {
  const unwrappedSignal = signal instanceof WrappedSignalImpl ? signal.$unwrapIfSignal$() : signal;
  if (unwrappedSignal instanceof AsyncSignalImpl) {
    const interval = unwrappedSignal.$interval$;
    if (interval > 0) {
      serializationCtx.$addRoot$(unwrappedSignal);
      serializationCtx.$eagerResume$.add(unwrappedSignal);
    }
  }
}
