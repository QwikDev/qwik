import { isDev } from '@builder.io/qwik/build';
import { isQwikComponent, type OnRenderFn } from '../../component/component.public';
import { assertDefined } from '../../error/assert';
import { isQrl, type QRLInternal } from '../../qrl/qrl-class';
import { JSXNodeImpl, isJSXNode } from '../../render/jsx/jsx-runtime';
import type { JSXNode, JSXOutput } from '../../render/jsx/types/jsx-node';
import type { KnownEventNames } from '../../render/jsx/types/jsx-qwik-events';
import { SubscriptionType } from '../../state/common';
import { isSignal } from '../../state/signal';
import { invokeApply, newInvokeContext, untrack } from '../../use/use-core';
import { type EventQRL, type UseOnMap } from '../../use/use-on';
import { EMPTY_OBJ } from '../../util/flyweight';
import {
  ELEMENT_PROPS,
  ELEMENT_SEQ_IDX,
  OnRenderProp,
  RenderEvent,
  USE_ON_LOCAL,
  USE_ON_LOCAL_SEQ_IDX,
} from '../../util/markers';
import { isPromise, maybeThen, safeCall } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { Container2, HostElement, fixMeAny } from './types';
import { logWarn } from '../../util/log';

/**
 * Use `executeComponent2` to execute a component.
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
export const executeComponent2 = (
  container: Container2,
  renderHost: HostElement,
  subscriptionHost: HostElement,
  componentQRL: OnRenderFn<unknown> | QRLInternal<OnRenderFn<unknown>> | null,
  props: Record<string, unknown> | null
): ValueOrPromise<JSXOutput> => {
  const iCtx = newInvokeContext(
    container.$locale$,
    subscriptionHost as fixMeAny,
    undefined,
    RenderEvent
  );
  iCtx.$subscriber$ = [SubscriptionType.HOST, subscriptionHost as fixMeAny];
  iCtx.$container2$ = container;
  let componentFn: (props: unknown) => ValueOrPromise<JSXOutput>;
  container.ensureProjectionResolved(renderHost);
  if (componentQRL === null) {
    componentQRL = componentQRL || container.getHostProp(renderHost, OnRenderProp)!;
    assertDefined(componentQRL, 'No Component found at this location');
  }
  if (isQrl(componentQRL)) {
    props = props || container.getHostProp(renderHost, ELEMENT_PROPS) || EMPTY_OBJ;
    componentFn = componentQRL.getFn(iCtx);
  } else if (isQwikComponent(componentQRL)) {
    const qComponentFn = componentQRL as (
      props: Record<string, unknown>,
      key: string | null,
      flags: number
    ) => JSXNode;
    componentFn = () => invokeApply(iCtx, qComponentFn, [props || EMPTY_OBJ, null, 0]);
  } else {
    const inlineComponent = componentQRL as (props: Record<string, unknown>) => JSXOutput;
    componentFn = () => invokeApply(iCtx, inlineComponent, [props || EMPTY_OBJ]);
  }

  const executeComponentWithPromiseExceptionRetry = (): ValueOrPromise<JSXOutput> =>
    safeCall<JSXOutput, JSXOutput, JSXOutput>(
      () => {
        container.setHostProp(renderHost, ELEMENT_SEQ_IDX, null);
        container.setHostProp(renderHost, USE_ON_LOCAL_SEQ_IDX, null);
        container.setHostProp(renderHost, ELEMENT_PROPS, props);
        return componentFn(props);
      },
      (jsx) => {
        const useOnEvents = container.getHostProp<UseOnMap>(renderHost, USE_ON_LOCAL);
        if (useOnEvents) {
          return maybeThen(addUseOnEvents(jsx, useOnEvents), () => jsx);
        }
        return jsx;
      },
      (err) => {
        if (isPromise(err)) {
          return err.then(executeComponentWithPromiseExceptionRetry) as Promise<JSXOutput>;
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
): ValueOrPromise<JSXNode<string> | null> {
  const jsxElement = findFirstStringJSX(jsx);
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
            jsxElement = addScriptNodeForInvisibleComponents(jsx);
            if (jsxElement) {
              addUseOnEvent(jsxElement, 'document:onQinit$', useOnEvents[key]);
            }
          } else if (key.startsWith('document:') || key.startsWith('window:')) {
            jsxElement = addScriptNodeForInvisibleComponents(jsx);
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
    return jsxElement;
  });
}

function addUseOnEvent(jsxElement: JSXNode, key: string, value: EventQRL<KnownEventNames>[]) {
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

function findFirstStringJSX(jsx: JSXOutput): ValueOrPromise<JSXNode<string> | null> {
  const queue: any[] = [jsx];
  while (queue.length) {
    const jsx = queue.shift();
    if (isJSXNode(jsx)) {
      if (typeof jsx.type === 'string') {
        return jsx as JSXNode<string>;
      }
      queue.push(jsx.children);
    } else if (Array.isArray(jsx)) {
      queue.push(...jsx);
    } else if (isPromise(jsx)) {
      return maybeThen<JSXOutput, JSXNode<string> | null>(jsx, (jsx) => findFirstStringJSX(jsx));
    } else if (isSignal(jsx)) {
      return findFirstStringJSX(untrack(() => jsx.value as JSXOutput));
    }
  }
  return null;
}

function addScriptNodeForInvisibleComponents(jsx: JSXOutput): JSXNode<string> | null {
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

    if (jsx.children == null) {
      jsx.children = jsxElement;
    } else if (Array.isArray(jsx.children)) {
      jsx.children.push(jsxElement);
    } else {
      jsx.children = [jsx.children, jsxElement];
    }
    return jsxElement;
  } else if (Array.isArray(jsx) && jsx.length) {
    // get first element
    return addScriptNodeForInvisibleComponents(jsx[0]);
  }

  return null;
}
