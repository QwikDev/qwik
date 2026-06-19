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
  QCtxAttr,
  QCursorBoundary,
  QDefaultSlot,
  QScopedStyle,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { mapArray_get, mapArray_has } from '../client/util-mapArray';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
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
import { ERROR_CONTEXT, type ErrorBoundaryStore } from '../shared/error/error-handling';
import type { ISsrComponentFrame, SSRContainer, SSRRenderJSXOptions } from './ssr-types';
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
            let fallback = renderErrorBoundaryFallback(ssr, ssr.getOrCreateLastNode(), err);
            if (isPromise(fallback)) {
              fallback = await fallback;
            }
            stack.push(fallback);
          }
          continue;
        }
        if (typeof value === 'function') {
          if (value === Promise) {
            const pending = stack.pop() as Promise<JSXOutput>;
            try {
              stack.push(await pending);
            } catch (err) {
              // Route an awaited child's rejection to the closest boundary, else it aborts the stream.
              let fallback = renderErrorBoundaryFallback(ssr, ssr.getOrCreateLastNode(), err);
              if (isPromise(fallback)) {
                fallback = await fallback;
              }
              stack.push(fallback);
            }
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

/**
 * Route an SSR render throw to the closest `<ErrorBoundary>`; rethrow (aborting to the error page)
 * when there's no boundary above.
 */
function renderErrorBoundaryFallback(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>,
  err: unknown
): ValueOrPromise<JSXOutput> {
  const errorStore = ssr.resolveContext(host, ERROR_CONTEXT);
  if (!errorStore || !errorStore.$fallback$) {
    throw err;
  }
  // A buffering boundary (inside a `<Suspense>` segment) handles the throw in its own nested render.
  if (__EXPERIMENTAL__.errorBoundary && errorStore.$checkpoint$) {
    throw err;
  }
  // Inside an out-of-order segment the boundary is outside it: propagate so the segment rejects and
  // `$emitFallback$` tears the whole boundary down, rather than rendering the fallback in this slot.
  if (__EXPERIMENTAL__.errorBoundary && isOutOfOrderSegmentContainer(ssr)) {
    throw err;
  }
  // A live streaming boundary just marks the error; its fallback host streams `fallback$` and `qO`
  // swaps it in (no in-place render, so streaming is never blocked).
  if (__EXPERIMENTAL__.errorBoundary && ssr.outOfOrderStreaming) {
    errorStore.error = err;
    return null;
  }
  errorStore.error = err;
  return errorStore.$fallback$(err) as ValueOrPromise<JSXOutput>;
}

/**
 * If `host` is itself a buffering `<ErrorBoundary>` — inside a `<Suspense>` segment — return its
 * store. Reads the host's own context (not an ancestor's) so children don't match.
 */
function getBufferingErrorBoundaryStore(
  ssr: SSRContainer,
  host: ReturnType<SSRContainer['getOrCreateLastNode']>
): ErrorBoundaryStore | null {
  if (!__EXPERIMENTAL__.errorBoundary || !isOutOfOrderSegmentContainer(ssr)) {
    return null;
  }
  const ctx = host.getProp(QCtxAttr) as Array<string | unknown> | null;
  if (!ctx || !mapArray_has(ctx, ERROR_CONTEXT.id, 0)) {
    return null;
  }
  const store = mapArray_get(ctx, ERROR_CONTEXT.id, 0) as ErrorBoundaryStore | null;
  return store && store.$fallback$ ? store : null;
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
        for await (const chunk of value) {
          await _walkJSX(ssr, chunk as JSXOutput, {
            currentStyleScoped: options.currentStyleScoped,
            parentComponentFrame: options.parentComponentFrame,
          });
          await ssr.streamHandler.flush();
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
        if (__EXPERIMENTAL__.suspense && isInternalServerComponent(type)) {
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

          let jsxOutput: ValueOrPromise<JSXOutput>;
          try {
            jsxOutput = applyQwikComponentBody(ssr, jsx, type);
          } catch (err) {
            jsxOutput = renderErrorBoundaryFallback(ssr, host, err);
          }
          const bufferingErrorStore = getBufferingErrorBoundaryStore(ssr, host);
          enqueue(
            setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
          );
          enqueue(() => ssr.closeComponent());
          if (bufferingErrorStore && !isPromise(jsxOutput)) {
            // Buffering ErrorBoundary: render the subtree in a nested pass so a throw rolls back the
            // partial output and renders the fallback in its place (a clean `boundary > fallback`).
            const content = jsxOutput as JSXOutput;
            enqueue(async () => {
              ssr.streamHandler.streamBlockStart();
              const checkpoint = (bufferingErrorStore.$checkpoint$ = ssr.checkpoint());
              const savedStyle = options.currentStyleScoped;
              const savedFrame = options.parentComponentFrame;
              try {
                await ssr.renderJSX(content, options);
              } catch (err) {
                ssr.rollback(checkpoint);
                options.currentStyleScoped = savedStyle;
                options.parentComponentFrame = savedFrame;
                bufferingErrorStore.error = err;
                await ssr.renderJSX(bufferingErrorStore.$fallback$!(err) as JSXOutput, options);
              } finally {
                bufferingErrorStore.$checkpoint$ = undefined;
                await ssr.streamHandler.streamBlockEnd();
              }
            });
            const compStyleComponentId = addComponentStylePrefix(host.getProp(QScopedStyle));
            enqueue(setParentOptions(options, compStyleComponentId, componentFrame));
          } else if (isPromise(jsxOutput)) {
            // Defer reading QScopedStyle until after the promise resolves
            enqueue(async () => {
              let resolvedOutput: JSXOutput;
              try {
                resolvedOutput = await jsxOutput;
              } catch (err) {
                const fallback = renderErrorBoundaryFallback(ssr, host, err);
                resolvedOutput = isPromise(fallback) ? await fallback : fallback;
              }
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
          let jsxOutput: ValueOrPromise<JSXOutput>;
          try {
            jsxOutput = applyInlineComponent(ssr, component && component.componentNode, type, jsx);
          } catch (err) {
            jsxOutput = renderErrorBoundaryFallback(ssr, ssr.getOrCreateLastNode(), err);
          }
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
