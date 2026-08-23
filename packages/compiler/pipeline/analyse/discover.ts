import { DeclarationKind } from '../schema';
import type { AstNode } from './ast/ast-types';
import { isNode } from './ast/ast-types';
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';

export interface DiscoveredComponent {
  name: string;
  declarationKind: DeclarationKind;
  statementRange: [number, number];
  arrowRange: [number, number];
  /** The authored props param — reused as the emitted props name. */
  param: { name: string; range: [number, number] } | null;
  jsx: AstNode;
  statement: AstNode;
}

/** Exported arrow components whose body is one `return` of fully static JSX. */
export function discoverComponents(program: AstNode): DiscoveredComponent[] {
  const found: DiscoveredComponent[] = [];
  for (const statement of program.body as AstNode[]) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const arrow = statement.declaration as AstNode;
      if (!isNode(arrow) || arrow.type !== 'ArrowFunctionExpression') {
        throw new UnsupportedError('a default export that is not an arrow function');
      }
      found.push(describeComponent(statement, arrow, 'default', DeclarationKind.DefaultArrow));
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && isNode(statement.declaration)) {
      const declaration = statement.declaration;
      if (declaration.type !== 'VariableDeclaration') {
        continue;
      }
      const declarators = declaration.declarations as AstNode[];
      const declarator = declarators[0];
      const name = identifierName(declarator?.id);
      const init = unwrapExpression(declarator?.init);
      // Only Uppercased names are components; lowercase JSX-returning exports stay untouched.
      if (name === null || !/^[A-Z]/.test(name) || init === null) {
        continue;
      }
      if (init.type !== 'ArrowFunctionExpression') {
        throw new UnsupportedError('a component declaration that is not an arrow function');
      }
      if (declarators.length !== 1) {
        throw new UnsupportedError('a component sharing its declaration with other declarators');
      }
      if (declaration.kind !== 'const') {
        throw new UnsupportedError(`a component declared with "${declaration.kind}"`);
      }
      found.push(describeComponent(statement, init, name, DeclarationKind.Const));
    }
  }
  if (found.length === 0) {
    throw new UnsupportedError('JSX outside an exported component');
  }
  return found;
}

function describeComponent(
  statement: AstNode,
  arrow: AstNode,
  name: string,
  declarationKind: DeclarationKind
): DiscoveredComponent {
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
    name,
    declarationKind,
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
    statement,
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
