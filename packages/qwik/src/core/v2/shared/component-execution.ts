import type { OnRenderFn } from '../../component/component.public';
import { assertDefined } from '../../error/assert';
import type { QRLInternal } from '../../qrl/qrl-class';
import { newInvokeContext } from '../../use/use-core';
import { EMPTY_OBJ } from '../../util/flyweight';
import { ELEMENT_PROPS, OnRenderProp, RenderEvent } from '../../util/markers';
import type { ValueOrPromise } from '../../util/types';
import type { Container2, HostElement, fixMeAny } from './types';
import type { JSXOutput } from '../../render/jsx/types/jsx-node';
import { isPromise, maybeThen, safeCall } from '../../util/promises';
import { SEQ_IDX_LOCAL } from '../../use/use-sequential-scope';

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
 * @param container
 * @param host
 * @param componentQRL
 * @param props
 * @returns
 */
export const executeComponent2 = (
  container: Container2,
  host: HostElement,
  componentQRL: QRLInternal<OnRenderFn<any>> | null,
  props: Record<string, any> | null
): ValueOrPromise<JSXOutput> => {
  const iCtx = newInvokeContext(container.$locale$, host as fixMeAny, undefined, RenderEvent);
  // $renderCtx$ is no longer used.
  iCtx.$renderCtx$ = EMPTY_OBJ as fixMeAny; // TODO(mhevery): no longer needed
  iCtx.$waitOn$ = []; // TODO(mhevery): no longer needed
  iCtx.$subscriber$ = [0, host as fixMeAny];
  iCtx.$container2$ = container;
  componentQRL = componentQRL || container.getHostProp(host, OnRenderProp)!;
  assertDefined(componentQRL, 'No Component found at this location');
  props = props || container.getHostProp(host, ELEMENT_PROPS) || EMPTY_OBJ;
  const componentFn = componentQRL.getFn(iCtx);

  const executeComponentWithPromiseExceptionRetry = (): ValueOrPromise<JSXOutput> =>
    safeCall<JSXOutput, JSXOutput, JSXOutput>(
      () => {
        container.setHostProp(host, SEQ_IDX_LOCAL, null);
        return componentFn(props);
      },
      (jsx) => {
        container.setHostProp(host, JSX_LOCAL, jsx);
        return container.$scheduler$.$drainComponent$(host);
      },
      (err: any) => {
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
export const JSX_LOCAL = ':jsx';
