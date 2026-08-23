import { isNode, type AstNode } from './ast-types';

export function isFunctionLike(node: AstNode): boolean {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression' ||
    node.type === 'FunctionDeclaration'
  );
}

export function unwrapExpression(node: unknown): AstNode | null {
  let current = node;
  while (isNode(current) && current.type === 'ParenthesizedExpression') {
    current = current.expression;
  }
  return isNode(current) ? current : null;
}

export function identifierName(node: unknown): string | null {
  return isNode(node) && node.type === 'Identifier'
    ? String((node as AstNode & { name: string }).name)
    : null;
}
