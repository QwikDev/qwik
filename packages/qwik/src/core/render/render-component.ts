import { assertDefined } from '../assert/assert';
import { copyRenderContext, RenderContext } from './cursor';
import { visitJsxNode } from './render';
import { ComponentScopedStyles, RenderEvent } from '../util/markers';
import { promiseAll, safeCall, then } from '../util/promises';
import { styleContent, styleHost } from '../component/qrl-styles';
import { newInvokeContext } from '../use/use-core';
import { processData } from './jsx/jsx-runtime';
import { logError } from '../util/log';
import { isFunction, ValueOrPromise } from '../util/types';
import type { QContext } from '../props/props';
import { directGetAttribute } from './fast-calls';
import type { JSXNode } from '../render/jsx/types/jsx-node';

export const renderComponent = (rctx: RenderContext, ctx: QContext): ValueOrPromise<void> => {
  ctx.$dirty$ = false;

  const hostElement = ctx.$element$;
  const onRenderQRL = ctx.$renderQrl$!;
  assertDefined(
    onRenderQRL,
    `render: host element to render must has a $renderQrl$: ${hostElement}`
  );

  const props = ctx.$props$;
  assertDefined(props, `render: host element to render must has defined props: ${hostElement}`);

  // Component is not dirty any more
  rctx.$containerState$.$hostsStaging$.delete(hostElement);

  const newCtx = copyRenderContext(rctx);

  // Invoke render hook
  const invocatinContext = newInvokeContext(rctx.$doc$, hostElement, hostElement, RenderEvent);
  invocatinContext.$subscriber$ = hostElement;
  invocatinContext.$renderCtx$ = newCtx;
  const waitOn = (invocatinContext.$waitOn$ = [] as any[]);

  // Clean current subscription before render
  rctx.$containerState$.$subsManager$.$clearSub$(hostElement);

  // Resolve render function
  const onRenderFn = onRenderQRL.$invokeFn$(rctx.$containerEl$, invocatinContext);

  return safeCall(
    () => onRenderFn(props) as JSXNode | Function,
    (jsxNode) => {
      rctx.$hostElements$.add(hostElement);
      const waitOnPromise = promiseAll(waitOn);
      return then(waitOnPromise, () => {
        if (isFunction(jsxNode)) {
          ctx.$dirty$ = false;
          jsxNode = jsxNode();
        } else if (ctx.$dirty$) {
          return renderComponent(rctx, ctx);
        }

        let componentCtx = ctx.$component$;
        if (!componentCtx) {
          componentCtx = ctx.$component$ = {
            $hostElement$: hostElement,
            $slots$: [],
            $styleHostClass$: undefined,
            $styleClass$: undefined,
            $styleId$: undefined,
          };
          const scopedStyleId = directGetAttribute(hostElement, ComponentScopedStyles) ?? undefined;
          if (scopedStyleId) {
            componentCtx.$styleId$ = scopedStyleId;
            componentCtx.$styleHostClass$ = styleHost(scopedStyleId);
            componentCtx.$styleClass$ = styleContent(scopedStyleId);
            hostElement.classList.add(componentCtx.$styleHostClass$);
          }
        }
        componentCtx.$slots$ = [];
        newCtx.$contexts$.push(ctx);
        newCtx.$currentComponent$ = componentCtx;
        const invocatinContext = newInvokeContext(rctx.$doc$, hostElement, hostElement);
        invocatinContext.$subscriber$ = hostElement;
        invocatinContext.$renderCtx$ = newCtx;
        const processedJSXNode = processData(jsxNode, invocatinContext);
        return then(processedJSXNode, (processedJSXNode) => {
          return visitJsxNode(newCtx, hostElement, processedJSXNode, false);
        });
      });
    },
    (err) => {
      logError(err);
    }
  );
};
