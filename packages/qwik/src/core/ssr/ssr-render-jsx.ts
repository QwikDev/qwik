import { isDev } from '@qwik.dev/core/build';
import { _run } from '../client/run-qrl';
import { AsyncSignalImpl } from '../reactive-primitives/impl/async-signal-impl';
import { WrappedSignalImpl } from '../reactive-primitives/impl/wrapped-signal-impl';
import { EffectProperty } from '../reactive-primitives/types';
import { isSignal } from '../reactive-primitives/utils';
import { isQwikComponent } from '../shared/component.public';
import { Fragment } from '../shared/jsx/jsx-runtime';
import { directGetPropsProxyProp } from '../shared/jsx/props-proxy';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
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
  QDefaultSlot,
  QScopedStyle,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { isPromise, retryOnPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
import { addComponentStylePrefix } from '../shared/utils/scoped-styles';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { trackSignalAndAssignHost } from '../use/use-core';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import type { ISsrComponentFrame, ISsrNode, SSRContainer } from './ssr-types';

class MaybeAsyncSignal {}

type StackFn = () => ValueOrPromise<void>;
type StackValue = ValueOrPromise<
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
  options: {
    currentStyleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
): Promise<void> {
  const stack: StackValue[] = [value];
  const enqueue = (value: StackValue) => stack.push(value);
  const drain = async (): Promise<void> => {
    while (stack.length) {
      const value = stack.pop();
      // Reference equality first (no prototype walk), then typeof
      if (value === MaybeAsyncSignal) {
        const trackFn = stack.pop() as () => StackValue;
        await retryOnPromise(() => stack.push(trackFn()));
        continue;
      }
      if (typeof value === 'function') {
        if (value === Promise) {
          stack.push(await (stack.pop() as Promise<JSXOutput>));
        } else {
          await (value as StackFn).apply(ssr);
        }
        continue;
      }
      processJSXNode(ssr, enqueue, value as JSXOutput, options);
    }
  };
  await drain();
}

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: StackValue) => void,
  value: JSXOutput,
  options: { currentStyleScoped: string | null; parentComponentFrame: ISsrComponentFrame | null }
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
      enqueue(() => ssr.flushControl.flush());
    } else if (isAsyncGenerator(value)) {
      enqueue(async () => {
        for await (const chunk of value) {
          await _walkJSX(ssr, chunk as JSXOutput, {
            currentStyleScoped: options.currentStyleScoped,
            parentComponentFrame: options.parentComponentFrame,
          });
          ssr.flushControl.flush();
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
          qwikInspectorAttrValue
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
        } else if (!ssr.isHtml && !(ssr as any)._didAddQwikLoader) {
          ssr.emitQwikLoaderAtTopIfNeeded();
          ssr.emitPreloaderPre();
          (ssr as any)._didAddQwikLoader = true;
        }

        const children = jsx.children as JSXOutput;
        children != null && enqueue(children);
      } else if (isFunction(type)) {
        if (type === Fragment) {
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
            const projectionAttrs: Record<string, string | null> = isDev
              ? { [DEBUG_TYPE]: VirtualType.Projection }
              : {};
            projectionAttrs[QSlotParent] = compId;
            ssr.openProjection(projectionAttrs);
            const host = componentFrame.componentNode;
            const node = ssr.getOrCreateLastNode();
            const slotName = getSlotName(host, jsx, ssr);
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
          ssr.flushControl.flush();
          const generator = jsx.children as SSRStreamChildren;
          let value: AsyncGenerator | Promise<void>;
          if (isFunction(generator)) {
            value = generator({
              async write(chunk) {
                await _walkJSX(ssr, chunk, {
                  currentStyleScoped: options.currentStyleScoped,
                  parentComponentFrame: options.parentComponentFrame,
                });
                ssr.flushControl.flush();
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
          ssr.flushControl.streamBlockStart();
          enqueue(() => ssr.flushControl.streamBlockEnd());
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

          const jsxOutput = applyQwikComponentBody(ssr, jsx, type);
          enqueue(
            setParentOptions(options, options.currentStyleScoped, options.parentComponentFrame)
          );
          enqueue(ssr.closeComponent);
          if (isPromise(jsxOutput)) {
            // Defer reading QScopedStyle until after the promise resolves
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
          const component = ssr.getComponentFrame(0);
          const jsxOutput = applyInlineComponent(
            ssr,
            component && component.componentNode,
            type,
            jsx
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
    const interval = unwrappedSignal.$interval$;
    // Don't check for $effects$ here - effects are added later during tracking.
    // The AsyncSignal's polling mechanism will check for effects before scheduling.
    if (interval > 0) {
      serializationCtx.$addRoot$(unwrappedSignal);
      serializationCtx.$eagerResume$.add(unwrappedSignal);
    }
  }
}

function getSlotName(host: ISsrNode, jsx: JSXNodeInternal, ssr: SSRContainer): string {
  const constProps = jsx.constProps;
  if (constProps && typeof constProps == 'object' && 'name' in constProps) {
    const constValue = constProps.name;
    if (constValue instanceof WrappedSignalImpl) {
      return trackSignalAndAssignHost(constValue, host, EffectProperty.COMPONENT, ssr);
    }
  }
  return directGetPropsProxyProp(jsx, 'name') || QDefaultSlot;
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
