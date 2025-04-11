import { isDev } from '@qwik.dev/core/build';
import { vnode_isVNode } from '../client/vnode';
import { Slot } from '../shared/jsx/slot.public';
import { isSignal } from '../reactive-primitives/utils';
import { clearAllEffects } from '../reactive-primitives/cleanup';
import { invokeApply, newInvokeContext, untrack } from '../use/use-core';
import { type EventQRL, type UseOnMap } from '../use/use-on';
import { isQwikComponent, type OnRenderFn } from './component.public';
import { assertDefined } from './error/assert';
import { Fragment, JSXNodeImpl, _jsxSorted, isJSXNode, type Props } from './jsx/jsx-runtime';
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
import type { ValueOrPromise } from './utils/types';
import { getSubscriber } from '../reactive-primitives/subscriber';
import { EffectProperty } from '../reactive-primitives/types';

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
    if (props.children) {
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
          container.setHostProp(renderHost, ELEMENT_PROPS, props);
        }

        if (vnode_isVNode(renderHost)) {
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
            executeComponentWithPromiseExceptionRetry(retryCount++)
          ) as Promise<JSXOutput>;
        } else {
          throw err;
        }
      }
    );
  return executeComponentWithPromiseExceptionRetry();
};

/**
 * Stores the JSX output of the last execution of the component.
 *
 * Component can execute multiple times because:
 *
 * - Component can have multiple tasks
 * - Tasks can track signals
 * - Task A can change signal which causes Task B to rerun.
 *
 * So when executing a component we only care about its last JSX Output.
 */

function addUseOnEvents(
  jsx: JSXOutput,
  useOnEvents: UseOnMap
): ValueOrPromise<JSXNodeInternal<string> | null | JSXOutput> {
  const jsxElement = findFirstStringJSX(jsx);
  let jsxResult = jsx;
  return maybeThen(jsxElement, (jsxElement) => {
    let isInvisibleComponent = false;
    if (!jsxElement) {
      /**
       * We did not find any jsx node with a string tag. This means that we should append:
       *
       * ```html
       * <script type="placeholder" hidden on-document:qinit="..."></script>
       * ```
       *
       * This is needed because use on events should have a node to attach them to.
       */
      isInvisibleComponent = true;
    }
    for (const key in useOnEvents) {
      if (Object.prototype.hasOwnProperty.call(useOnEvents, key)) {
        if (isInvisibleComponent) {
          if (key === 'onQvisible$') {
            const [jsxElement, jsx] = addScriptNodeForInvisibleComponents(jsxResult);
            jsxResult = jsx;
            if (jsxElement) {
              addUseOnEvent(jsxElement, 'document:onQinit$', useOnEvents[key]);
            }
          } else if (key.startsWith('document:') || key.startsWith('window:')) {
            const [jsxElement, jsx] = addScriptNodeForInvisibleComponents(jsxResult);
            jsxResult = jsx;
            if (jsxElement) {
              addUseOnEvent(jsxElement, key, useOnEvents[key]);
            }
          } else if (isDev) {
            logWarn(
              'You are trying to add an event "' +
                key +
                '" using `useOn` hook, ' +
                'but a node to which you can add an event is not found. ' +
                'Please make sure that the component has a valid element node. '
            );
          }
        } else if (jsxElement) {
          addUseOnEvent(jsxElement, key, useOnEvents[key]);
        }
      }
    }
    return jsxResult;
  });
}

function addUseOnEvent(
  jsxElement: JSXNodeInternal,
  key: string,
  value: EventQRL<KnownEventNames>[]
) {
  let props = jsxElement.props;
  if (props === EMPTY_OBJ) {
    props = jsxElement.props = {};
  }
  let propValue = props[key] as UseOnMap['any'] | UseOnMap['any'][0] | undefined;
  if (propValue === undefined) {
    propValue = [];
  } else if (!Array.isArray(propValue)) {
    propValue = [propValue];
  }
  propValue.push(...value);
  props[key] = propValue;
}

function findFirstStringJSX(jsx: JSXOutput): ValueOrPromise<JSXNodeInternal<string> | null> {
  const queue: any[] = [jsx];
  while (queue.length) {
    const jsx = queue.shift();
    if (isJSXNode(jsx)) {
      if (typeof jsx.type === 'string') {
        return jsx as JSXNodeInternal<string>;
      }
      queue.push(jsx.children);
    } else if (Array.isArray(jsx)) {
      queue.push(...jsx);
    } else if (isPromise(jsx)) {
      return maybeThen<JSXOutput, JSXNodeInternal<string> | null>(jsx, (jsx) =>
        findFirstStringJSX(jsx)
      );
    } else if (isSignal(jsx)) {
      return findFirstStringJSX(untrack(() => jsx.value as JSXOutput));
    }
  }
  return null;
}

function addScriptNodeForInvisibleComponents(
  jsx: JSXOutput
): [JSXNodeInternal<string> | null, JSXOutput | null] {
  if (isJSXNode(jsx)) {
    const jsxElement = new JSXNodeImpl(
      'script',
      {},
      {
        type: 'placeholder',
        hidden: '',
      },
      null,
      3
    );
    if (jsx.type === Slot) {
      return [jsxElement, _jsxSorted(Fragment, null, null, [jsx, jsxElement], 0, null)];
    }

    if (jsx.children == null) {
      jsx.children = jsxElement;
    } else if (Array.isArray(jsx.children)) {
      jsx.children.push(jsxElement);
    } else {
      jsx.children = [jsx.children, jsxElement];
    }
    return [jsxElement, jsx];
  } else if (Array.isArray(jsx) && jsx.length) {
    // get first element
    const [jsxElement, _] = addScriptNodeForInvisibleComponents(jsx[0]);
    return [jsxElement, jsx];
  }

  return [null, null];
}
