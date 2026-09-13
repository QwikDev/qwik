import type {
  ArrowFunctionExpression,
  Expression,
  Function as FunctionNode,
  JSXAttributeItem,
  Node,
  VariableDeclaration,
} from 'oxc-parser';
import { isNode } from './ast-types';

export function isFunctionLike(node: Node): node is ArrowFunctionExpression | FunctionNode {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

export function unwrapExpression(node: Expression): Expression;
export function unwrapExpression(node: unknown): Node | null;
export function unwrapExpression(node: unknown): Node | null {
  let current = node;
  while (isNode(current) && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return isNode(current) ? current : null;
}

export function identifierName(node: unknown): string | null {
  return isNode(node) && node.type === 'Identifier' ? node.name : null;
}

export function readReturnedBody(body: ArrowFunctionExpression['body']): {
  expression: Expression;
  statements: VariableDeclaration[];
} | null {
  if (body.type !== 'BlockStatement') {
    return { expression: unwrapExpression(body), statements: [] };
  }
  const statement = body.body.at(-1);
  const statements = body.body.slice(0, -1);
  if (
    statement?.type !== 'ReturnStatement' ||
    statement.argument === null ||
    !statements.every(
      (statement): statement is VariableDeclaration =>
        statement.type === 'VariableDeclaration' && statement.kind === 'const'
    )
  ) {
    return null;
  }
  return { expression: unwrapExpression(statement.argument), statements };
}

export function jsxAttributeName(attribute: JSXAttributeItem): string | null {
  if (attribute.type !== 'JSXAttribute') {
    return null;
  }
  const name = attribute.name;
  if (name.type === 'JSXIdentifier') {
    return name.name;
  }
  return name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : null;
}

/** `key` is framework-reserved — it feeds collection keying, never the rendered element. */

export function isFalseLiteral(attribute: JSXAttributeItem): boolean {
  const value = attribute.type === 'JSXAttribute' ? attribute.value : null;
  return (
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'Literal' &&
    value.expression.value === false
  );
}
