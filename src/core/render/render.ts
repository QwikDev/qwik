import { Host } from '../render/jsx/host.public';
import { getContext } from '../props/props';
import type { ValueOrPromise } from '../util/types';
import { RenderContext, smartUpdateChildren, updateProperties } from './cursor';
import type { JSXNode } from './jsx/types/jsx-node';
export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export function visitJsxNode(
  ctx: RenderContext,
  elm: Element,
  jsxNode: JSXNode | JSXNode[] | undefined,
  isSvg: boolean
): ValueOrPromise<void> {
  if (jsxNode === undefined) {
    return smartUpdateChildren(ctx, elm, [], 'root', isSvg);
  }
  if (Array.isArray(jsxNode)) {
    return smartUpdateChildren(ctx, elm, jsxNode.flat(), 'root', isSvg);
  } else if (jsxNode.type === Host) {
    updateProperties(ctx, getContext(elm), jsxNode.props, isSvg);
    return smartUpdateChildren(ctx, elm, jsxNode.children || [], 'root', isSvg);
  } else {
    return smartUpdateChildren(ctx, elm, [jsxNode], 'root', isSvg);
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
