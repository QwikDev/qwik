import { isNode, type AstNode } from './ast-types';
import { identifierName, isFunctionLike, unwrapExpression } from './utils';

/**
 * A top-level function qualifies as a component candidate only when its name is Uppercased (JSX
 * component convention; anonymous default exports have no name to judge) AND JSX sits in VALUE
 * position of a return — JSX inside a call's arguments belongs to that call (`return
 * renderToStream(<Root/>)` must not get its signature rewritten).
 */
export function hasComponentCandidates(program: AstNode): boolean {
  return topLevelFunctions(program).some(
    (candidate) => hasComponentName(candidate.name) && returnPositionContainsJsx(candidate.fn)
  );
}

function hasComponentName(name: string | null): boolean {
  return name === null || /^[A-Z]/.test(name);
}

function topLevelFunctions(program: AstNode): { fn: AstNode; name: string | null }[] {
  const functions: { fn: AstNode; name: string | null }[] = [];
  const fromStatement = (statement: AstNode): void => {
    if (isFunctionLike(statement)) {
      functions.push({ fn: statement, name: identifierName(statement.id) });
      return;
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations as AstNode[]) {
        const init = unwrapExpression(declarator.init);
        if (init !== null && isFunctionLike(init)) {
          functions.push({ fn: init, name: identifierName(declarator.id) });
        }
      }
    }
  };
  for (const statement of program.body as AstNode[]) {
    fromStatement(statement);
    if (
      (statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration') &&
      isNode(statement.declaration)
    ) {
      fromStatement(statement.declaration);
    }
  }
  return functions;
}

/**
 * JSX left in a candidate-less module must fail loud: it would otherwise reach the generic oxc
 * fallback, which compiles JSX against `react/jsx-runtime` — never acceptable output.
 */
export function findRuntimeJsx(node: unknown): AstNode | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRuntimeJsx(child);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (!isNode(node)) {
    return null;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return node;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    const found = findRuntimeJsx(node[key]);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

export function returnPositionContainsJsx(fn: AstNode): boolean {
  const body = unwrapExpression(fn.body);
  if (body?.type !== 'BlockStatement') {
    return returnsJsxValue(body);
  }
  let found = false;
  visitReturns(body, (argument) => {
    found ||= returnsJsxValue(unwrapExpression(argument));
  });
  return found;
}

function returnsJsxValue(node: unknown): boolean {
  const value = unwrapExpression(node);
  if (!isNode(value)) {
    return false;
  }
  switch (value.type) {
    case 'JSXElement':
    case 'JSXFragment':
      return true;
    case 'ConditionalExpression':
      return returnsJsxValue(value.consequent) || returnsJsxValue(value.alternate);
    case 'LogicalExpression':
      return returnsJsxValue(value.left) || returnsJsxValue(value.right);
    case 'SequenceExpression': {
      const expressions = value.expressions as unknown[];
      return returnsJsxValue(expressions[expressions.length - 1]);
    }
    case 'ArrayExpression':
      return (value.elements as unknown[]).some((element) => returnsJsxValue(element));
    default:
      // Pre-compiled `jsx()` calls need jsx-import tracking — lands with the bindings table.
      return false;
  }
}

/** Returns of nested functions are not the outer function's returns. */
function visitReturns(node: unknown, visitor: (argument: unknown) => void, root = true): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      visitReturns(child, visitor, false);
    }
    return;
  }
  if (!isNode(node)) {
    return;
  }
  if (!root && isFunctionLike(node)) {
    return;
  }
  if (node.type === 'ReturnStatement') {
    visitor(node.argument);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    visitReturns(node[key], visitor, false);
  }
}
