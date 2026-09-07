import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  BindingPattern,
  Directive,
  JSXElement,
  Statement,
} from 'oxc-parser';
import { DeclarationKind } from '../schema';
import { unwrapExpression } from './ast/utils';
import type { ComponentCandidate } from './ast/returns-jsx';
import { UnsupportedError } from '../errors';

export interface DiscoveredComponent {
  name: string;
  bindingNode: BindingIdentifier | null;
  declarationKind: DeclarationKind;
  arrow: ArrowFunctionExpression;
  /** The authored props parameter pattern. */
  param: { node: BindingPattern; range: [number, number] } | null;
  /** Statements before the return — lowered as component setup. */
  setupStatements: (Directive | Statement)[];
  jsx: JSXElement;
  statement: Statement;
}

/** Validate candidate declarations before lowering their setup and JSX. */
export function discoverComponents(
  candidates: readonly ComponentCandidate[]
): DiscoveredComponent[] {
  return candidates.map(({ statement, fn, name }) => {
    if (fn.type !== 'ArrowFunctionExpression') {
      throw new UnsupportedError('a component declaration that is not an arrow function');
    }
    if (statement.type === 'ExportDefaultDeclaration') {
      return describeComponent(statement, fn, 'default', DeclarationKind.DefaultArrow, null);
    }
    const declaration =
      statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement;
    if (declaration?.type !== 'VariableDeclaration') {
      throw new UnsupportedError('a component without a variable declaration');
    }
    if (declaration.declarations.length !== 1) {
      throw new UnsupportedError('a component sharing its declaration with other declarators');
    }
    const declarator = declaration.declarations[0];
    if (declarator.id.type !== 'Identifier' || name === null) {
      throw new UnsupportedError('a destructured component declaration');
    }
    if (declaration.kind !== 'const') {
      throw new UnsupportedError(`a component declared with "${declaration.kind}"`);
    }
    return describeComponent(statement, fn, name, DeclarationKind.Const, declarator.id);
  });
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
  if (
    param !== undefined &&
    param.type !== 'Identifier' &&
    (param.type !== 'ObjectPattern' ||
      param.properties.some(
        (property) =>
          property.type !== 'Property' ||
          !property.shorthand ||
          property.value.type !== 'Identifier'
      ))
  ) {
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
