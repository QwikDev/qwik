import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  Directive,
  JSXElement,
  Program,
  Statement,
} from 'oxc-parser';
import { DeclarationKind } from '../schema';
import { isNode } from './ast/ast-types';
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';

export interface DiscoveredComponent {
  name: string;
  bindingNode: BindingIdentifier | null;
  declarationKind: DeclarationKind;
  arrow: ArrowFunctionExpression;
  /** The authored props param — reused as the emitted props name. */
  param: { node: BindingIdentifier; range: [number, number] } | null;
  /** Statements before the return — lowered as component setup. */
  setupStatements: (Directive | Statement)[];
  jsx: JSXElement;
  statement: Statement;
}

/** Exported arrow components whose body is one `return` of fully static JSX. */
export function discoverComponents(program: Program): DiscoveredComponent[] {
  const found: DiscoveredComponent[] = [];
  for (const statement of program.body) {
    if (statement.type === 'ExportDefaultDeclaration') {
      const arrow = statement.declaration;
      if (arrow.type !== 'ArrowFunctionExpression') {
        throw new UnsupportedError('a default export that is not an arrow function');
      }
      found.push(
        describeComponent(statement, arrow, 'default', DeclarationKind.DefaultArrow, null)
      );
      continue;
    }
    if (statement.type === 'ExportNamedDeclaration' && isNode(statement.declaration)) {
      const declaration = statement.declaration;
      if (declaration.type !== 'VariableDeclaration') {
        continue;
      }
      const declarators = declaration.declarations;
      const declarator = declarators[0];
      const name = identifierName(declarator?.id);
      const init = unwrapExpression(declarator?.init);
      // Only Uppercased names are components; lowercase JSX-returning exports stay untouched.
      if (name === null || !/^[A-Z]/.test(name) || init === null) {
        continue;
      }
      if (declarator.id.type !== 'Identifier') {
        throw new UnsupportedError('a destructured component declaration');
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
      found.push(describeComponent(statement, init, name, DeclarationKind.Const, declarator.id));
    }
  }
  if (found.length === 0) {
    throw new UnsupportedError('JSX outside an exported component');
  }
  return found;
}

function describeComponent(
  statement: Statement,
  arrow: ArrowFunctionExpression,
  name: string,
  declarationKind: DeclarationKind,
  bindingNode: BindingIdentifier | null
): DiscoveredComponent {
  const params = arrow.params;
  if (params.length > 1) {
    throw new UnsupportedError('more than one component parameter');
  }
  const param = params[0];
  if (param !== undefined && param.type !== 'Identifier') {
    throw new UnsupportedError('a destructured component parameter');
  }
  const { setupStatements, returned } = componentBody(arrow);
  if (returned === null || returned.type !== 'JSXElement') {
    throw new UnsupportedError('a return value that is not a JSX element');
  }
  return {
    name,
    bindingNode,
    declarationKind,
    setupStatements,
    arrow,
    param: param === undefined ? null : { node: param, range: [param.start, param.end] },
    jsx: returned,
    statement,
  };
}

/** Setup statements plus the returned expression (concise body, or the final `return`). */
function componentBody(arrow: ArrowFunctionExpression): {
  setupStatements: (Directive | Statement)[];
  returned: ReturnType<typeof unwrapExpression>;
} {
  const body = arrow.body;
  if (body.type !== 'BlockStatement') {
    return { setupStatements: [], returned: unwrapExpression(body) };
  }
  const statements = body.body;
  const last = statements[statements.length - 1];
  if (last === undefined || last.type !== 'ReturnStatement') {
    throw new UnsupportedError('a component body without a final return statement');
  }
  return {
    setupStatements: statements.slice(0, -1),
    returned: unwrapExpression(last.argument),
  };
}
