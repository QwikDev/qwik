import { Host } from '../render/jsx/host.public';
import { getContext } from '../props/props';
import { isArray, ValueOrPromise } from '../util/types';
import { RenderContext, smartUpdateChildren, updateProperties } from './cursor';
import type { JSXNode } from './jsx/types/jsx-node';
export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export const visitJsxNode = (
  ctx: RenderContext,
  elm: Element,
  jsxNode: JSXNode | JSXNode[] | undefined,
  isSvg: boolean
): ValueOrPromise<void> => {
  if (jsxNode === undefined) {
    return smartUpdateChildren(ctx, elm, [], 'root', isSvg);
  }
  if (isArray(jsxNode)) {
    return smartUpdateChildren(ctx, elm, jsxNode.flat(), 'root', isSvg);
  } else if (jsxNode.type === Host) {
    updateProperties(ctx, getContext(elm), jsxNode.props, isSvg);
    return smartUpdateChildren(ctx, elm, jsxNode.children || [], 'root', isSvg);
  } else {
    return smartUpdateChildren(ctx, elm, [jsxNode], 'root', isSvg);
  }
};
