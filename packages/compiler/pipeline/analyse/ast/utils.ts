import type {
  ArrowFunctionExpression,
  Expression,
  Function as FunctionNode,
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
