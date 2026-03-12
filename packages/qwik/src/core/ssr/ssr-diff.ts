/**
 * @file SSR diff — processes JSX into SsrNode children using a DiffContext state machine.
 *
 *   This is the SSR equivalent of client `vnode_diff`. It follows the same DiffContext-based
 *   traversal pattern: a while-loop dispatching on JSX type, with descend/ascend/advance stack
 *   mechanics shared via BaseDiffContext.
 *
 *   Key differences from client:
 *
 *   - Component$ is executed INLINE — sync components use ssrDescend/ssrAscend, async components break
 *       the diff loop and resume via drainAsyncQueue.
 *   - Inline components are executed immediately and their JSX pushed to asyncQueue.
 *   - SSR-specific JSX types (SSRComment, SSRRaw, SSRStream, SSRStreamBlock, Suspense).
 *   - On first render, always in creation mode (no existing children to reconcile).
 *   - On re-render (signal/task re-dirty), reconciles against existing SsrNode children.
 *
 *   Container open/close methods (openElement/closeElement, openFragment/closeFragment) manage the
 *   element frame stack and VNodeData. Close callbacks are stored on a `$closeStack$` that is
 *   synchronized with the DiffContext's descend/ascend operations.
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
import { ChoreBits } from '../shared/vnode/enums/chore-bits.enum';
import type { VNode } from '../shared/vnode/vnode';
import type { VirtualVNode } from '../shared/vnode/virtual-vnode';
import { markVNodeDirty } from '../shared/vnode/vnode-dirty';
import { trackSignalAndAssignHost } from '../use/use-core';
import type { SerializationContext } from '../shared/serdes/index';
import type { ISsrComponentFrame, ISsrNode, SSRContainer } from './ssr-types';
import { applyInlineComponent } from './ssr-render-component';
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
   * Close callback stack — synchronized with DiffContext stack. Each ssrDescend pushes a callback
   * (or null), each ssrAscend pops and executes it. This ensures container open/close operations
   * (element frames, fragment boundaries) are properly balanced with the DiffContext's
   * descend/ascend.
   */
  $closeStack$: Array<(() => void) | null>;
  /**
   * When set, the diff loop exits early. Used for async operations (async components, async close
   * callbacks) that need to break out of the synchronous loop. The asyncQueue draining handles
   * resumption after the async operation completes.
   */
  $asyncBreak$: boolean;
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
    $asyncBreak$: false,
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
    // Set VNode parent for dirty propagation — ensures markVNodeDirty can walk up to cursor root
    if (!parent.parent) {
      parent.parent = ctx.$vParent$;
    }
    ctx.$isCreationMode$ = ctx.$isCreationMode$ || !!ctx.$vNewNode$ || !parentVirtual.firstChild;
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
  if (!ctx.$asyncBreak$) {
    ssrAdvance(ctx);
  }
}

function ssrAdvance(ctx: SsrDiffContext) {
  if (ctx.$asyncBreak$) {
    return;
  }
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
 * @internal
 */
export function ssrDiff(
  container: SSRContainer,
  jsx: JSXOutput,
  parentVNode: VNode,
  cursor: Cursor,
  scopedStyleIdPrefix: string | null,
  parentComponentFrame: ISsrComponentFrame | null = null
): ValueOrPromise<void> {
  // Capture the active build state — during async yields, other cursors may swap
  // ssrBuildState. We restore it after each async resolution.
  const savedBuildState = (container as any).ssrBuildState;
  // Store active cursor for container methods that need to call ssrDiff (e.g., unclaimed projections)
  (container as any)._activeCursor = cursor;

  const ctx = createSsrDiffContext(container, cursor, scopedStyleIdPrefix, parentComponentFrame);
  diff(ctx, jsx as JSXChildren, parentVNode);
  return drainAsyncQueue(ctx, savedBuildState);
}

// ============================================================================
// Core diff loop
// ============================================================================

function diff(ctx: SsrDiffContext, jsxNode: JSXChildren, vStartNode: VNode) {
  ctx.$vParent$ = vStartNode;
  ctx.$vNewNode$ = null;
  ctx.$vCurrent$ = ((vStartNode as unknown as VirtualVNode).firstChild as VNode | null) ?? null;
  // Root-level push: no close callback needed
  ctx.$closeStack$.push(null);
  baseStackPush(ctx, jsxNode, true);

  runDiffLoop(ctx);
}

/** The inner while loop of diff — extracted so it can be resumed after async breaks. */
function runDiffLoop(ctx: SsrDiffContext) {
  const ssr = ctx.$container$;

  while (ctx.$stack$.length) {
    while (ctx.$jsxIdx$ < ctx.$jsxCount$) {
      if (ctx.$asyncBreak$) {
        return;
      }
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
    if (ctx.$asyncBreak$) {
      return;
    }
    ssrAscend(ctx);
  }
}

// ============================================================================
// Async queue draining
// ============================================================================

function drainAsyncQueue(ctx: SsrDiffContext, savedBuildState: any): ValueOrPromise<void> {
  const ssr = ctx.$container$;

  // Handle async break: process the async item, then resume the diff loop
  if (ctx.$asyncBreak$) {
    ctx.$asyncBreak$ = false;
    if (ctx.$asyncQueue$.length > 0) {
      const asyncItem = ctx.$asyncQueue$.shift()!;
      ctx.$asyncQueue$.shift(); // skip vNode marker

      if (isPromise(asyncItem)) {
        return maybeThen(asyncItem as Promise<JSXOutput | void>, (resolved) => {
          (ssr as any).ssrBuildState = savedBuildState;
          // Ensure advance actually moves forward (asyncBreak may have skipped ssrDescend)
          ctx.$shouldAdvance$ = true;
          ssrAdvance(ctx); // advance past the item that triggered the break
          runDiffLoop(ctx);
          return drainAsyncQueue(ctx, savedBuildState);
        });
      }
      // Sync async-break item — resume immediately
      ctx.$shouldAdvance$ = true;
      ssrAdvance(ctx);
      runDiffLoop(ctx);
    }
  }

  // Normal async queue processing
  while (ctx.$asyncQueue$.length > 0) {
    const jsxOrPromise = ctx.$asyncQueue$.shift()!;
    const vNode = ctx.$asyncQueue$.shift() as VNode;

    if (isPromise(jsxOrPromise)) {
      return maybeThen(jsxOrPromise as Promise<JSXOutput | void>, (resolvedJsx) => {
        (ssr as any).ssrBuildState = savedBuildState;
        if (resolvedJsx != null) {
          diff(ctx, resolvedJsx as JSXChildren, vNode);
        }
        return drainAsyncQueue(ctx, savedBuildState);
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
  let extraChildren: JSXOutput | null = null;
  if (tagName === 'head') {
    ssr.emitQwikLoaderAtTopIfNeeded();
    ssr.emitPreloaderPre();
    // Additional head nodes are merged with children (must be inside <head> before close)
    const headNodes = ssr.additionalHeadNodes;
    if (headNodes.length > 0) {
      extraChildren = headNodes as unknown as JSXOutput;
    }
  } else if (tagName === 'body') {
    const bodyNodes = ssr.additionalBodyNodes;
    if (bodyNodes.length > 0) {
      extraChildren = bodyNodes as unknown as JSXOutput;
    }
  } else if (!ssr.isHtml && !(ssr as any)._didAddQwikLoader) {
    ssr.emitQwikLoaderAtTopIfNeeded();
    ssr.emitPreloaderPre();
    (ssr as any)._didAddQwikLoader = true;
  }

  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;

  const children = jsx.children as JSXOutput;
  // Combine children with extra nodes (head styles, body scripts)
  const combinedChildren =
    extraChildren != null
      ? children != null
        ? [children, extraChildren]
        : extraChildren
      : children;
  if (combinedChildren != null && !innerHTML) {
    ssrDescend(ctx, combinedChildren as JSXChildren, true, () => ssr.closeElement());
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
 * Component$ (INLINE execution): open component, distribute slots, execute component QRL, process
 * returned JSX as children, close component on ascend.
 *
 * For sync components, children are processed via ssrDescend/ssrAscend. For async components, the
 * diff loop breaks and resumes via drainAsyncQueue.
 */
function ssrComponent(ctx: SsrDiffContext, jsx: JSXNodeInternal, component: Function) {
  const ssr = ctx.$container$;
  const [componentQRL] = (component as any)[SERIALIZABLE_STATE] as [QRLInternal<OnRenderFn<any>>];

  const componentAttrs: Record<string, string | null> = {};
  if (isDev) {
    componentAttrs[DEBUG_TYPE] = VirtualType.Component;
  }

  // Create component SsrNode directly (without openComponent which would
  // push build state that can't be popped if we defer).
  ssr.openFragment(componentAttrs);
  const host = ssr.getOrCreateLastNode();

  // Capture children BEFORE deleting from props (the props proxy delegates
  // children to jsx.children, so `delete srcProps.children` nullifies it).
  const children = jsx.children;

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

  // Create component frame and distribute slots (no walker context changes)
  const componentFrame = ssr.createAndDistributeComponentFrame(
    host,
    children,
    ctx.$currentStyleScoped$,
    ctx.$parentComponentFrame$
  );

  // Store component frame on node for cursor walker to retrieve
  host.setProp(':componentFrame', componentFrame);
  // Store parent element frame info for enterComponentContext to use when creating
  // a synthetic element frame (needed for HTML nesting validation and style routing).
  const parentFrame = (ssr as any).ssrBuildState.currentElementFrame;
  host.setProp(':parentTagNesting', parentFrame?.tagNesting ?? 0);
  host.setProp(':parentElementName', parentFrame?.elementName ?? null);

  // Register in cursor tree so cursor walker can visit and execute the component
  const hostVNode = host as unknown as VNode;
  hostVNode.parent = ctx.$vParent$;
  ctx.$vNewNode$ = hostVNode;

  // markVNodeDirty propagates CHILDREN up to the cursor root, so the walker finds this node
  markVNodeDirty(ssr, hostVNode, ChoreBits.COMPONENT, ctx.$cursor$);

  ssr.closeFragment();
}

/**
 * Inline component: open fragment, execute component function, process output. For sync output,
 * descend into children with close-fragment on ascend. For async output, push to asyncQueue and
 * close fragment immediately.
 */
function ssrInlineComponent(ctx: SsrDiffContext, jsx: JSXNodeInternal, inlineFn: Function) {
  const ssr = ctx.$container$;

  const inlineAttrs: Record<string, string | null> = { [ELEMENT_KEY]: jsx.key };
  if (isDev) {
    inlineAttrs[DEBUG_TYPE] = VirtualType.InlineComponent;
  }
  ssr.openFragment(inlineAttrs);
  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;

  // Use ctx.$parentComponentFrame$ (not ssr.getParentComponentFrame()) because in cursor-driven
  // mode each cursor has its own componentStack that doesn't include all ancestors.
  // Inside a projection, ssrSlot sets $parentComponentFrame$ to the projection's parent
  // component frame, which correctly crosses the projection boundary for subscription tracking.
  const parentFrame = ctx.$parentComponentFrame$;
  const jsxOutput = applyInlineComponent(
    ssr,
    parentFrame && parentFrame.componentNode,
    inlineFn as OnRenderFn<any>,
    jsx
  );

  const fragmentVNode = node as unknown as VNode;
  // Ensure VNode parent chain is connected for dirty propagation (async path doesn't call
  // ssrDescend which normally sets this).
  if (!fragmentVNode.parent) {
    fragmentVNode.parent = ctx.$vParent$;
  }

  if (isPromise(jsxOutput)) {
    // Async inline component: break the diff loop, keep parent elements open.
    // We must NOT close the fragment yet — the resolved JSX needs to be rendered
    // inside the current element frame context. Close fragment after resolution.
    ctx.$asyncBreak$ = true;
    const savedBuildState = (ssr as any).ssrBuildState;
    const asyncLifecycle = (jsxOutput as Promise<JSXOutput>).then(async (resolvedJsx) => {
      (ssr as any).ssrBuildState = savedBuildState;
      if (resolvedJsx != null) {
        await ssrDiff(
          ssr,
          resolvedJsx,
          fragmentVNode,
          ctx.$cursor$,
          ctx.$currentStyleScoped$,
          ctx.$parentComponentFrame$
        );
      }
      ssr.closeFragment();
    });
    ctx.$asyncQueue$.unshift(asyncLifecycle as any, fragmentVNode);
  } else if (jsxOutput != null) {
    // Sync inline component: descend into children, close fragment on ascend
    ssrDescend(ctx, jsxOutput as JSXChildren, true, () => ssr.closeFragment());
  } else {
    ssr.closeFragment();
  }
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
    trackSignalAndAssignHost(
      unwrappedSignal,
      signalNode as unknown as VNode,
      EffectProperty.VNODE,
      ssr
    );

  // Track the signal value. If tracking throws a Promise (async signal needing computation),
  // use retryOnPromise to await and retry. The resolved value is rendered directly (no Awaited).
  // If tracking returns a Promise (signal's literal value is a Promise), descend into it
  // so the inner diff loop creates the Awaited wrapper via ssrPromise.
  let trackedValue: any;
  let threwPromise = false;
  try {
    trackedValue = trackFn();
  } catch (e) {
    if (isPromise(e)) {
      threwPromise = true;
      // Async signal computation — retryOnPromise awaits thrown promise, retries
      trackedValue = retryOnPromise(trackFn);
    } else {
      throw e;
    }
  }

  if (threwPromise && isPromise(trackedValue)) {
    // Async signal (threw Promise during tracking): render resolved value directly
    // inside signal fragment — no Awaited wrapper.
    ctx.$asyncBreak$ = true;
    const savedBuildState = (ssr as any).ssrBuildState;
    const asyncLifecycle = (trackedValue as Promise<any>).then(async (resolvedValue) => {
      (ssr as any).ssrBuildState = savedBuildState;
      if (resolvedValue != null) {
        await ssrDiff(
          ssr,
          resolvedValue as JSXOutput,
          signalNode as unknown as VNode,
          ctx.$cursor$,
          ctx.$currentStyleScoped$,
          ctx.$parentComponentFrame$
        );
      }
      ssr.closeFragment();
    });
    ctx.$asyncQueue$.unshift(asyncLifecycle as any, signalNode as unknown as VNode);
  } else {
    // Tracked value is synchronous (possibly a literal Promise) — descend into it.
    // If it's a Promise, the inner diff loop creates an Awaited wrapper via ssrPromise.
    ssrDescend(ctx, trackedValue as JSXChildren, true, () => ssr.closeFragment());
  }
}

/** Promise: wrap in virtual node, flush stream, push to async queue. */
function ssrPromise(ctx: SsrDiffContext, promise: Promise<any>) {
  const ssr = ctx.$container$;

  const attrs: Record<string, any> = isDev ? { [DEBUG_TYPE]: VirtualType.Awaited } : EMPTY_OBJ;
  ssr.openFragment(attrs);
  const node = ssr.getOrCreateLastNode();
  ctx.$vNewNode$ = node as unknown as VNode;
  // Ensure VNode parent chain is connected for dirty propagation (async path doesn't call
  // ssrDescend which normally sets this).
  const nodeVNode = node as unknown as VNode;
  if (!nodeVNode.parent) {
    nodeVNode.parent = ctx.$vParent$;
  }

  ssr.streamHandler.flush();

  // Async break: keep fragment open, await promise, process resolved JSX inside, then close
  ctx.$asyncBreak$ = true;
  const savedBuildState = (ssr as any).ssrBuildState;
  const asyncLifecycle = promise.then(async (resolvedJsx: any) => {
    (ssr as any).ssrBuildState = savedBuildState;
    if (resolvedJsx != null) {
      await ssrDiff(
        ssr,
        resolvedJsx,
        node as unknown as VNode,
        ctx.$cursor$,
        ctx.$currentStyleScoped$,
        ctx.$parentComponentFrame$
      );
    }
    ssr.closeFragment();
  });
  ctx.$asyncQueue$.unshift(asyncLifecycle as any, node as unknown as VNode);
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
    ctx.$vNewNode$ = node as unknown as VNode;
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
  const savedBuildState = (ssr as any).ssrBuildState;
  const parentVNode = ctx.$vParent$;
  const cursor = ctx.$cursor$;
  const styleScoped = ctx.$currentStyleScoped$;
  const parentFrame = ctx.$parentComponentFrame$;
  let value: AsyncGenerator | Promise<void>;

  if (isFunction(generator)) {
    value = generator({
      async write(chunk) {
        (ssr as any).ssrBuildState = savedBuildState;
        await ssrDiff(ssr, chunk, parentVNode, cursor, styleScoped, parentFrame);
        ssr.streamHandler.flush();
      },
    });
  } else {
    value = generator;
  }

  if (isAsyncGenerator(value)) {
    // Async generator: iterate and process each yielded chunk
    const lifecycle = (async () => {
      for await (const chunk of value as AsyncGenerator) {
        (ssr as any).ssrBuildState = savedBuildState;
        await ssrDiff(ssr, chunk as JSXOutput, parentVNode, cursor, styleScoped, parentFrame);
      }
    })();
    ctx.$asyncBreak$ = true;
    ctx.$asyncQueue$.unshift(lifecycle as any, parentVNode);
  } else if (isPromise(value)) {
    // Async function with write callback: block until complete
    ctx.$asyncBreak$ = true;
    ctx.$asyncQueue$.unshift(value as any, parentVNode);
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
  const savedBuildState = (ssr as any).ssrBuildState;
  const parentVNode = ctx.$vParent$;
  const cursor = ctx.$cursor$;
  const styleScoped = ctx.$currentStyleScoped$;
  const parentFrame = ctx.$parentComponentFrame$;

  const processGenerator = async () => {
    for await (const chunk of generator) {
      (ssr as any).ssrBuildState = savedBuildState;
      await ssrDiff(ssr, chunk as JSXOutput, parentVNode, cursor, styleScoped, parentFrame);
      ssr.streamHandler.flush();
    }
  };

  ctx.$asyncBreak$ = true;
  ctx.$asyncQueue$.unshift(processGenerator() as unknown as JSXChildren, parentVNode);
}

// ============================================================================
// Utility helpers
// ============================================================================

function getSlotName(host: ISsrNode, jsx: JSXNodeInternal, ssr: SSRContainer): string {
  const constProps = jsx.constProps;
  if (constProps && typeof constProps == 'object' && 'name' in constProps) {
    const constValue = constProps.name;
    if (constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(
        constValue,
        host as unknown as VNode,
        EffectProperty.COMPONENT,
        ssr
      );
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
