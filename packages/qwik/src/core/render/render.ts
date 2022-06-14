import { getContext } from '../props/props';
import { isArray, ValueOrPromise } from '../util/types';
import { RenderContext, smartUpdateChildren, updateProperties } from './cursor';
import type { ProcessedJSXNode } from './jsx/types/jsx-node';
import { HOST_TYPE } from './jsx/jsx-runtime';
export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export const visitJsxNode = (
  ctx: RenderContext,
  elm: Element,
  jsxNode: ProcessedJSXNode | ProcessedJSXNode[] | undefined,
  isSvg: boolean
): ValueOrPromise<void> => {
  if (jsxNode === undefined) {
    return smartUpdateChildren(ctx, elm, [], 'root', isSvg);
  }
  if (isArray(jsxNode)) {
    return smartUpdateChildren(ctx, elm, jsxNode.flat(), 'root', isSvg);
  } else if (jsxNode.$type$ === HOST_TYPE) {
    updateProperties(ctx, getContext(elm), jsxNode.$props$, isSvg);
    return smartUpdateChildren(ctx, elm, jsxNode.$children$ || [], 'root', isSvg);
  } else {
    return smartUpdateChildren(ctx, elm, [jsxNode], 'root', isSvg);
  }
};
