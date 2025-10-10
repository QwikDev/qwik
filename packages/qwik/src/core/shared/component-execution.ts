import { isDev } from '@qwik.dev/core/build';
import { vnode_isVNode } from '../client/vnode';
import { Slot } from '../shared/jsx/slot.public';
import { isSignal } from '../reactive-primitives/utils';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { invokeApply, newInvokeContext, untrack } from '../use/use-core';
import { type EventQRL, type UseOnMap } from '../use/use-on';
import { isQwikComponent, type OnRenderFn } from './component.public';
import { assertDefined } from './error/assert';
import { Fragment, type Props } from './jsx/jsx-runtime';
import { _jsxSorted } from './jsx/jsx-internal';
import { JSXNodeImpl, isJSXNode } from './jsx/jsx-node';
import type { JSXNodeInternal, JSXOutput } from './jsx/types/jsx-node';
import type { KnownEventNames } from './jsx/types/jsx-qwik-events';
import type { QRLInternal } from './qrl/qrl-class';
import { isQrl } from './qrl/qrl-utils';
import type { Container, HostElement } from './types';
import { EMPTY_OBJ } from './utils/flyweight';
import { logWarn } from './utils/log';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ_IDX,
  OnRenderProp,
  RenderEvent,
  USE_ON_LOCAL,
  USE_ON_LOCAL_SEQ_IDX,
} from './utils/markers';
import { MAX_RETRY_ON_PROMISE_COUNT, isPromise, maybeThen, safeCall } from './utils/promises';
import { isArray, isPrimitive, type ValueOrPromise } from './utils/types';
import { getSubscriber } from '../reactive-primitives/subscriber';
import { EffectProperty } from '../reactive-primitives/types';
import { EventNameJSXScope } from './utils/event-names';

/**
 * Use `executeComponent` to execute a component.
 *
 * Component execution can be complex because of:
 *
 * - It can by async
 * - It can contain many tasks which need to be awaited
 * - Each task can run multiple times if they track signals which change.
 * - The JSX may be re-generated multiple times of a task needs to be rerun due to signal change.
 * - It needs to keep track of hook state.
 *
 * For `component$`: `renderHost` === `subscriptionHost` For inlined-components: the
 * `subscriptionHost` is a parent `component$` which needs to re-execute.
 *
 * @param container
 * @param renderHost - VNode into which the component is rendered into.
 * @param subscriptionHost - VNode which will be re-executed if the component needs to re-render.
 * @param componentQRL
 * @param props
 * @returns
 */
export const executeComponent = (
  container: Container,
  renderHost: HostElement,
  subscriptionHost: HostElement | null,
  componentQRL: OnRenderFn<unknown> | QRLInternal<OnRenderFn<unknown>> | null,
  props: Props | null
): ValueOrPromise<JSXOutput> => {
  const iCtx = newInvokeContext(
    container.$locale$,
    subscriptionHost || undefined,
    undefined,
    RenderEvent
  );
  if (subscriptionHost) {
    iCtx.$effectSubscriber$ = getSubscriber(subscriptionHost, EffectProperty.COMPONENT);
    iCtx.$container$ = container;
  }
  let componentFn: (props: unknown) => ValueOrPromise<JSXOutput>;
  container.ensureProjectionResolved(renderHost);
  let isInlineComponent = false;
  if (componentQRL === null) {
    componentQRL = container.getHostProp(renderHost, OnRenderProp)!;
    assertDefined(componentQRL, 'No Component found at this location');
  }
  if (isQrl(componentQRL)) {
    props = props || container.getHostProp(renderHost, ELEMENT_PROPS) || EMPTY_OBJ;
    if ('children' in props) {
      delete props.children;
    }
    componentFn = componentQRL.getFn(iCtx);
  } else if (isQwikComponent(componentQRL)) {
    const qComponentFn = componentQRL as any as (
      props: Props,
      key: string | null,
      flags: number
    ) => JSXNodeInternal;
    componentFn = () => invokeApply(iCtx, qComponentFn, [props || EMPTY_OBJ, null, 0]);
  } else {
    isInlineComponent = true;
    const inlineComponent = componentQRL as (props: Props) => JSXOutput;
    componentFn = () => invokeApply(iCtx, inlineComponent, [props || EMPTY_OBJ]);
  }

  const executeComponentWithPromiseExceptionRetry = (retryCount = 0): ValueOrPromise<JSXOutput> =>
    safeCall<JSXOutput, JSXOutput, JSXOutput>(
      () => {
        if (!isInlineComponent) {
          container.setHostProp(renderHost, ELEMENT_SEQ_IDX, null);
          container.setHostProp(renderHost, USE_ON_LOCAL_SEQ_IDX, null);
        }

        if (retryCount > 0 && vnode_isVNode(renderHost)) {
          clearAllEffects(container, renderHost);
        }

        return componentFn(props);
      },
      (jsx) => {
        const useOnEvents = container.getHostProp<UseOnMap>(renderHost, USE_ON_LOCAL);
        if (useOnEvents) {
          return addUseOnEvents(jsx, useOnEvents);
        }
        return jsx;
      },
      (err) => {
        if (isPromise(err) && retryCount < MAX_RETRY_ON_PROMISE_COUNT) {
          return err.then(() =>
            executeComponentWithPromiseExceptionRetry(++retryCount)
          ) as Promise<JSXOutput>;
        } else {
          if (retryCount >= MAX_RETRY_ON_PROMISE_COUNT) {
            throw new Error(`Max retry count of component execution reached`);
          }
          throw err;
        }
      }
    );
  return executeComponentWithPromiseExceptionRetry();
};

/**
 * Adds `useOn` events to the JSX output.
 *
 * @param jsx The JSX output to modify.
 * @param useOnEvents The `useOn` events to add.
 * @returns The modified JSX output.
 */
function addUseOnEvents(
  jsx: JSXOutput,
  useOnEvents: UseOnMap
): ValueOrPromise<JSXNodeInternal<string> | null | JSXOutput> {
  const jsxElement = findFirstElementNode(jsx);
  let jsxResult = jsx;
  const qVisibleEvent = 'onQvisible$';
  return maybeThen(jsxElement, (jsxElement) => {
    // headless components are components that don't render a real DOM element
    const isHeadless = !jsxElement;
    // placeholder element is a <script> element that is used to add events to the document or window
    let placeholderElement: JSXNodeInternal<string> | null = null;
    for (const key in useOnEvents) {
      if (Object.prototype.hasOwnProperty.call(useOnEvents, key)) {
        let targetElement = jsxElement;
        let eventKey = key;

        if (isHeadless) {
          // if the component is headless, we need to add the event to the placeholder element
          if (
            key === qVisibleEvent ||
            key.startsWith(EventNameJSXScope.document) ||
            key.startsWith(EventNameJSXScope.window)
          ) {
            if (!placeholderElement) {
              const [createdElement, newJsx] = injectPlaceholderElement(jsxResult);
              jsxResult = newJsx;
              placeholderElement = createdElement;
            }
            targetElement = placeholderElement;
          } else {
            if (isDev) {
              logWarn(
                'You are trying to add an event "' +
                  key +
                  '" using `useOn` hook, ' +
                  'but a node to which you can add an event is not found. ' +
                  'Please make sure that the component has a valid element node. '
              );
            }
            continue;
          }
        }
        if (targetElement) {
          if (targetElement.type === 'script' && key === qVisibleEvent) {
            eventKey = 'document:onQInit$';
            logWarn(
              'You are trying to add an event "' +
                key +
                '" using `useVisibleTask$` hook, ' +
                'but a node to which you can add an event is not found. ' +
                'Using document:onQInit$ instead.'
            );
          }
          addUseOnEvent(targetElement, eventKey, useOnEvents[key]);
        }
      }
    }
    return jsxResult;
  });
}

/**
 * Adds an event to the JSX element.
 *
 * @param jsxElement The JSX element to add the event to.
 * @param key The event name.
 * @param value The event value.
 */
function addUseOnEvent(
  jsxElement: JSXNodeInternal,
  key: string,
  value: EventQRL<KnownEventNames>[]
) {
  const props = jsxElement.props;
  const propValue = props[key] as UseOnMap['any'] | UseOnMap['any'][0] | undefined;
  if (propValue === undefined) {
    props[key] = value;
  } else if (Array.isArray(propValue)) {
    propValue.push(...value);
  } else {
    props[key] = [propValue, ...value];
  }
}

/**
 * Finds the first element node in the JSX output.
 *
 * @param jsx The JSX output to search.
 * @returns The first element node or null if no element node is found.
 */
function findFirstElementNode(jsx: JSXOutput): ValueOrPromise<JSXNodeInternal<string> | null> {
  const queue: any[] = [jsx];
  while (queue.length) {
    const jsx = queue.shift();
    if (isJSXNode(jsx)) {
      if (typeof jsx.type === 'string') {
        return jsx as JSXNodeInternal<string>;
      }
      queue.push(jsx.children);
    } else if (isArray(jsx)) {
      queue.push(...jsx);
    } else if (isPromise(jsx)) {
      return maybeThen<JSXOutput, JSXNodeInternal<string> | null>(jsx, (jsx) =>
        findFirstElementNode(jsx)
      );
    } else if (isSignal(jsx)) {
      return findFirstElementNode(untrack(() => jsx.value as JSXOutput));
    }
  }
  return null;
}

/**
 * Injects a placeholder <script> element into the JSX output.
 *
 * This is necessary for headless components (components that don't render a real DOM element) to
 * have an anchor point for `useOn` event listeners that target the document or window.
 *
 * @param jsx The JSX output to modify.
 * @returns A tuple containing the created placeholder element and the modified JSX output.
 */
function injectPlaceholderElement(
  jsx: JSXOutput
): [JSXNodeInternal<string> | null, JSXOutput | null] {
  // For regular JSX nodes, we can append the placeholder to its children.
  if (isJSXNode(jsx)) {
    const placeholder = createPlaceholderScriptNode();
    // For slots, we can't add children, so we wrap them in a fragment.
    if (jsx.type === Slot) {
      return [placeholder, _jsxSorted(Fragment, null, null, [jsx, placeholder], 0, null)];
    }

    if (jsx.children == null) {
      jsx.children = placeholder;
    } else if (isArray(jsx.children)) {
      jsx.children.push(placeholder);
    } else {
      jsx.children = [jsx.children, placeholder];
    }
    return [placeholder, jsx];
  }

  // For primitives, we can't add children, so we wrap them in a fragment.
  if (isPrimitive(jsx)) {
    const placeholder = createPlaceholderScriptNode();
    return [placeholder, _jsxSorted(Fragment, null, null, [jsx, placeholder], 0, null)];
  }

  // For an array of nodes, we inject the placeholder into the first element.
  if (isArray(jsx) && jsx.length > 0) {
    const [createdElement, _] = injectPlaceholderElement(jsx[0]);
    return [createdElement, jsx];
  }

  // For anything else we do nothing.
  return [null, jsx];
}

/** @returns An empty <script> element for adding qwik metadata attributes to */
function createPlaceholderScriptNode(): JSXNodeInternal<string> {
  return new JSXNodeImpl('script', null, { hidden: '' });
}
