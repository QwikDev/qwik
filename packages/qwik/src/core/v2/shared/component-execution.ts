import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { OnRenderFn } from '../../component/component.public';
import type { QRLInternal } from '../../qrl/qrl-class';
import { SkipRender } from '../../render/jsx/utils.public';
import { SignalUnassignedException } from '../../state/signal';
import { newInvokeContext } from '../../use/use-core';
import { maybeThen, promiseAllLazy, safeCall } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { VirtualVNode } from '../client/types';
import type { Container2, fixMeAny } from './types';
import { ELEMENT_PROPS, OnRenderProp, RenderEvent } from '../../util/markers';
import { EMPTY_OBJ } from '../../util/flyweight';
import { handleError } from '../../render/error-handling';
import { vnode_getProp } from '../client/vnode';
import { assertDefined } from '../../error/assert';

export const executeComponent2 = (
  container: Container2,
  host: VirtualVNode,
  componentQRL: QRLInternal<OnRenderFn<any>> | null,
  props: Record<string, any> | null
): ValueOrPromise<JSXNode> => {
  const iCtx = newInvokeContext(container.qLocale, host as fixMeAny, undefined, RenderEvent);
  // $renderCtx$ is no longer used.
  const waitOn = (iCtx.$waitOn$ = []);
  iCtx.$renderCtx$ = EMPTY_OBJ as fixMeAny;
  iCtx.$subscriber$ = [0, host as fixMeAny];
  iCtx.$container2$ = container;
  componentQRL =
    componentQRL ||
    vnode_getProp<QRLInternal<OnRenderFn<any>>>(host, OnRenderProp, container.getObjectById)!;
  assertDefined(componentQRL, 'No Component found at this location');
  props = props || vnode_getProp<any>(host, ELEMENT_PROPS, container.getObjectById) || EMPTY_OBJ;
  const componentFn = componentQRL.getFn(iCtx);
  return safeCall(
    () => componentFn(props) as ValueOrPromise<JSXNode>,
    (jsxNode) => {
      return maybeThen(promiseAllLazy(waitOn), () => {
        // if (elCtx.$flags$ & HOST_FLAG_DIRTY) {
        //   return executeComponent2(rCtx, elCtx);
        // }
        return jsxNode;
      });
    },
    (err) => {
      if (err === SignalUnassignedException) {
        return maybeThen(promiseAllLazy(waitOn), () => {
          return executeComponent2(container, host, componentQRL, props);
        });
      }
      try {
        handleError(err, host as fixMeAny, null as fixMeAny);
      } catch (e) {
        console.error('ERROR', e);
      }
      return SkipRender;
    }
  );
};
