import { parseSync } from 'oxc-parser';
import type { Expression, JSXElement, JSXFragment } from '../../../src/ast-types.js';

export function parseExprWithSource(code: string): { node: Expression; source: string } {
  const source = `const __x = ${code};`;
  const { program } = parseSync('test.tsx', source);
  const decl = program.body[0];
  if (decl.type !== 'VariableDeclaration') {
    throw new Error(`expected VariableDeclaration, got ${decl.type}`);
  }
  const init = decl.declarations[0]?.init;
  if (!init) throw new Error('expected an initializer expression');
  return { node: init, source };
}

export function parseExpr(code: string): Expression {
  return parseExprWithSource(code).node;
}

function parseExprStatement(source: string): Expression {
  const { program } = parseSync('test.tsx', source);
  const stmt = program.body[0];
  if (stmt.type !== 'ExpressionStatement') {
    throw new Error(`expected ExpressionStatement, got ${stmt.type}`);
  }
  return stmt.expression;
}

export function parseJsxElement(source: string): JSXElement {
  const expr = parseExprStatement(source);
  if (expr.type !== 'JSXElement') {
    throw new Error(`expected JSXElement, got ${expr.type}`);
  }
  return expr;
}

export function parseJsxFragment(source: string): JSXFragment {
  const expr = parseExprStatement(source);
  if (expr.type !== 'JSXFragment') {
    throw new Error(`expected JSXFragment, got ${expr.type}`);
  }
  return expr;
}
