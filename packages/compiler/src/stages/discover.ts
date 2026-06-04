import {
  getIdentifierName,
  getParams,
  isCallExpression,
  isFunctionLike,
  isIdentifierNamed,
  isJsxNode,
  unwrapExpression,
} from '../ast-utils';
import type { AnyNode, CompilerContext, ComponentRecord } from '../types';

export function collectModuleFacts(_ctx: CompilerContext) {
  // Reserved for module-level facts that are independent from component discovery.
}

export function discoverExportedComponents(ctx: CompilerContext) {
  const program = ctx.program;
  if (program === null || !Array.isArray(program.body)) {
    return;
  }

  for (const statement of program.body as AnyNode[]) {
    if (statement.type === 'ExportNamedDeclaration') {
      discoverNamedExport(ctx, statement);
    } else if (statement.type === 'ExportDefaultDeclaration') {
      discoverDefaultExport(ctx, statement);
    }
  }
}

function discoverNamedExport(ctx: CompilerContext, statement: AnyNode) {
  const declaration = statement.declaration as AnyNode | null | undefined;
  if (!declaration) {
    return;
  }
  if (declaration.type === 'FunctionDeclaration') {
    const name = getIdentifierName(declaration.id);
    if (name) {
      addFunctionComponent(ctx, declaration, name, name, 'function');
    }
    return;
  }
  if (declaration.type !== 'VariableDeclaration') {
    return;
  }
  for (const declarator of declaration.declarations ?? []) {
    const name = getIdentifierName(declarator.id);
    const fn = getComponentFunction(declarator.init);
    if (name && fn) {
      addFunctionComponent(ctx, fn, name, name, 'const');
    }
  }
}

function discoverDefaultExport(ctx: CompilerContext, statement: AnyNode) {
  const declaration = statement.declaration as AnyNode | null | undefined;
  if (!declaration) {
    return;
  }
  if (declaration.type === 'FunctionDeclaration') {
    addFunctionComponent(
      ctx,
      declaration,
      'default',
      getIdentifierName(declaration.id),
      'defaultFunction'
    );
    return;
  }

  const fn = getComponentFunction(declaration);
  if (!fn) {
    return;
  }
  if (fn.type === 'ArrowFunctionExpression') {
    addFunctionComponent(ctx, fn, 'default', null, 'defaultArrow');
  } else {
    addFunctionComponent(ctx, fn, 'default', getIdentifierName(fn.id), 'defaultFunction');
  }
}

function addFunctionComponent(
  ctx: CompilerContext,
  fn: AnyNode,
  exportName: string | 'default',
  localName: string | null,
  declarationKind: ComponentRecord['declarationKind']
) {
  const component: ComponentRecord = {
    exportName,
    localName,
    declarationKind,
    params: getParams(fn),
    jsx: getReturnedJsx(fn),
    root: null,
    supported: true,
  };
  ctx.manifest.components.push(component);
}

function getComponentFunction(node: AnyNode | null | undefined): AnyNode | null {
  const unwrapped = unwrapExpression(node);
  if (isFunctionLike(unwrapped)) {
    return unwrapped ?? null;
  }
  if (!isCallExpression(unwrapped) || !isIdentifierNamed(unwrapped.callee, 'component$')) {
    return null;
  }
  const [firstArg] = unwrapped.arguments ?? [];
  const fn = unwrapExpression(firstArg);
  return isFunctionLike(fn) ? (fn ?? null) : null;
}

function getReturnedJsx(fn: AnyNode): AnyNode | null {
  const body = unwrapExpression(fn.body);
  if (!body) {
    return null;
  }
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return body;
  }
  if (body.type !== 'BlockStatement') {
    return null;
  }
  for (const statement of body.body ?? []) {
    const argument = unwrapExpression(statement.argument);
    if (statement.type === 'ReturnStatement' && isJsxNode(argument)) {
      return argument;
    }
  }
  return null;
}
