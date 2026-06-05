import {
  getIdentifierName,
  getParams,
  getRange,
  isCallExpression,
  isFunctionLike,
  isIdentifierNamed,
  isJsxNode,
  unwrapExpression,
} from '../ast-utils';
import type { ExportDefaultDeclaration, ExportNamedDeclaration } from 'oxc-parser';
import type { AstFunction, AstJsxNode, CompilerContext, ComponentRecord } from '../types';

interface ComponentFunctionInfo {
  fn: AstFunction;
  qrlBoundary: string | null;
}

export function collectModuleFacts(_ctx: CompilerContext) {
  // Reserved for module-level facts that are independent from component discovery.
}

export function discoverExportedComponents(ctx: CompilerContext) {
  const program = ctx.program;
  if (program === null || !Array.isArray(program.body)) {
    return;
  }

  for (const statement of program.body) {
    if (statement.type === 'ExportNamedDeclaration') {
      discoverNamedExport(ctx, statement);
    } else if (statement.type === 'ExportDefaultDeclaration') {
      discoverDefaultExport(ctx, statement);
    }
  }
}

function discoverNamedExport(ctx: CompilerContext, statement: ExportNamedDeclaration) {
  const declaration = statement.declaration;
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
    const component = getComponentFunction(declarator.init);
    if (name && component) {
      addFunctionComponent(ctx, component.fn, name, name, 'const', component.qrlBoundary);
    }
  }
}

function discoverDefaultExport(ctx: CompilerContext, statement: ExportDefaultDeclaration) {
  const declaration = statement.declaration;
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

  const component = getComponentFunction(declaration);
  if (!component) {
    return;
  }
  const fn = component.fn;
  if (fn.type === 'ArrowFunctionExpression') {
    addFunctionComponent(ctx, fn, 'default', null, 'defaultArrow', component.qrlBoundary);
  } else {
    addFunctionComponent(
      ctx,
      fn,
      'default',
      getIdentifierName(fn.id),
      'defaultFunction',
      component.qrlBoundary
    );
  }
}

function addFunctionComponent(
  ctx: CompilerContext,
  fn: AstFunction,
  exportName: string | 'default',
  localName: string | null,
  declarationKind: ComponentRecord['declarationKind'],
  qrlBoundary: string | null = null
) {
  const component: ComponentRecord = {
    exportName,
    localName,
    declarationKind,
    functionRange: getRange(fn),
    qrlBoundary,
    segmentId: null,
    params: getParams(fn),
    jsx: getReturnedJsx(fn),
    root: null,
    supported: true,
  };
  ctx.manifest.components.push(component);
}

function getComponentFunction(node: unknown): ComponentFunctionInfo | null {
  const unwrapped = unwrapExpression(node);
  if (isFunctionLike(unwrapped)) {
    return unwrapped ? { fn: unwrapped, qrlBoundary: null } : null;
  }
  if (!isCallExpression(unwrapped) || !isIdentifierNamed(unwrapped.callee, 'component$')) {
    return null;
  }
  const [firstArg] = unwrapped.arguments ?? [];
  const fn = unwrapExpression(firstArg);
  return isFunctionLike(fn) && fn ? { fn, qrlBoundary: 'component$' } : null;
}

function getReturnedJsx(fn: AstFunction): AstJsxNode | null {
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
    if (statement.type !== 'ReturnStatement') {
      continue;
    }
    const argument = unwrapExpression(statement.argument);
    if (isJsxNode(argument)) {
      return argument;
    }
  }
  return null;
}
