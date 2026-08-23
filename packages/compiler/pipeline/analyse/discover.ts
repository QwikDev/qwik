import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';

export interface DiscoveredComponent {
  statementRange: [number, number];
  arrowRange: [number, number];
  /** The authored props param — reused as the emitted props name. */
  param: { name: string; range: [number, number] } | null;
  jsx: AstNode;
}

/** A parameterless default-arrow component whose body is one `return` of fully static JSX. */
export function discoverComponent(program: AstNode): DiscoveredComponent {
  const statements = program.body as AstNode[];
  const statement = statements.find((candidate) => candidate.type === 'ExportDefaultDeclaration');
  if (statement === undefined) {
    throw new UnsupportedError('JSX outside a default-exported component');
  }
  const arrow = statement.declaration as AstNode;
  if (!isNode(arrow) || arrow.type !== 'ArrowFunctionExpression') {
    throw new UnsupportedError('a default export that is not an arrow function');
  }
  const params = arrow.params as AstNode[];
  if (params.length > 1) {
    throw new UnsupportedError('more than one component parameter');
  }
  if (params.length === 1 && params[0].type !== 'Identifier') {
    throw new UnsupportedError('a destructured component parameter');
  }
  const returned = componentReturnValue(arrow);
  if (returned === null || returned.type !== 'JSXElement') {
    throw new UnsupportedError('a return value that is not a JSX element');
  }
  const param = params[0];
  return {
    statementRange: [statement.start, statement.end],
    arrowRange: [arrow.start, arrow.end],
    param:
      param === undefined
        ? null
        : {
            name: String((param as AstNode & { name: string }).name),
            range: [param.start, param.end],
          },
    jsx: returned,
  };
}

/** The returned expression — the concise body itself, or the single `return`'s argument. */
function componentReturnValue(arrow: AstNode): AstNode | null {
  const body = arrow.body as AstNode;
  if (body.type !== 'BlockStatement') {
    return unwrapExpression(body);
  }
  const statements = body.body as AstNode[];
  if (statements.length !== 1 || statements[0].type !== 'ReturnStatement') {
    throw new UnsupportedError('a component body beyond a single return statement');
  }
  return unwrapExpression(statements[0].argument);
}
