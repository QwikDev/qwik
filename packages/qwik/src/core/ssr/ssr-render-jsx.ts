import { isDev } from '@qwik.dev/core/build';
import { _run } from '../client/run-qrl';
import { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
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

type StackFn = () => ValueOrPromise<void>;
export type StackValue = ValueOrPromise<
  | JSXOutput
  | StackFn
  | Promise<JSXOutput>
  | typeof Promise
  | AsyncGenerator
  | typeof MaybeAsyncSignal
>;

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
  const drain = async (): Promise<void> => {
    while (stack.length) {
      try {
        const value = stack.pop();
        // Reference equality first (no prototype walk), then typeof
        if (value === MaybeAsyncSignal) {
          const trackFn = stack.pop() as () => StackValue;
          try {
            await retryOnPromise(() => stack.push(trackFn()));
          } catch (err) {
            stack.push(
              await resolveErrorBoundaryFallback(
                ssr,
                ssr.getOrCreateLastNode(),
                err,
                'async-signal'
              )
            );
          }
          continue;
        }
        if (typeof value === 'function') {
          if (value === Promise) {
            const pending = stack.pop() as Promise<JSXOutput>;
            // Route to the closest boundary, else the rejection aborts the stream.
            stack.push(await catchToErrorBoundary(ssr, ssr.getOrCreateLastNode(), () => pending));
          } else {
            const result = (value as StackFn).apply(ssr);
            if (isPromise(result)) {
              await result;
            }
          }
          continue;
        }
        processJSXNode(ssr, enqueue, value as JSXOutput, options);
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

/**
 * First error wins: a boundary whose own fallback threw has a detached `$fallback$`, so it
 * escalates.
 */
function renderErrorBoundaryFallback(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>,
  err: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render'
): ValueOrPromise<JSXOutput> {
  // A non-recoverable build/plugin error must surface, not hide in any fallback.
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
    // Boundary outside the segment already streamed: reject so the segment tears down.
    if (
      __EXPERIMENTAL__.errorBoundary &&
      isOutOfOrderSegmentContainer(ssr) &&
      errorStore.$emitFallback$
    ) {
      throw err;
    }
    markBoundaryErrored(errorStore, err, phase, ssr.$transformError$);
    if (__EXPERIMENTAL__.errorBoundary) {
      // An error absorbed inside a segment must keep `qO` delivery for a not-yet-drained host.
      if (isOutOfOrderSegmentContainer(ssr)) {
        markErrorFromDeferredSegment(errorStore);
      }
      markErrorBoundaryContentInert(ssr, boundaryNode);
    }
    return null;
  }
  // No boundary above: rethrow to abort to the error page (safety net).
  throw err;
}

/** Mark a swapped-out boundary's content inert so the dead subtree never resumes. */
function markErrorBoundaryContentInert(
  ssr: SSRContainer,
  boundaryNode: ReturnType<SSRContainer['getOrCreateLastNode']>
): void {
  // Only the boundary + ancestors can hold a live projection ref into dead content.
  const liveOwners = new Map<string, ISsrNode>();
  for (let n: ISsrNode | null = boundaryNode; n; n = n.parentComponent) {
    if (n.id) {
      liveOwners.set(n.id, n);
    }
  }
  // Runs before the fallback host renders, so children are only dead partial content.
  const children = boundaryNode.children;
  if (children) {
    for (let i = 0; i < children.length; i++) {
      markSubtreeInert(ssr, children[i], liveOwners);
    }
  }
}

function markSubtreeInert(
  ssr: SSRContainer,
  node: ISsrNode,
  liveOwners: Map<string, ISsrNode>
): void {
  node.vnodeData[0] |= VNodeDataFlag.INERT;
  // Cut the live owner's slot ref so client resume won't walk into dead content.
  const ownerId = node.getProp(QSlotParent) as string | null;
  if (ownerId) {
    const owner = liveOwners.get(ownerId);
    if (owner) {
      owner.removeProp((node.getProp(QSlot) as string | null) ?? QDefaultSlot);
    }
  }
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
      markSubtreeInert(ssr, children[i], liveOwners);
    }
  }
}

async function resolveErrorBoundaryFallback(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>,
  err: unknown,
  phase: ErrorBoundaryInfo['phase'] = 'render'
): Promise<JSXOutput> {
  const fallback = renderErrorBoundaryFallback(ssr, host, err, phase);
  return isPromise(fallback) ? await fallback : fallback;
}

/** `host` is captured so a deferred rejection routes to the node that produced it. */
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

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: StackValue) => void,
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
        enqueue(value[i]);
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
      enqueue(value);
      enqueue(Promise);
      enqueue(() => ssr.streamHandler.flush());
    } else if (isAsyncGenerator(value)) {
      enqueue(async () => {
        try {
          for await (const chunk of value) {
            await _walkJSX(ssr, chunk as JSXOutput, {
              currentStyleScoped: options.currentStyleScoped,
              parentComponentFrame: options.parentComponentFrame,
            });
            await ssr.streamHandler.flush();
          }
        } catch (err) {
          // Route to the closest boundary, else a mid-stream throw aborts SSR.
          const fallback = await resolveErrorBoundaryFallback(
            ssr,
            ssr.getOrCreateLastNode(),
            err,
            'async-generator'
          );
          await _walkJSX(ssr, fallback, {
            currentStyleScoped: options.currentStyleScoped,
            parentComponentFrame: options.parentComponentFrame,
          });
        }
      });
    } else {
      const jsx = value as JSXNodeInternal;
      const type = jsx.type;
      // Below, JSXChildren allows functions and regexes, but we assume the dev only uses those as appropriate.
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
        children != null && enqueue(children);
      } else if (isFunction(type)) {
        // `errorBoundary` reuses internal server components (the fallback host) without `suspense`.
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
          // In theory we could get functions or regexes, but we assume all is well
          const children = jsx.children as JSXOutput;
          children != null && enqueue(children);
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
            enqueue(slotChildren as JSXOutput);
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

          enqueue(value as StackValue);
          isPromise(value) && enqueue(Promise);
        } else if (type === SSRRaw) {
          ssr.htmlNode(directGetPropsProxyProp(jsx, 'data'));
        } else if (type === SSRStreamBlock) {
          ssr.streamHandler.streamBlockStart();
          enqueue(() => ssr.streamHandler.streamBlockEnd());
          enqueue(jsx.children as JSXOutput);
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

          const jsxOutput = catchToErrorBoundary(ssr, host, () =>
            applyQwikComponentBody(ssr, jsx, type)
          );
          enqueue(
            setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
          );
          enqueue(() => ssr.closeComponent());
          if (isPromise(jsxOutput)) {
            // Defer reading QScopedStyle until after the promise resolves.
            enqueue(async () => {
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
          const jsxOutput = catchToErrorBoundary(ssr, ssr.getOrCreateLastNode(), () =>
            applyInlineComponent(ssr, component && component.componentNode, type, jsx)
          );
          enqueue(jsxOutput);
          isPromise(jsxOutput) && enqueue(Promise);
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

  if (unwrappedSignal instanceof AsyncSignalImpl) {
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
