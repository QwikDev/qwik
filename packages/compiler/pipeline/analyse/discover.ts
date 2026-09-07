import type {
  ArrowFunctionExpression,
  BindingIdentifier,
  BindingPattern,
  Directive,
  Function as FunctionNode,
  Expression,
  Statement,
} from 'oxc-parser';
import { DeclarationKind } from '../schema';
import { unwrapExpression } from './ast/utils';
import type { ComponentCandidate } from './ast/returns-jsx';
import { UnsupportedError } from '../errors';
import { readObjectParameter } from './ast/parameter-members';

export interface DiscoveredComponent {
  name: string;
  bindingNode: BindingIdentifier | null;
  declarationKind: DeclarationKind;
  fn: ArrowFunctionExpression | FunctionNode;
  /** The authored props parameter pattern. */
  param: {
    node: BindingPattern;
    range: [number, number];
    object: ReturnType<typeof readObjectParameter>;
  } | null;
  /** Statements before the return — lowered as component setup. */
  setupStatements: (Directive | Statement)[];
  renderExpression: Expression;
  statement: Statement;
}

/** Validate candidate declarations before lowering their setup and JSX. */
export function discoverComponents(
  candidates: readonly ComponentCandidate[]
): DiscoveredComponent[] {
  return candidates.map(({ statement, fn, name }) => {
    if (fn.type === 'FunctionDeclaration') {
      if (fn.async || fn.generator) {
        throw new UnsupportedError('an async or generator component function');
      }
      const isDefault = statement.type === 'ExportDefaultDeclaration';
      return describeComponent(
        statement,
        fn,
        isDefault ? 'default' : name!,
        isDefault ? DeclarationKind.DefaultFunction : DeclarationKind.Function,
        fn.id
      );
    }
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
  fn: ArrowFunctionExpression | FunctionNode,
  name: string,
  declarationKind: DeclarationKind,
  bindingNode: BindingIdentifier | null
): DiscoveredComponent {
  const params = fn.params;
  if (params.length > 1) {
    throw new UnsupportedError('more than one component parameter');
  }
  const param = params[0];
  const object = param?.type === 'ObjectPattern' ? readObjectParameter(param) : null;
  if (
    param !== undefined &&
    param.type !== 'Identifier' &&
    (param.type !== 'ObjectPattern' || object === null)
  ) {
    throw new UnsupportedError('a destructured component parameter');
  }
  const { setupStatements, returned } = componentBody(fn);
  if (returned === null) {
    throw new UnsupportedError('a component without a return value');
  }
  return {
    name,
    bindingNode,
    declarationKind,
    setupStatements,
    fn,
    param: param === undefined ? null : { node: param, range: [param.start, param.end], object },
    renderExpression: returned,
    statement,
  };
}

/** Setup statements plus the returned expression (concise body, or the final `return`). */
function componentBody(fn: ArrowFunctionExpression | FunctionNode): {
  setupStatements: (Directive | Statement)[];
  returned: Expression | null;
} {
  const body = fn.body;
  if (body === null) {
    throw new UnsupportedError('a component without a body');
  }
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
    returned: last.argument === null ? null : unwrapExpression(last.argument),
  };
}
