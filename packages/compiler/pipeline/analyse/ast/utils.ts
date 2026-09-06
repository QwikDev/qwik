import type {
  ArrowFunctionExpression,
  Expression,
  Function as FunctionNode,
  Node,
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

export function readReturnedExpression(body: ArrowFunctionExpression['body']) {
  if (body.type !== 'BlockStatement') {
    return unwrapExpression(body);
  }
  const statement = body.body[0];
  if (
    body.body.length !== 1 ||
    statement.type !== 'ReturnStatement' ||
    statement.argument === null
  ) {
    return null;
  }
  return unwrapExpression(statement.argument);
}
