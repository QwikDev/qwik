import { isDev } from '@qwik.dev/core/build';
import { queueQRL } from '../client/queue-qrl';
import { isQwikComponent } from '../shared/component.public';
import { Fragment, directGetPropsProxyProp } from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNodeInternal, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { SSRComment, SSRRaw, SSRStream, type SSRStreamChildren } from '../shared/jsx/utils.public';
import { createQRL, type QRLInternal } from '../shared/qrl/qrl-class';
import type { QRL } from '../shared/qrl/qrl.public';
import { qrlToString, type SerializationContext } from '../shared/shared-serialization';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { isAsyncGenerator } from '../shared/utils/async-generator';
import {
  convertEventNameFromJsxPropToHtmlAttr,
  getEventNameFromJsxProp,
  isPreventDefault,
} from '../shared/utils/event-names';
import { EMPTY_ARRAY } from '../shared/utils/flyweight';
import { getFileLocationFromJsx } from '../shared/utils/jsx-filename';
import {
  ELEMENT_KEY,
  FLUSH_COMMENT,
  QDefaultSlot,
  QScopedStyle,
  QSlot,
  QSlotParent,
  qwikInspectorAttr,
} from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
import { addComponentStylePrefix, isClassAttr } from '../shared/utils/scoped-styles';
import { serializeAttribute } from '../shared/utils/styles';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { EffectProperty, isSignal } from '../signal/signal';
import { trackSignalAndAssignHost } from '../use/use-core';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import type { ISsrComponentFrame, SSRContainer, SsrAttrs } from './ssr-types';
import { isQrl } from '../shared/qrl/qrl-utils';
import {
  StaticPropId,
  getPropId,
  getPropName,
  getSlotName,
  isEventProp,
  type NumericPropKey,
} from '../shared/utils/prop';

class ParentComponentData {
  constructor(
    public $scopedStyle$: string | null,
    public $componentFrame$: ISsrComponentFrame | null
  ) {}
}
type StackFn = () => ValueOrPromise<void>;
type StackValue = ValueOrPromise<
  JSXOutput | StackFn | Promise<JSXOutput> | typeof Promise | ParentComponentData | AsyncGenerator
>;

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
      if (value instanceof ParentComponentData) {
        options.currentStyleScoped = value.$scopedStyle$;
        options.parentComponentFrame = value.$componentFrame$;
        continue;
      } else if (typeof value === 'function') {
        if (value === Promise) {
          stack.push(await (stack.pop() as Promise<JSXOutput>));
          continue;
        }
        await (value as StackFn).apply(ssr);
        continue;
      }
      processJSXNode(ssr, enqueue, value as JSXOutput, {
        styleScoped: options.currentStyleScoped,
        parentComponentFrame: options.parentComponentFrame,
      });
    }
  };
  await drain();
}

function processJSXNode(
  ssr: SSRContainer,
  enqueue: (value: StackValue) => void,
  value: JSXOutput,
  options: {
    styleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
) {
  // console.log('processJSXNode', value);
  if (value === null || value === undefined) {
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
      ssr.openFragment(isDev ? [getPropId(DEBUG_TYPE), VirtualType.WrappedSignal] : EMPTY_ARRAY);
      const signalNode = ssr.getLastNode();
      enqueue(ssr.closeFragment);
      enqueue(trackSignalAndAssignHost(value, signalNode, EffectProperty.VNODE, ssr));
    } else if (isPromise(value)) {
      ssr.openFragment(isDev ? [getPropId(DEBUG_TYPE), VirtualType.Awaited] : EMPTY_ARRAY);
      enqueue(ssr.closeFragment);
      enqueue(value);
      enqueue(Promise);
      enqueue(() => ssr.commentNode(FLUSH_COMMENT));
    } else if (isAsyncGenerator(value)) {
      enqueue(async () => {
        for await (const chunk of value) {
          await _walkJSX(ssr, chunk as JSXOutput, {
            currentStyleScoped: options.styleScoped,
            parentComponentFrame: options.parentComponentFrame,
          });
          ssr.commentNode(FLUSH_COMMENT);
        }
      });
    } else {
      const jsx = value as JSXNodeInternal;
      const type = jsx.type;
      // Below, JSXChildren allows functions and regexes, but we assume the dev only uses those as appropriate.
      if (typeof type === 'string') {
        appendClassIfScopedStyleExists(jsx, options.styleScoped);
        let qwikInspectorAttrValue: string | null = null;
        if (isDev && jsx.dev && jsx.type !== 'head') {
          qwikInspectorAttrValue = getFileLocationFromJsx(jsx.dev);
          if (qInspector) {
            appendQwikInspectorAttribute(jsx, qwikInspectorAttrValue);
          }
        }

        const innerHTML = ssr.openElement(
          type,
          varPropsToSsrAttrs(
            jsx.varProps,
            jsx.constProps,
            ssr.serializationCtx,
            options.styleScoped,
            jsx.key
          ),
          constPropsToSsrAttrs(
            jsx.constProps,
            jsx.varProps,
            ssr.serializationCtx,
            options.styleScoped
          ),
          qwikInspectorAttrValue
        );
        if (innerHTML) {
          ssr.htmlNode(innerHTML);
        }

        enqueue(ssr.closeElement);

        if (type === 'head') {
          enqueue(ssr.additionalHeadNodes);
          enqueue(ssr.emitQwikLoaderAtTopIfNeeded);
        } else if (type === 'body') {
          enqueue(ssr.additionalBodyNodes);
        }

        const children = jsx.children as JSXOutput;
        children != null && enqueue(children);
      } else if (isFunction(type)) {
        if (type === Fragment) {
          let attrs = jsx.key != null ? [StaticPropId.ELEMENT_KEY, jsx.key] : EMPTY_ARRAY;
          if (isDev) {
            attrs = [getPropId(DEBUG_TYPE), VirtualType.Fragment, ...attrs]; // Add debug info.
          }
          ssr.openFragment(attrs);
          ssr.addCurrentElementFrameAsComponentChild();
          enqueue(ssr.closeFragment);
          // In theory we could get functions or regexes, but we assume all is well
          const children = jsx.children as JSXOutput;
          children != null && enqueue(children);
        } else if (type === Slot) {
          const componentFrame =
            options.parentComponentFrame || ssr.unclaimedProjectionComponentFrameQueue.shift();
          if (componentFrame) {
            const compId = componentFrame.componentNode.id || '';
            const projectionAttrs: SsrAttrs = isDev
              ? [getPropId(DEBUG_TYPE), VirtualType.Projection]
              : [];
            projectionAttrs.push(getPropId(QSlotParent), compId);
            ssr.openProjection(projectionAttrs);
            const host = componentFrame.componentNode;
            const node = ssr.getLastNode();
            const slotName = getSlotName(host, jsx, ssr);
            projectionAttrs.push(getPropId(QSlot), slotName);

            enqueue(new ParentComponentData(options.styleScoped, options.parentComponentFrame));
            enqueue(ssr.closeProjection);
            const slotDefaultChildren: JSXChildren | null = jsx.children || null;
            const slotChildren =
              componentFrame.consumeChildrenForSlot(node, slotName) || slotDefaultChildren;
            if (slotDefaultChildren && slotChildren !== slotDefaultChildren) {
              ssr.addUnclaimedProjection(componentFrame, QDefaultSlot, slotDefaultChildren);
            }
            enqueue(slotChildren as JSXOutput);
            enqueue(
              new ParentComponentData(
                componentFrame.projectionScopedStyle,
                componentFrame.projectionComponentFrame
              )
            );
          } else {
            // Even thought we are not projecting we still need to leave a marker for the slot.
            ssr.openFragment(isDev ? [getPropId(DEBUG_TYPE), VirtualType.Projection] : EMPTY_ARRAY);
            ssr.closeFragment();
          }
        } else if (type === SSRComment) {
          ssr.commentNode(directGetPropsProxyProp(jsx, 'data') || '');
        } else if (type === SSRStream) {
          ssr.commentNode(FLUSH_COMMENT);
          const generator = jsx.children as SSRStreamChildren;
          let value: AsyncGenerator | Promise<void>;
          if (isFunction(generator)) {
            value = generator({
              async write(chunk) {
                await _walkJSX(ssr, chunk as JSXOutput, {
                  currentStyleScoped: options.styleScoped,
                  parentComponentFrame: options.parentComponentFrame,
                });
                ssr.commentNode(FLUSH_COMMENT);
              },
            });
          } else {
            value = generator;
          }

          enqueue(value as StackValue);
          isPromise(value) && enqueue(Promise);
        } else if (type === SSRRaw) {
          ssr.htmlNode(directGetPropsProxyProp(jsx, 'data'));
        } else if (isQwikComponent(type)) {
          // prod: use new instance of an array for props, we always modify props for a component
          ssr.openComponent(isDev ? [getPropId(DEBUG_TYPE), VirtualType.Component] : []);
          const host = ssr.getLastNode();
          const componentFrame = ssr.getParentComponentFrame()!;
          componentFrame!.distributeChildrenIntoSlots(
            jsx.children,
            options.styleScoped,
            options.parentComponentFrame
          );

          const jsxOutput = applyQwikComponentBody(ssr, jsx, type);
          const compStyleComponentId = addComponentStylePrefix(host.getProp(QScopedStyle));
          enqueue(new ParentComponentData(options.styleScoped, options.parentComponentFrame));
          enqueue(ssr.closeComponent);
          enqueue(jsxOutput);
          isPromise(jsxOutput) && enqueue(Promise);
          enqueue(new ParentComponentData(compStyleComponentId, componentFrame));
        } else {
          const inlineComponentProps = [StaticPropId.ELEMENT_KEY, jsx.key];
          ssr.openFragment(
            isDev
              ? [getPropId(DEBUG_TYPE), VirtualType.InlineComponent, ...inlineComponentProps]
              : inlineComponentProps
          );
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

export function varPropsToSsrAttrs(
  varProps: Record<string, unknown>,
  constProps: Record<string, unknown> | null,
  serializationCtx: SerializationContext,
  styleScopedId: string | null,
  key?: string | null
): SsrAttrs | null {
  return toSsrAttrs(varProps, constProps, serializationCtx, true, styleScopedId, key);
}

export function constPropsToSsrAttrs(
  constProps: Record<string, unknown> | null,
  varProps: Record<string, unknown>,
  serializationCtx: SerializationContext,
  styleScopedId: string | null
): SsrAttrs | null {
  return toSsrAttrs(constProps, varProps, serializationCtx, false, styleScopedId);
}

export function toSsrAttrs(
  record: Record<string, unknown>,
  anotherRecord: Record<string, unknown>,
  serializationCtx: SerializationContext,
  pushMergedEventProps: boolean,
  styleScopedId: string | null,
  key?: string | null
): SsrAttrs;
export function toSsrAttrs(
  record: Record<string, unknown> | null | undefined,
  anotherRecord: Record<string, unknown> | null | undefined,
  serializationCtx: SerializationContext,
  pushMergedEventProps: boolean,
  styleScopedId: string | null,
  key?: string | null
): SsrAttrs | null;
export function toSsrAttrs(
  record: Record<string, unknown> | null | undefined,
  anotherRecord: Record<string, unknown> | null | undefined,
  serializationCtx: SerializationContext,
  pushMergedEventProps: boolean,
  styleScopedId: string | null,
  key?: string | null
): SsrAttrs | null {
  if (record == null) {
    return null;
  }
  const ssrAttrs: SsrAttrs = [];
  for (const key in record) {
    const numericKey = key as unknown as NumericPropKey;
    let value = record[numericKey];
    const nameKey = getPropName(numericKey);
    if (isEventProp(numericKey)) {
      if (anotherRecord) {
        /**
         * If we have two sources of the same event like this:
         *
         * ```tsx
         * const Counter = component$((props: { initial: number }) => {
         *  const count = useSignal(props.initial);
         *  useOnWindow(
         *    'dblclick',
         *    $(() => count.value++)
         *  );
         *  return <button window:onDblClick$={() => count.value++}>Count: {count.value}!</button>;
         * });
         * ```
         *
         * Then we can end with the const and var props with the same (doubled) event. We process
         * the const and var props separately, so:
         *
         * - For the var props we need to merge them into the one value (array)
         * - For the const props we need to just skip, because we will handle this in the var props
         */
        const anotherValue = getEventProp(anotherRecord, numericKey);
        if (anotherValue) {
          if (pushMergedEventProps) {
            // merge values from the const props with the var props
            value = getMergedEventPropValues(value, anotherValue);
          } else {
            continue;
          }
        }
      }
      const eventValue = setEvent(serializationCtx, nameKey, value);
      if (eventValue) {
        ssrAttrs.push(convertEventNameFromJsxPropToHtmlAttr(nameKey), eventValue);
      }
      continue;
    }

    if (isSignal(value)) {
      // write signal as is. We will track this signal inside `writeAttrs`
      if (isClassAttr(nameKey)) {
        // additionally append styleScopedId for class attr
        ssrAttrs.push(nameKey, [value, styleScopedId]);
      } else {
        ssrAttrs.push(nameKey, value);
      }
      continue;
    }

    if (isPreventDefault(nameKey)) {
      addPreventDefaultEventToSerializationContext(serializationCtx, nameKey);
    }

    value = serializeAttribute(nameKey, value, styleScopedId);

    ssrAttrs.push(nameKey, value as string);
  }
  if (key != null) {
    ssrAttrs.push(ELEMENT_KEY, key);
  }
  return ssrAttrs;
}

function getMergedEventPropValues(value: unknown, anotherValue: unknown) {
  let mergedValue = value;
  // merge values from the const props with the var props
  if (Array.isArray(value) && Array.isArray(anotherValue)) {
    // both values are arrays
    mergedValue = value.concat(anotherValue);
  } else if (Array.isArray(mergedValue)) {
    // only first value is array
    mergedValue.push(anotherValue);
  } else if (Array.isArray(anotherValue)) {
    // only second value is array
    mergedValue = anotherValue;
    (mergedValue as unknown[]).push(value);
  } else {
    // none of these values are array
    mergedValue = [value, anotherValue];
  }
  return mergedValue;
}

function getEventProp(record: Record<string, unknown>, numericKey: NumericPropKey): unknown | null {
  for (const prop in record) {
    if ((prop as unknown as NumericPropKey) === numericKey) {
      return record[prop];
    }
  }
  return null;
}

function setEvent(
  serializationCtx: SerializationContext,
  key: string,
  rawValue: unknown
): string | null {
  let value: string | null = null;
  const qrls = rawValue;

  const appendToValue = (valueToAppend: string) => {
    value = (value == null ? '' : value + '\n') + valueToAppend;
  };
  const getQrlString = (qrl: QRLInternal<unknown>) => {
    /**
     * If there are captures we need to schedule so everything is executed in the right order + qrls
     * are resolved.
     *
     * For internal qrls (starting with `_`) we assume that they do the right thing.
     */
    if (!qrl.$symbol$.startsWith('_') && (qrl.$captureRef$ || qrl.$capture$)) {
      qrl = createQRL(null, '_run', queueQRL, null, null, [qrl]);
    }
    return qrlToString(serializationCtx, qrl);
  };

  if (Array.isArray(qrls)) {
    for (let i = 0; i <= qrls.length; i++) {
      const qrl: unknown = qrls[i];
      if (isQrl(qrl)) {
        appendToValue(getQrlString(qrl));
        addQwikEventToSerializationContext(serializationCtx, key, qrl);
      } else if (qrl != null) {
        // nested arrays etc.
        const nestedValue = setEvent(serializationCtx, key, qrl);
        if (nestedValue) {
          appendToValue(nestedValue);
        }
      }
    }
  } else if (isQrl(qrls)) {
    value = getQrlString(qrls);
    addQwikEventToSerializationContext(serializationCtx, key, qrls);
  }

  return value;
}

function addQwikEventToSerializationContext(
  serializationCtx: SerializationContext,
  key: string,
  qrl: QRL
) {
  const eventName = getEventNameFromJsxProp(key);
  if (eventName) {
    serializationCtx.$eventNames$.add(eventName);
    serializationCtx.$eventQrls$.add(qrl);
  }
}

function addPreventDefaultEventToSerializationContext(
  serializationCtx: SerializationContext,
  key: string
) {
  // skip first 15 chars, this is length of the `preventdefault:`
  const eventName = key.substring(15);
  if (eventName) {
    serializationCtx.$eventNames$.add(eventName);
  }
}

function appendQwikInspectorAttribute(jsx: JSXNodeInternal, qwikInspectorAttrValue: string | null) {
  const qwikInspectorAttrId = getPropId(qwikInspectorAttr);
  if (qwikInspectorAttrValue && (!jsx.constProps || !(qwikInspectorAttrId in jsx.constProps))) {
    (jsx.constProps ||= {})[qwikInspectorAttrId] = qwikInspectorAttrValue;
  }
}

// append class attribute if styleScopedId exists and there is no class attribute
function appendClassIfScopedStyleExists(jsx: JSXNodeInternal, styleScoped: string | null) {
  const classAttributeExists = directGetPropsProxyProp(jsx, 'class') != null;
  if (!classAttributeExists && styleScoped) {
    if (!jsx.constProps) {
      jsx.constProps = {};
    }
    jsx.constProps[getPropId('class')] = '';
  }
}
