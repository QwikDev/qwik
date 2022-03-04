import { Host } from '../index';
import type { ValueOrPromise } from '../util/types';
import {
  RenderContext,
  updateChildren,
  updateProperties,
} from './cursor';
import type { JSXNode } from './jsx/types/jsx-node';
export type ComponentRenderQueue = Promise<HTMLElement[]>[];

export function visitJsxNode(
  ctx: RenderContext,
  elm: Element,
  jsxNode: JSXNode | JSXNode[],
  isSvg: boolean,
): ValueOrPromise<any> {
  if (Array.isArray(jsxNode)) {
    return updateChildren(ctx, elm, Array.from(elm.childNodes), jsxNode.flat(), isSvg);
  } else if (jsxNode.type === Host) {
    updateProperties(ctx, elm, jsxNode.props, isSvg);
    return updateChildren(ctx, elm, Array.from(elm.childNodes), jsxNode.children || [], isSvg);
  } else {
    return updateChildren(ctx, elm, Array.from(elm.childNodes), [jsxNode], isSvg);
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
