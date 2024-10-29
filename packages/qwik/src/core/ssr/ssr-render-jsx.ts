import { isDev } from '@qwik.dev/core/build';
import { isQwikComponent } from '../shared/component.public';
import { Fragment, directGetPropsProxyProp } from '../shared/jsx/jsx-runtime';
import { Slot } from '../shared/jsx/slot.public';
import type { JSXNode, JSXOutput } from '../shared/jsx/types/jsx-node';
import type { JSXChildren } from '../shared/jsx/types/jsx-qwik-attributes';
import { SSRComment, SSRRaw, SSRStream, type SSRStreamChildren } from '../shared/jsx/utils.public';
import { isQrl } from '../shared/qrl/qrl-utils';
import type { QRL } from '../shared/qrl/qrl.public';
import { qrlToString, type SerializationContext } from '../shared/shared-serialization';
import { DEBUG_TYPE, VirtualType } from '../shared/types';
import { isAsyncGenerator } from '../shared/utils/async-generator';
import {
  convertEventNameFromJsxPropToHtmlAttr,
  getEventNameFromJsxProp,
  isJsxPropertyAnEventName,
  isPreventDefault,
} from '../shared/utils/event-names';
import { EMPTY_ARRAY } from '../shared/utils/flyweight';
import { throwErrorAndStop } from '../shared/utils/log';
import {
  ELEMENT_KEY,
  FLUSH_COMMENT,
  QDefaultSlot,
  QScopedStyle,
  QSlot,
} from '../shared/utils/markers';
import { isPromise } from '../shared/utils/promises';
import { qInspector } from '../shared/utils/qdev';
import { addComponentStylePrefix, isClassAttr } from '../shared/utils/scoped-styles';
import { serializeAttribute } from '../shared/utils/styles';
import { isFunction, type ValueOrPromise } from '../shared/utils/types';
import { EffectProperty, WrappedSignal, isSignal, type Signal } from '../signal/signal';
import { trackSignal } from '../use/use-core';
import { applyInlineComponent, applyQwikComponentBody } from './ssr-render-component';
import type { ISsrComponentFrame, ISsrNode, SSRContainer, SsrAttrs } from './ssr-types';

// Allow the optimizer to process this $
// @ts-ignore -- this gets renamed to qwik during build
import { $ } from '@qwik.dev/core-external';

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
export function _walkJSX(
  ssr: SSRContainer,
  value: JSXOutput,
  options: {
    allowPromises: true;
    currentStyleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
): ValueOrPromise<void>;
/** @internal */
export function _walkJSX(
  ssr: SSRContainer,
  value: JSXOutput,
  options: {
    allowPromises: false;
    currentStyleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
): false;
/** @internal */
export function _walkJSX(
  ssr: SSRContainer,
  value: JSXOutput,
  options: {
    allowPromises: boolean;
    currentStyleScoped: string | null;
    parentComponentFrame: ISsrComponentFrame | null;
  }
): ValueOrPromise<void> | false {
  const stack: StackValue[] = [value];
  let resolveDrain: () => void;
  let rejectDrain: (reason: any) => void;
  const drained =
    options.allowPromises &&
    new Promise<void>((res, rej) => {
      resolveDrain = res;
      rejectDrain = rej;
    });
  const enqueue = (value: StackValue) => stack.push(value);
  const resolveValue = (value: JSXOutput) => {
    stack.push(value);
    drain();
  };
  const drain = (): void => {
    while (stack.length) {
      const value = stack.pop();
      if (value instanceof ParentComponentData) {
        options.currentStyleScoped = value.$scopedStyle$;
        options.parentComponentFrame = value.$componentFrame$;
        continue;
      } else if (typeof value === 'function') {
        if (value === Promise) {
          if (!options.allowPromises) {
            return throwErrorAndStop('Promises not expected here.');
          }
          (stack.pop() as Promise<JSXOutput>).then(resolveValue, rejectDrain);
          return;
        }
        const waitOn = (value as StackFn).apply(ssr);
        if (waitOn) {
          if (!options.allowPromises) {
            return throwErrorAndStop('Promises not expected here.');
          }
          waitOn.then(drain, rejectDrain);
          return;
        }
        continue;
      }
      processJSXNode(ssr, enqueue, value as JSXOutput, {
        styleScoped: options.currentStyleScoped,
        parentComponentFrame: options.parentComponentFrame,
      });
    }
    if (stack.length === 0 && options.allowPromises) {
      resolveDrain();
    }
  };
  drain();
  return drained;
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
      ssr.openFragment(isDev ? [DEBUG_TYPE, VirtualType.WrappedSignal] : EMPTY_ARRAY);
      const signalNode = ssr.getLastNode();
      enqueue(ssr.closeFragment);
      enqueue(trackSignal(() => value.value as any, signalNode, EffectProperty.VNODE, ssr));
    } else if (isPromise(value)) {
      ssr.openFragment(isDev ? [DEBUG_TYPE, VirtualType.Awaited] : EMPTY_ARRAY);
      enqueue(ssr.closeFragment);
      enqueue(value);
      enqueue(Promise);
      enqueue(() => ssr.commentNode(FLUSH_COMMENT));
    } else if (isAsyncGenerator(value)) {
      enqueue(async () => {
        for await (const chunk of value) {
          await _walkJSX(ssr, chunk as JSXOutput, {
            allowPromises: true,
            currentStyleScoped: options.styleScoped,
            parentComponentFrame: options.parentComponentFrame,
          });
          ssr.commentNode(FLUSH_COMMENT);
        }
      });
    } else {
      const jsx = value as JSXNode;
      const type = jsx.type;
      // Below, JSXChildren allows functions and regexes, but we assume the dev only uses those as appropriate.
      if (typeof type === 'string') {
        appendClassIfScopedStyleExists(jsx, options.styleScoped);
        appendQwikInspectorAttribute(jsx);

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
          )
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
          let attrs = jsx.key != null ? [ELEMENT_KEY, jsx.key] : EMPTY_ARRAY;
          if (isDev) {
            attrs = [DEBUG_TYPE, VirtualType.Fragment, ...attrs]; // Add debug info.
          }
          ssr.openFragment(attrs);
          enqueue(ssr.closeFragment);
          // In theory we could get functions or regexes, but we assume all is well
          const children = jsx.children as JSXOutput;
          children != null && enqueue(children);
        } else if (type === Slot) {
          const componentFrame =
            options.parentComponentFrame || ssr.unclaimedProjectionComponentFrameQueue.shift();
          if (componentFrame) {
            const compId = componentFrame.componentNode.id || '';
            const projectionAttrs = isDev ? [DEBUG_TYPE, VirtualType.Projection] : [];
            projectionAttrs.push(':', compId);
            ssr.openProjection(projectionAttrs);
            const host = componentFrame.componentNode;
            const node = ssr.getLastNode();
            const slotName = getSlotName(host, jsx, ssr);
            projectionAttrs.push(QSlot, slotName);
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
            ssr.openFragment(isDev ? [DEBUG_TYPE, VirtualType.Projection] : EMPTY_ARRAY);
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
                  allowPromises: true,
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
          ssr.openComponent(isDev ? [DEBUG_TYPE, VirtualType.Component] : []);
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
          const inlineComponentProps = [ELEMENT_KEY, jsx.key];
          ssr.openFragment(
            isDev
              ? [DEBUG_TYPE, VirtualType.InlineComponent, ...inlineComponentProps]
              : inlineComponentProps
          );
          enqueue(ssr.closeFragment);
          const component = ssr.getComponentFrame(0)!;
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
  const handleProp = (key: string, value: unknown) => {
    if (isJsxPropertyAnEventName(key)) {
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
        const anotherValue = getEventProp(anotherRecord, key);
        if (anotherValue) {
          if (pushMergedEventProps) {
            // merge values from the const props with the var props
            value = getMergedEventPropValues(value, anotherValue);
          } else {
            return;
          }
        }
      }
      const eventValue = setEvent(serializationCtx, key, value);
      if (eventValue) {
        ssrAttrs.push(convertEventNameFromJsxPropToHtmlAttr(key), eventValue);
      }
      return;
    }

    if (isSignal(value)) {
      // write signal as is. We will track this signal inside `writeAttrs`
      if (isClassAttr(key)) {
        // additionally append styleScopedId for class attr
        ssrAttrs.push(key, [value, styleScopedId]);
      } else {
        ssrAttrs.push(key, value);
      }
      return;
    }

    if (isPreventDefault(key)) {
      addPreventDefaultEventToSerializationContext(serializationCtx, key);
    }

    value = serializeAttribute(key, value, styleScopedId);

    ssrAttrs.push(key, value as string);
  };
  for (const key in record) {
    const value = record[key];
    if (key.startsWith('bind:')) {
      const propName = key.slice(5);
      // emit signal value as the value of the input
      handleProp(propName, value);
      // emit handler to update the signal value
      const handler = propName === 'value' || propName === 'checked' ? 'onInput$' : 'onChange$';
      // todo verify if static listeners flag needs to be set
      handleProp(
        handler,
        $((_: any, element: any) => {
          (value as Signal).value = element[propName];
        })
      );
    } else {
      handleProp(key, value);
    }
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

function getEventProp(record: Record<string, unknown>, propKey: string): unknown | null {
  const eventProp = propKey.toLowerCase();
  for (const prop in record) {
    if (prop.toLowerCase() === eventProp) {
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

  if (Array.isArray(qrls)) {
    for (let i = 0; i <= qrls.length; i++) {
      const qrl: unknown = qrls[i];
      if (isQrl(qrl)) {
        appendToValue(qrlToString(serializationCtx, qrl));
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
    value = qrlToString(serializationCtx, qrls);
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

function getSlotName(host: ISsrNode, jsx: JSXNode, ssr: SSRContainer): string {
  const constProps = jsx.constProps;
  if (constProps && typeof constProps == 'object' && 'name' in constProps) {
    const constValue = constProps.name;
    if (constValue instanceof WrappedSignal) {
      return trackSignal(() => constValue.value, host, EffectProperty.COMPONENT, ssr);
    }
  }
  return directGetPropsProxyProp(jsx, 'name') || QDefaultSlot;
}

function appendQwikInspectorAttribute(jsx: JSXNode) {
  if (isDev && qInspector && jsx.dev && jsx.type !== 'head') {
    const sanitizedFileName = jsx.dev.fileName?.replace(/\\/g, '/');
    const qwikInspectorAttr = 'data-qwik-inspector';
    if (sanitizedFileName && (!jsx.constProps || !(qwikInspectorAttr in jsx.constProps))) {
      (jsx.constProps ||= {})[qwikInspectorAttr] =
        `${sanitizedFileName}:${jsx.dev.lineNumber}:${jsx.dev.columnNumber}`;
    }
  }
}

// append class attribute if styleScopedId exists and there is no class attribute
function appendClassIfScopedStyleExists(jsx: JSXNode, styleScoped: string | null) {
  const classAttributeExists = directGetPropsProxyProp(jsx, 'class') != null;
  if (!classAttributeExists && styleScoped) {
    if (!jsx.constProps) {
      jsx.constProps = {};
    }
    jsx.constProps['class'] = '';
  }
}
