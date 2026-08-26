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
