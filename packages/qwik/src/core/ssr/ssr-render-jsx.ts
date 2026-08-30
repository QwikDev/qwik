import { isDev } from '@qwik.dev/core/build';
import { _run } from '../client/run-qrl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { EffectProperty } from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { isQwikComponent } from '../shared/component.public';
import { Fragment } from '../shared/jsx/jsx-runtime';
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
import { ErrorBoundaryPhase } from '../shared/error/error-handling';
import { VNodeDataFlag } from '../../server/types';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { isAsyncGenerator } from '../shared/utils/async-generator';
import { EMPTY_OBJ } from '../shared/utils/flyweight';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import {
  ELEMENT_KEY,
  QDefaultSlot,
  QErrorContentHost,
  QScopedStyle,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
import { addComponentStylePrefix } from '../shared/utils/scoped-styles';
import type { InnerContainer } from '../shared/utils/container';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { trackSignalAndAssignHost } from '../use/use-core';
import {
  getInternalServerComponentHandler,
  isInternalServerComponent,
} from './internal-server-component';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import type { ISsrComponentFrame, ISsrNode, SSRContainer, SSRRenderJSXOptions } from './ssr-types';
import { resolveSlotName } from '../shared/utils/prop';

class MaybeAsyncSignal {}
// we need to differentiate between JSX functions and ssr container functions for error boundary
// JSX functions need to be skipped after error boundary catch an error
class InvokeJSXFunction {}

type StackFn = () => ValueOrPromise<void>;
export type StackValue = ValueOrPromise<
  | JSXOutput
  | StackFn
  | Promise<JSXOutput>
  | typeof Promise
  | AsyncGenerator
  | typeof MaybeAsyncSignal
  | typeof InvokeJSXFunction
>;

const openBoundaryContentScope = (ssr: SSRContainer, contentHost: ISsrNode): StackFn => {
  const enclosing = ssr.$errorContentHost$;
  ssr.$errorContentHost$ = contentHost;
  return () => {
    ssr.$errorContentHost$ = enclosing;
  };
};

const isInsideFailedBoundaryContent = (ssr: SSRContainer): boolean => {
  const contentHost = ssr.$errorContentHost$;
  return !!contentHost && (contentHost.vnodeData[0] & VNodeDataFlag.INERT) !== 0;
};

const markPromiseHandled = (promise: Promise<unknown>): void => {
  promise.catch(() => {});
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
    markPromiseHandled(promise);
    stack.push(promise as StackValue);
    stack.push(Promise);
  };
  const drain = async (): Promise<void> => {
    while (stack.length) {
      let phase = ErrorBoundaryPhase.Render;
      try {
        const value = stack.pop();
        // Reference equality first (no prototype walk), then typeof
        if (value === MaybeAsyncSignal) {
          const trackFn = stack.pop() as () => StackValue;
          if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
            continue;
          }
          phase = ErrorBoundaryPhase.Hook;
          await retryOnPromise(() => stack.push(trackFn()));
          continue;
        }
        if (__EXPERIMENTAL__.errorBoundary && value === InvokeJSXFunction) {
          const fnChild = stack.pop() as StackFn;
          if (isInsideFailedBoundaryContent(ssr)) {
            continue;
          }
          const result = fnChild.apply(ssr);
          if (isPromise(result)) {
            await result;
          }
          continue;
        }
        if (typeof value === 'function') {
          if (value === Promise) {
            const pending = stack.pop() as Promise<JSXOutput>;
            if (__EXPERIMENTAL__.errorBoundary && isInsideFailedBoundaryContent(ssr)) {
              continue;
            }
            stack.push(await pending);
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
      } catch (err) {
        ssr.handleError(err, ssr.getOrCreateLastNode(), phase);
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

function enqueueJSX(enqueue: (v: StackValue) => void, value: JSXOutput) {
  enqueue(value);
  if (__EXPERIMENTAL__.errorBoundary && typeof value === 'function') {
    enqueue(InvokeJSXFunction);
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
        enqueueJSX(enqueue, value[i]);
      }
    } else if (isSignal(value)) {
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
          ssr.handleError(err, ssr.getOrCreateLastNode(), ErrorBoundaryPhase.Render);
          await _walkJSX(ssr, null, freshWalkOptions());
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
          enqueue(openBoundaryContentScope(ssr, ssr.getOrCreateLastNode()));
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
        children != null && enqueueJSX(enqueue, children);
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
          children != null && enqueueJSX(enqueue, children);
        } else if (type === Slot) {
          const componentFrame = options.parentComponentFrame;
          if (componentFrame) {
            const compId = componentFrame.componentNode.id || '';
            const projectionAttrs: Record<string, string | null> = isDev
              ? { [DEBUG_TYPE]: VirtualType.Projection }
              : {};
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
            enqueueJSX(enqueue, slotChildren as JSXOutput);
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
          enqueueJSX(enqueue, jsx.children as JSXOutput);
        } else if (isQwikComponent(type)) {
          // prod: use new instance of an object for props, we always modify props for a component
          const componentAttrs: Record<string, string | null> = {};
          if (isDev) {
            componentAttrs[DEBUG_TYPE] = VirtualType.Component;
          }
          ssr.openComponent(componentAttrs);
          const host = ssr.getOrCreateLastNode();
          enqueue(
            setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
          );
          enqueue(() => ssr.closeComponent());
          const componentFrame = ssr.getParentComponentFrame()!;
          componentFrame!.distributeChildrenIntoSlots(
            jsx.children,
            options.currentStyleScoped,
            options.parentComponentFrame
          );

          const jsxOutput = applyQwikComponentBody(ssr, jsx, type);
          if (isPromise(jsxOutput)) {
            markPromiseHandled(jsxOutput);
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
          const jsxOutput = applyInlineComponent(
            ssr,
            component && component.componentNode,
            type,
            jsx
          );
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
