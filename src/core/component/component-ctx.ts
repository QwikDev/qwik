import { assertDefined } from '../assert/assert';
import type { RenderContext } from '../render/cursor';
import { visitJsxNode } from '../render/render';
import { ComponentScopedStyles, OnRenderProp, QHostAttr } from '../util/markers';
import { then } from '../util/promises';
import { styleContent, styleHost } from './qrl-styles';
import { newInvokeContext, useInvoke } from '../use/use-core';
import { getEvent, QContext } from '../props/props';
import type { JSXNode } from '..';
import { processNode } from '../render/jsx/jsx-runtime';

export const firstRenderComponent = (rctx: RenderContext, ctx: QContext) => {
  ctx.element.setAttribute(QHostAttr, '');
  const result = renderComponent(rctx, ctx);
  // if (ctx.component?.styleHostClass) {
  //   classlistAdd(rctx, ctx.element, ctx.component.styleHostClass);
  // }
  return result;
};

export const renderComponent = (rctx: RenderContext, ctx: QContext) => {
  const hostElement = ctx.element as HTMLElement;
  const onRender = getEvent(ctx, OnRenderProp) as any as () => JSXNode;
  assertDefined(onRender);

  // Component is not dirty any more
  ctx.dirty = false;
  rctx.globalState.hostsStaging.delete(hostElement);

  // Invoke render hook
  const promise = useInvoke(newInvokeContext(hostElement, hostElement, 'qRender'), onRender);

  return then(promise, (jsxNode) => {
    // Types are wrong here
    jsxNode = (jsxNode as any)[0];
    rctx.hostElements.add(hostElement);
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

    const newCtx: RenderContext = {
      ...rctx,
      component: componentCtx,
    };
    return visitJsxNode(newCtx, hostElement, processNode(jsxNode), false);
  });
};
