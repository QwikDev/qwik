import type { JSXElement, JSXFragment, Node, Program } from 'oxc-parser';
import { isNode, type WalkableNode } from './ast-types';
import { identifierName, isFunctionLike, unwrapExpression } from './utils';
import type { JsxAnalysis } from './jsx-analysis';

/**
 * A top-level function qualifies as a component candidate only when its name is Uppercased (JSX
 * component convention; anonymous default exports have no name to judge) AND JSX sits in VALUE
 * position of a return — JSX inside a call's arguments belongs to that call (`return
 * renderToStream(<Root/>)` must not get its signature rewritten).
 */
export function hasComponentCandidates(program: Program, jsx: JsxAnalysis): boolean {
  return topLevelFunctions(program).some(
    (candidate) => hasComponentName(candidate.name) && returnPositionContainsJsx(candidate.fn, jsx)
  );
}

function hasComponentName(name: string | null): boolean {
  return name === null || /^[A-Z]/.test(name);
}

function topLevelFunctions(program: Program): { fn: Node; name: string | null }[] {
  const functions: { fn: Node; name: string | null }[] = [];
  const fromStatement = (statement: Node): void => {
    if (isFunctionLike(statement)) {
      functions.push({ fn: statement, name: identifierName(statement.id) });
      return;
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declarator of statement.declarations) {
        const init = unwrapExpression(declarator.init);
        if (init !== null && isFunctionLike(init)) {
          functions.push({ fn: init, name: identifierName(declarator.id) });
        }
      }
    }
  };
  for (const statement of program.body) {
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
export function findRuntimeJsx(node: unknown): JSXElement | JSXFragment | null {
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
    const found = findRuntimeJsx((node as WalkableNode)[key]);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

function returnPositionContainsJsx(fn: Node, jsx: JsxAnalysis): boolean {
  const body = unwrapExpression((fn as WalkableNode).body);
  if (body?.type !== 'BlockStatement') {
    return body !== null && jsx.read(body).hasJsxValue;
  }
  let found = false;
  visitReturns(body, (argument) => {
    const value = unwrapExpression(argument);
    found ||= value !== null && jsx.read(value).hasJsxValue;
  });
  return found;
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
    visitReturns((node as WalkableNode)[key], visitor, false);
  }
}
