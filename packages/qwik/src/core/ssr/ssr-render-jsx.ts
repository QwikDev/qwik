import { isDev } from '@qwik.dev/core/build';
import { _run } from '../client/run-qrl';
import { ComputedSignalImpl } from '../reactive-primitives/impl/computed-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { AsyncSignalFlags, EffectProperty } from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { isQwikComponent } from '../shared/component.public';
import { Fragment, type Props } from '../shared/jsx/jsx-runtime';
import { directGetPropsProxyProp } from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import { JSXNodeFlags, type JSXNodeInternal, type JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import {
  SSRComment,
  SSRRaw,
  SSRStream,
  SSRStreamBlock,
  type SSRStreamChildren,
} from '../shared/jsx/utils.public';
import { type SerializationContext } from '../shared/serdes/index';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { isAsyncGenerator } from '../shared/utils/async-generator';
import { EMPTY_OBJ } from '../shared/utils/flyweight';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import {
  ELEMENT_KEY,
  ELEMENT_SEQ,
  QCtxAttr,
  QCursorBoundary,
  QDefaultSlot,
  QErrorContentHost,
  QScopedStyle,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { mapArray_has } from '../client/util-mapArray';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { isTask } from '../use/use-task';
import { VNodeDataFlag } from '../../server/types';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { qDev, qInspector } from '../shared/utils/qdev';
import { addComponentStylePrefix } from '../shared/utils/scoped-styles';
import { isOutOfOrderSegmentContainer, type InnerContainer } from '../shared/utils/container';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { trackSignalAndAssignHost } from '../use/use-core';
import type { CursorBoundary } from '../use/use-cursor-boundary';
import {
  getInternalServerComponentHandler,
  isInternalServerComponent,
} from './internal-server-component';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import {
  ERROR_CONTEXT,
  isRecoverable,
  markBoundaryErrored,
  markErrorFromDeferredSegment,
  type ErrorBoundaryStore,
} from '../shared/error/error-handling';
import type { ErrorBoundaryInfo } from '../shared/error/error-boundary';
import type { ISsrComponentFrame, ISsrNode, SSRContainer, SSRRenderJSXOptions } from './ssr-types';
import { resolveSlotName } from '../shared/utils/prop';

class MaybeAsyncSignal {}
class FunctionChild {}

const openBoundaryContentScopes = /*#__PURE__*/ new WeakMap<SSRContainer, ISsrNode[]>();

const pushBoundaryContentScope = (ssr: SSRContainer, contentHost: ISsrNode): StackFn => {
  let scopes = openBoundaryContentScopes.get(ssr);
  if (!scopes) {
    openBoundaryContentScopes.set(ssr, (scopes = []));
  }
  scopes.push(contentHost);
  return () => {
    scopes.pop();
  };
};

const isInsideFailedBoundaryContent = (ssr: SSRContainer): boolean => {
  const scopes = openBoundaryContentScopes.get(ssr);
  if (!scopes || scopes.length === 0) {
    return false;
  }
  for (let i = scopes.length - 1; i >= 0; i--) {
    if (scopes[i].vnodeData[0] & VNodeDataFlag.INERT) {
      return true;
    }
  }
  return false;
};

type StackFn = () => ValueOrPromise<void>;
export type StackValue = ValueOrPromise<
  | JSXOutput
  | StackFn
  | Promise<JSXOutput>
  | typeof Promise
  | AsyncGenerator
  | typeof MaybeAsyncSignal
  | typeof FunctionChild
>;

const markPromiseHandled = (
  ssr: SSRContainer,
  promise: Promise<unknown>,
  host: ISsrNode | null = null
): void => {
  promise.catch((reason) => {
    try {
      ssr.handleError(reason, host);
    } catch {
      // Original promise remains awaited later.
    }
  });
};

function setParentOptions(
  mutable: { currentStyleScoped: string | null; parentComponentFrame: ISsrComponentFrame | null },
  styleScoped: string | null,
  parentComponentFrame: ISsrComponentFrame | null
): StackFn {
  return () => {
    mutable.currentStyleScoped = styleScoped;
    mutable.parentComponentFrame = parentComponentFrame;
  };
}

/** @internal */
export async function _walkJSX(
  ssr: SSRContainer,
  value: JSXOutput,
  options: SSRRenderJSXOptions
): Promise<void> {
  const stack: StackValue[] = [value];
  const enqueue = (value: StackValue) => stack.push(value);
  const enqueuePromise = (promise: Promise<unknown>) => {
    markPromiseHandled(ssr, promise);
    stack.push(promise as StackValue);
    stack.push(Promise);
  };
  const drain = async (): Promise<void> => {
    while (stack.length) {
      try {
        const value = stack.pop();
        // Reference equality first (no prototype walk), then typeof
        if (value === MaybeAsyncSignal) {
          const trackFn = stack.pop() as () => StackValue;
          if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
            continue;
          }
          try {
            await retryOnPromise(() => stack.push(trackFn()));
          } catch (err) {
            renderErrorBoundaryFallback(ssr, ssr.getOrCreateLastNode(), err, 'async-signal');
          }
          continue;
        }
        if (__EXPERIMENTAL__.errorBoundary && value === FunctionChild) {
          const fnChild = stack.pop() as StackFn;
          if (isInsideFailedBoundaryContent(ssr)) {
            continue;
          }
          try {
            const result = fnChild.apply(ssr);
            if (isPromise(result)) {
              await result;
            }
          } catch (err) {
            renderErrorBoundaryFallback(ssr, ssr.getOrCreateLastNode(), err);
          }
          continue;
        }
        if (typeof value === 'function') {
          if (value === Promise) {
            const pending = stack.pop() as Promise<JSXOutput>;
            if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
              continue;
            }
            stack.push(
              __EXPERIMENTAL__.errorBoundary
                ? await catchToErrorBoundary(ssr, ssr.getOrCreateLastNode(), () => pending)
                : await pending
            );
          } else {
            const result = (value as StackFn).apply(ssr);
            if (isPromise(result)) {
              await result;
            }
          }
          continue;
        }
        if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
          if (isPromise(value)) {
            value.catch(() => {});
          }
          continue;
        }
        processJSXNode(ssr, enqueue, enqueuePromise, value as JSXOutput, options);
      } finally {
        const pendingFlush = ssr.streamHandler.waitForPendingFlush();
        if (isPromise(pendingFlush)) {
          await pendingFlush;
        }
      }
    }
  };
  await drain();
}

function findErrorBoundaryNode(host: ISsrNode | null): ISsrNode | null {
  for (let node = host; node; node = node.parentComponent) {
    const ctx = node.getProp(QCtxAttr) as Array<string | unknown> | null;
    if (ctx != null && mapArray_has(ctx, ERROR_CONTEXT.id, 0)) {
      return node;
    }
  }
  return null;
}

function renderErrorBoundaryFallback(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>,
  err: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render'
): JSXOutput {
  if (qDev && !isRecoverable(err)) {
    throw err;
  }
  for (
    let boundaryNode = findErrorBoundaryNode(host);
    boundaryNode;
    boundaryNode = findErrorBoundaryNode(boundaryNode.parentComponent)
  ) {
    const errorStore = ssr.resolveContext(boundaryNode, ERROR_CONTEXT) as
      | ErrorBoundaryStore
      | undefined;
    if (!errorStore || !errorStore.$fallback$) {
      continue;
    }
    if (
      __EXPERIMENTAL__.errorBoundary &&
      isOutOfOrderSegmentContainer(ssr) &&
      errorStore.$emitFallback$
    ) {
      throw err;
    }
    markBoundaryErrored(errorStore, err, phase);
    if (__EXPERIMENTAL__.errorBoundary) {
      if (isOutOfOrderSegmentContainer(ssr)) {
        markErrorFromDeferredSegment(errorStore);
      }
      markErrorBoundaryContentInert(ssr, boundaryNode, errorStore);
    }
    return null;
  }
  throw err;
}

function markErrorBoundaryContentInert(
  ssr: SSRContainer,
  boundaryNode: ReturnType<SSRContainer['getOrCreateLastNode']>,
  errorStore: ErrorBoundaryStore
): void {
  const liveOwners = new Map<string, { node: ISsrNode; depth: number }>();
  let depth = 0;
  for (let n: ISsrNode | null = boundaryNode; n; n = n.parentComponent) {
    if (n.id) {
      liveOwners.set(n.id, { node: n, depth: depth++ });
    }
  }
  const topmostSevered = { node: null as ISsrNode | null, depth: -1 };
  const children = boundaryNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markSubtreeInert(ssr, children[i], liveOwners, topmostSevered);
    }
  }
  // Reset resolves an author to re-render, and the walk may skip several ancestors, so every
  // ancestor of an errored boundary must stay resumable. A severed ancestor means the children
  // crossed that ancestor's slot: record its author for the client walk, which cannot see past
  // the cut.
  for (let n = boundaryNode.parentComponent; n; n = n.parentComponent) {
    ssr.$retainForResume$(n);
  }
  if (topmostSevered.node && topmostSevered.node !== boundaryNode) {
    const author = topmostSevered.node.parentComponent;
    if (author && author.id) {
      errorStore.authorId = author.id;
    }
  }
}

function markSubtreeInert(
  ssr: SSRContainer,
  node: ISsrNode,
  liveOwners: Map<string, { node: ISsrNode; depth: number }>,
  topmostSevered: { node: ISsrNode | null; depth: number }
): void {
  node.vnodeData[0] |= VNodeDataFlag.INERT;
  const ownerId = node.getProp(QSlotParent) as string | null;
  if (ownerId) {
    const owner = liveOwners.get(ownerId);
    if (owner) {
      owner.node.removeProp((node.getProp(QSlot) as string | null) ?? QDefaultSlot);
      if (owner.depth > topmostSevered.depth) {
        topmostSevered.node = owner.node;
        topmostSevered.depth = owner.depth;
      }
    }
  }
  // Element consumers keep materializing when inert, so their bindings would keep patching hidden
  // DOM; virtual ones can't materialize and would leave producers pointing at a dead node.
  clearAllEffects(ssr, node);
  const seq = node.getProp(ELEMENT_SEQ) as unknown[] | null;
  if (seq) {
    for (let i = 0; i < seq.length; i++) {
      const item = seq[i];
      if (isTask(item)) {
        clearAllEffects(ssr, item);
      }
    }
  }
  const children = node.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markSubtreeInert(ssr, children[i], liveOwners, topmostSevered);
    }
  }
}

function catchToErrorBoundary(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>,
  produce: () => ValueOrPromise<JSXOutput>,
  phase: ErrorBoundaryInfo['phase'] = 'render'
): ValueOrPromise<JSXOutput> {
  try {
    const out = produce();
    return isPromise(out)
      ? out.catch((err) => renderErrorBoundaryFallback(ssr, host, err, phase))
      : out;
  } catch (err) {
    return renderErrorBoundaryFallback(ssr, host, err, phase);
  }
}

function enqueueChild(enqueue: (value: StackValue) => void, child: JSXOutput) {
  if (__EXPERIMENTAL__.errorBoundary && typeof child === 'function') {
    enqueue(child as StackValue);
    enqueue(FunctionChild);
  } else {
    enqueue(child);
  }
}

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: StackValue) => void,
  enqueuePromise: (promise: Promise<unknown>) => void,
  value: JSXOutput,
  options: SSRRenderJSXOptions
) {
  // console.log('processJSXNode', value);
  if (value == null) {
    ssr.textNode('');
  } else if (typeof value === 'boolean') {
    ssr.textNode('');
  } else if (typeof value === 'number') {
    ssr.textNode(String(value));
  } else if (typeof value === 'string') {
    ssr.textNode(value);
  } else if (typeof value === 'object') {
    if (Array.isArray(value)) {
      for (let i = value.length - 1; i >= 0; i--) {
        enqueueChild(enqueue, value[i]);
      }
    } else if (isSignal(value)) {
      maybeAddPollingAsyncSignalToEagerResume(ssr.serializationCtx, value);
      ssr.openFragment(isDev ? { [DEBUG_TYPE]: VirtualType.WrappedSignal } : EMPTY_OBJ);
      const signalNode = ssr.getOrCreateLastNode();
      const unwrappedSignal = value instanceof WrappedSignalImpl ? value.$unwrapIfSignal$() : value;
      enqueue(ssr.closeFragment);
      enqueue(() =>
        trackSignalAndAssignHost(unwrappedSignal, signalNode, EffectProperty.VNODE, ssr)
      );
      enqueue(MaybeAsyncSignal);
    } else if (isPromise(value)) {
      ssr.openFragment(isDev ? { [DEBUG_TYPE]: VirtualType.Awaited } : EMPTY_OBJ);
      enqueue(ssr.closeFragment);
      enqueuePromise(value);
      enqueue(() => ssr.streamHandler.flush());
    } else if (isAsyncGenerator(value)) {
      enqueue(async () => {
        if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
          return;
        }
        const freshWalkOptions = () => ({
          currentStyleScoped: options.currentStyleScoped,
          parentComponentFrame: options.parentComponentFrame,
        });
        try {
          for await (const chunk of value) {
            await _walkJSX(ssr, chunk as JSXOutput, freshWalkOptions());
            await ssr.streamHandler.flush();
          }
        } catch (err) {
          const fallback = renderErrorBoundaryFallback(
            ssr,
            ssr.getOrCreateLastNode(),
            err,
            'async-generator'
          );
          await _walkJSX(ssr, fallback, freshWalkOptions());
        }
      });
    } else {
      const jsx = value as JSXNodeInternal;
      const type = jsx.type;
      if (typeof type === 'string') {
        appendClassIfScopedStyleExists(jsx, options.currentStyleScoped);
        let qwikInspectorAttrValue: string | null = null;
        if (isDev && jsx.dev && jsx.type !== 'head') {
          qwikInspectorAttrValue = getFileLocationFromJsx(jsx.dev);
          if (qInspector) {
            appendQwikInspectorAttribute(jsx, qwikInspectorAttrValue);
          }
        }

        const innerHTML = ssr.openElement(
          type,
          jsx.key,
          jsx.varProps,
          jsx.constProps,
          options.currentStyleScoped,
          qwikInspectorAttrValue,
          !!(jsx.flags & JSXNodeFlags.HasCapturedProps)
        );
        if (innerHTML) {
          ssr.htmlNode(innerHTML);
        }

        if (__EXPERIMENTAL__.errorBoundary && directGetPropsProxyProp(jsx, QErrorContentHost)) {
          enqueue(pushBoundaryContentScope(ssr, ssr.getOrCreateLastNode()));
        }
        enqueue(ssr.closeElement);

        if (type === 'head') {
          ssr.emitQwikLoaderAtTopIfNeeded();
          ssr.emitPreloaderPre();
          enqueue(ssr.additionalHeadNodes);
        } else if (type === 'body') {
          enqueue(ssr.additionalBodyNodes);
        } else {
          const innerSSR = ssr as SSRContainer & InnerContainer;
          if (!ssr.isHtml && !innerSSR._didAddQwikLoader && !ssr.$noScriptHere$) {
            ssr.emitQwikLoaderAtTopIfNeeded();
            ssr.emitPreloaderPre();
            innerSSR._didAddQwikLoader = true;
          }
        }

        const children = jsx.children as JSXOutput;
        children != null && enqueueChild(enqueue, children);
      } else if (isFunction(type)) {
        if (
          (__EXPERIMENTAL__.suspense || __EXPERIMENTAL__.errorBoundary) &&
          isInternalServerComponent(type)
        ) {
          enqueue(() => getInternalServerComponentHandler(type)(ssr, jsx, options, enqueue));
          return;
        } else if (type === Fragment) {
          const attrs: Record<string, string | null> =
            jsx.key != null ? { [ELEMENT_KEY]: jsx.key } : {};
          if (isDev) {
            attrs[DEBUG_TYPE] = VirtualType.Fragment; // Add debug info.
          }
          ssr.openFragment(attrs);
          enqueue(ssr.closeFragment);
          const children = jsx.children as JSXOutput;
          children != null && enqueueChild(enqueue, children);
        } else if (type === Slot) {
          const componentFrame = options.parentComponentFrame;
          if (componentFrame) {
            const compId = componentFrame.componentNode.id || '';
            const projectionAttrs: Props = isDev ? { [DEBUG_TYPE]: VirtualType.Projection } : {};
            const cursorBoundary = directGetPropsProxyProp<CursorBoundary | null, any>(
              jsx,
              QCursorBoundary
            );
            if (cursorBoundary) {
              projectionAttrs[QCursorBoundary] = cursorBoundary;
            }
            projectionAttrs[QSlotParent] = compId;
            ssr.openProjection(projectionAttrs);
            const host = componentFrame.componentNode;
            const node = ssr.getOrCreateLastNode();
            const slotName = resolveSlotName(host, jsx, ssr);
            projectionAttrs[QSlot] = slotName;

            enqueue(
              setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
            );
            enqueue(ssr.closeProjection);
            const slotDefaultChildren: JSXChildren | null = jsx.children || null;
            const slotChildren =
              componentFrame.consumeChildrenForSlot(node, slotName) || slotDefaultChildren;
            if (slotDefaultChildren && slotChildren !== slotDefaultChildren) {
              ssr.addUnclaimedProjection(componentFrame, QDefaultSlot, slotDefaultChildren);
            }
            enqueueChild(enqueue, slotChildren as JSXOutput);
            enqueue(
              setParentOptions(
                options,
                componentFrame.projectionScopedStyle,
                componentFrame.projectionComponentFrame
              )
            );
          } else {
            // Even thought we are not projecting we still need to leave a marker for the slot.
            let projectionAttrs = EMPTY_OBJ;
            if (isDev) {
              projectionAttrs = { [DEBUG_TYPE]: VirtualType.Projection };
            }
            ssr.openFragment(projectionAttrs);
            ssr.closeFragment();
          }
        } else if (type === SSRComment) {
          ssr.commentNode(directGetPropsProxyProp(jsx, 'data') || '');
        } else if (type === SSRStream) {
          ssr.streamHandler.flush();
          const generator = jsx.children as SSRStreamChildren;
          let value: AsyncGenerator | Promise<void>;
          if (isFunction(generator)) {
            value = generator({
              async write(chunk) {
                await _walkJSX(ssr, chunk, {
                  currentStyleScoped: options.currentStyleScoped,
                  parentComponentFrame: options.parentComponentFrame,
                });
                await ssr.streamHandler.flush();
              },
            });
          } else {
            value = generator;
          }

          if (isPromise(value)) {
            enqueuePromise(value);
          } else {
            enqueue(value as StackValue);
          }
        } else if (type === SSRRaw) {
          ssr.htmlNode(directGetPropsProxyProp(jsx, 'data'));
        } else if (type === SSRStreamBlock) {
          ssr.streamHandler.streamBlockStart();
          enqueue(() => ssr.streamHandler.streamBlockEnd());
          enqueueChild(enqueue, jsx.children as JSXOutput);
        } else if (isQwikComponent(type)) {
          // prod: use new instance of an object for props, we always modify props for a component
          const componentAttrs: Record<string, string | null> = {};
          if (isDev) {
            componentAttrs[DEBUG_TYPE] = VirtualType.Component;
          }
          ssr.openComponent(componentAttrs);
          const host = ssr.getOrCreateLastNode();
          const componentFrame = ssr.getParentComponentFrame()!;
          componentFrame!.distributeChildrenIntoSlots(
            jsx.children,
            options.currentStyleScoped,
            options.parentComponentFrame
          );

          const jsxOutput = __EXPERIMENTAL__.errorBoundary
            ? catchToErrorBoundary(ssr, host, () => applyQwikComponentBody(ssr, jsx, type))
            : applyQwikComponentBody(ssr, jsx, type);
          enqueue(
            setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
          );
          enqueue(() => ssr.closeComponent());
          if (isPromise(jsxOutput)) {
            markPromiseHandled(ssr, jsxOutput, host);
            // Defer reading QScopedStyle until after the promise resolves
            enqueue(async () => {
              await ssr.streamHandler.flush();
              const resolvedOutput = await jsxOutput;
              const compStyleComponentId = addComponentStylePrefix(host.getProp(QScopedStyle));

              enqueue(resolvedOutput);
              enqueue(setParentOptions(options, compStyleComponentId, componentFrame));
            });
          } else {
            enqueue(jsxOutput);
            const compStyleComponentId = addComponentStylePrefix(host.getProp(QScopedStyle));
            enqueue(setParentOptions(options, compStyleComponentId, componentFrame));
          }
        } else {
          const inlineComponentProps: Record<string, string | null> = { [ELEMENT_KEY]: jsx.key };
          if (isDev) {
            inlineComponentProps[DEBUG_TYPE] = VirtualType.InlineComponent;
          }
          ssr.openFragment(inlineComponentProps);
          enqueue(ssr.closeFragment);
          const component = ssr.getParentComponentFrame();
          const jsxOutput = __EXPERIMENTAL__.errorBoundary
            ? catchToErrorBoundary(ssr, ssr.getOrCreateLastNode(), () =>
                applyInlineComponent(ssr, component && component.componentNode, type, jsx)
              )
            : applyInlineComponent(ssr, component && component.componentNode, type, jsx);
          if (isPromise(jsxOutput)) {
            enqueuePromise(jsxOutput);
          } else {
            enqueue(jsxOutput);
          }
        }
      }
    }
  }
}

function maybeAddPollingAsyncSignalToEagerResume(
  serializationCtx: SerializationContext,
  signal: unknown
) {
  // Unwrap if it's a WrappedSignalImpl
  const unwrappedSignal = signal instanceof WrappedSignalImpl ? signal.$unwrapIfSignal$() : signal;

  if (unwrappedSignal instanceof ComputedSignalImpl) {
    const expires = unwrappedSignal.$expires$;
    // Don't check for $effects$ here - effects are added later during tracking.
    // The AsyncSignal's polling mechanism will check for effects before scheduling.
    // Only eager-resume for polling signals, not stale-only ones.
    if (expires && !(unwrappedSignal.$flags$ & AsyncSignalFlags.NO_POLL)) {
      serializationCtx.$addRoot$(unwrappedSignal);
      serializationCtx.$eagerResume$.add(unwrappedSignal);
    }
  }
}

function appendQwikInspectorAttribute(jsx: JSXNodeInternal, qwikInspectorAttrValue: string | null) {
  if (qwikInspectorAttrValue && (!jsx.constProps || !(qwikInspectorAttr in jsx.constProps))) {
    (jsx.constProps ||= {})[qwikInspectorAttr] = qwikInspectorAttrValue;
  }
}

// append class attribute if styleScopedId exists and there is no class attribute
function appendClassIfScopedStyleExists(jsx: JSXNodeInternal, styleScoped: string | null) {
  const classAttributeExists = directGetPropsProxyProp(jsx, 'class') != null;
  if (!classAttributeExists && styleScoped) {
    if (!jsx.constProps) {
      jsx.constProps = {};
    }
    jsx.constProps['class'] = '';
  }
}
