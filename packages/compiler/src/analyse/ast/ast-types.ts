/** Typed oxc-parser AST (estree-shaped) — re-exported as the pipeline's AST vocabulary. */
export type {
  ArrowFunctionExpression,
  Argument,
  BindingPattern,
  Directive,
  Expression,
  JSXAttribute,
  JSXAttributeItem,
  JSXChild,
  JSXElement,
  JSXExpression,
  Node,
  ParamPattern,
  Program,
  Statement,
} from 'oxc-parser';
import type { Node } from 'oxc-parser';

export const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof (value as Node).type === 'string';

/** Structural view for generic walkers that iterate a node's keys. */
export type WalkableNode = Node & { [key: string]: unknown };

const IGNORED_KEYS = new Set(['type', 'start', 'end', 'range', 'parent']);

/** Visits a node's child values in key order; stops at the first truthy result and returns it. */
export function forEachChild<T>(
  node: Node,
  visit: (child: unknown, key: string) => T
): T | undefined {
  for (const key of Object.keys(node)) {
    if (!IGNORED_KEYS.has(key)) {
      const result = visit((node as WalkableNode)[key], key);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
}
