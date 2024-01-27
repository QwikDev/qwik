import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import { isPromise } from 'util/types';
import type { OnRenderFn } from '../../component/component.public';
import { assertDefined } from '../../error/assert';
import type { QRLInternal } from '../../qrl/qrl-class';
import { handleError2 } from '../../render/error-handling';
import { SkipRender } from '../../render/jsx/utils.public';
import { newInvokeContext } from '../../use/use-core';
import { EMPTY_OBJ } from '../../util/flyweight';
import { ELEMENT_PROPS, OnRenderProp, RenderEvent } from '../../util/markers';
import { maybeThen, promiseAllLazy, safeCall } from '../../util/promises';
import type { ValueOrPromise } from '../../util/types';
import type { VirtualVNode } from '../client/types';
import { vnode_getProp } from '../client/vnode';
import type { Container2, fixMeAny } from './types';

export const executeComponent2 = (
  container: Container2,
  host: VirtualVNode,
  componentQRL: QRLInternal<OnRenderFn<any>> | null,
  props: Record<string, any> | null
): ValueOrPromise<JSXNode> => {
  const iCtx = newInvokeContext(container.$locale$, host as fixMeAny, undefined, RenderEvent);
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
  container.clearLocalProps(host);
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
      if (isPromise(err)) {
        return err.then(() => executeComponent2(container, host, componentQRL, props));
      } else {
        try {
          handleError2(err, host as fixMeAny, container);
        } catch (e) {
          console.error('ERROR', e);
        }
        return SkipRender;
      }
    }
  );
};
