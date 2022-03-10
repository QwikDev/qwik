import { Host } from '../index';
import type { ValueOrPromise } from '../util/types';
import { getCmpChildren, RenderContext, updateChildren, updateProperties } from './cursor';
import type { JSXNode } from './jsx/types/jsx-node';
export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export function visitJsxNode(
  ctx: RenderContext,
  elm: Element,
  jsxNode: JSXNode | JSXNode[] | undefined,
  isSvg: boolean
): ValueOrPromise<void> {
  if (jsxNode === undefined) {
    return updateChildren(ctx, elm, getCmpChildren(elm), [], isSvg);
  }
  if (Array.isArray(jsxNode)) {
    return updateChildren(ctx, elm, getCmpChildren(elm), jsxNode.flat(), isSvg);
  } else if (jsxNode.type === Host) {
    updateProperties(ctx, elm, jsxNode.props, isSvg);
    return updateChildren(ctx, elm, getCmpChildren(elm), jsxNode.children || [], isSvg);
  } else {
    return updateChildren(ctx, elm, getCmpChildren(elm), [jsxNode], isSvg);
  }
}

export function whileResolvingRender<ARGS extends any[], RET>(
  ...args: [...ARGS, (...args: ResolvedValues<ARGS>) => RET]
): RET {
  throw new Error('Function not implemented.' + args);
}

export type ResolvedValues<ARGS extends any[]> = {
  [K in keyof ARGS]: ARGS[K] extends ValueOrPromise<infer U> ? U : ARGS[K];
};
