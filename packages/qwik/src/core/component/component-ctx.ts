import { assertDefined } from '../assert/assert';
import { appendStyle, RenderContext } from '../render/cursor';
import { visitJsxNode } from '../render/render';
import { ComponentScopedStyles, QHostAttr, RenderEvent } from '../util/markers';
import { promiseAll, then } from '../util/promises';
import { styleContent, styleHost } from './qrl-styles';
import { isStyleTask, newInvokeContext } from '../use/use-core';
import { getProps, QContext } from '../props/props';
import { processNode } from '../render/jsx/jsx-runtime';
import { wrapSubscriber } from '../use/use-subscriber';
import { logDebug } from '../util/log';
import type { ValueOrPromise } from '../util/types';
import { removeSub } from '../object/q-object';

export const firstRenderComponent = (rctx: RenderContext, ctx: QContext): ValueOrPromise<void> => {
  ctx.element.setAttribute(QHostAttr, '');
  return renderComponent(rctx, ctx);
};

export const renderComponent = (rctx: RenderContext, ctx: QContext): ValueOrPromise<void> => {
  ctx.dirty = false;

  const hostElement = ctx.element as HTMLElement;
  const onRenderQRL = ctx.renderQrl!;
  assertDefined(onRenderQRL);

  // Component is not dirty any more
  rctx.globalState.hostsStaging.delete(hostElement);

  const newCtx: RenderContext = {
    ...rctx,
    components: [...rctx.components],
  };

  // Invoke render hook
  const invocatinContext = newInvokeContext(rctx.doc, hostElement, hostElement, RenderEvent);
  invocatinContext.subscriber = hostElement;
  invocatinContext.renderCtx = newCtx;
  const waitOn = (invocatinContext.waitOn = [] as any[]);

  // Clean current subscription before render
  ctx.refMap.array.forEach((obj) => {
    removeSub(obj, hostElement);
  });
  const onRenderFn = onRenderQRL.invokeFn(rctx.containerEl, invocatinContext);

  // Execution of the render function
  const renderPromise = onRenderFn(wrapSubscriber(getProps(ctx), hostElement));

  // Wait for results
  return then(renderPromise, (jsxNode) => {
    rctx.hostElements.add(hostElement);

    const waitOnPromise = promiseAll(waitOn);
    return then(waitOnPromise, (waitOnResolved) => {
      waitOnResolved.forEach((task) => {
        if (isStyleTask(task)) {
          appendStyle(rctx, hostElement, task);
        }
      });
      if (ctx.dirty) {
        logDebug('Dropping render. State changed during render.');
        return renderComponent(rctx, ctx);
      }
      let componentCtx = ctx.component;
      if (!componentCtx) {
        componentCtx = ctx.component = {
          hostElement,
          slots: [],
          styleHostClass: undefined,
          styleClass: undefined,
          styleId: undefined,
        };
        const scopedStyleId = hostElement.getAttribute(ComponentScopedStyles) ?? undefined;
        if (scopedStyleId) {
          componentCtx.styleId = scopedStyleId;
          componentCtx.styleHostClass = styleHost(scopedStyleId);
          componentCtx.styleClass = styleContent(scopedStyleId);
          hostElement.classList.add(componentCtx.styleHostClass);
        }
      }
      componentCtx.slots = [];
      newCtx.components.push(componentCtx);
      return visitJsxNode(newCtx, hostElement, processNode(jsxNode), false);
    });
  });
};
