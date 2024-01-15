import type { JSXNode } from '@builder.io/qwik/jsx-runtime';
import type { ValueOrPromise } from '../../util/types';
import { newInvokeContext } from '../../use/use-core';
import type { VirtualVNode } from '../client/types';
import { maybeThen, promiseAllLazy, safeCall } from '../../util/promises';
import type { QRLInternal } from '../../qrl/qrl-class';
import type { OnRenderFn } from '../../component/component.public';
import { SkipRender } from '../../render/jsx/utils.public';
import { SignalUnassignedException } from '../../state/signal';
import { handleError } from '../../render/error-handling';
import type { Container2 } from './types';

export const executeComponent2 = (
  host: VirtualVNode,
  componentQRL: QRLInternal<OnRenderFn<any>>,
  props: Record<string, any>
): ValueOrPromise<JSXNode> => {
  const iCtx = newInvokeContext('TBD-LOCALE', host as any);
  const componentFn = componentQRL.getFn(iCtx);
  const waitOn: any[] = [];
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
          return executeComponent2(host, componentQRL, props);
        });
      }
      // handleError(err, hostElement, rCtx.$static$.$containerState$);
      return SkipRender;
    }
  );
};
