import type { ArrowFunctionExpression, Function as FunctionNode, Node } from 'oxc-parser';
import { isNode } from './ast-types';

export function isFunctionLike(node: Node): node is ArrowFunctionExpression | FunctionNode {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

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
