import {
  getIdentifierName,
  getParams,
  getRange,
  isCallExpression,
  isFunctionLike,
  isIdentifierNamed,
  isJsxNode,
  unwrapExpression,
  visit,
} from '../ast-utils';
import type {
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ImportDeclaration,
  ImportDeclarationSpecifier,
} from 'oxc-parser';
import type {
  AstFunction,
  AstJsxNode,
  CompilerContext,
  ComponentRecord,
  ImportRecord,
  ImportSpecifierRecord,
} from '../types';
import { QwikModule, QwikSymbol } from '../words';

interface ComponentFunctionInfo {
  fn: AstFunction;
  qrlBoundary: string | null;
}

interface ComponentBodyInfo {
  jsx: AstJsxNode | null;
  setupRanges: NonNullable<ComponentRecord['functionRange']>[];
  providesContext: boolean;
}

interface ContextProviderImports {
  named: Set<string>;
  namespaces: Set<string>;
}

export function collectModuleFacts(ctx: CompilerContext) {
  const body = ctx.program?.body;
  if (!Array.isArray(body)) {
    return;
  }
  for (const statement of body) {
    if (statement.type === 'ImportDeclaration') {
      const record = createImportRecord(statement);
      if (record) {
        ctx.manifest.imports.push(record);
      }
    }
  }
}

function createImportRecord(node: ImportDeclaration): ImportRecord | null {
  if (node.attributes.length > 0 || node.phase !== null) {
    return null;
  }
  return {
    source: String(node.source.value),
    typeOnly: node.importKind === 'type',
    specifiers: node.specifiers.flatMap(createImportSpecifierRecord),
  };
}

function createImportSpecifierRecord(
  specifier: ImportDeclarationSpecifier
): ImportSpecifierRecord[] {
  const localName = getIdentifierName(specifier.local);
  if (!localName) {
    return [];
  }
  if (specifier.type === 'ImportDefaultSpecifier') {
    return [{ kind: 'default', localName }];
  }
  if (specifier.type === 'ImportNamespaceSpecifier') {
    return [{ kind: 'namespace', localName }];
  }
  const importedName = getIdentifierName(specifier.imported);
  if (!importedName) {
    return [];
  }
  return [
    {
      kind: 'named',
      importedName,
      localName,
      typeOnly: specifier.importKind === 'type',
    },
  ];
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
  const body = getComponentBody(fn, getContextProviderImports(ctx));
  const component: ComponentRecord = {
    exportName,
    localName,
    declarationKind,
    functionRange: getRange(fn),
    qrlBoundary,
    providesContext: body.providesContext,
    segmentId: null,
    params: getParams(fn),
    setupRanges: body.setupRanges,
    jsx: body.jsx,
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
  if (!isCallExpression(unwrapped) || !isIdentifierNamed(unwrapped.callee, QwikSymbol.Component)) {
    return null;
  }
  const [firstArg] = unwrapped.arguments ?? [];
  const fn = unwrapExpression(firstArg);
  return isFunctionLike(fn) && fn ? { fn, qrlBoundary: QwikSymbol.Component } : null;
}

function getComponentBody(
  fn: AstFunction,
  contextProviderImports: ContextProviderImports
): ComponentBodyInfo {
  const body = unwrapExpression(fn.body);
  if (!body) {
    return { jsx: null, setupRanges: [], providesContext: false };
  }
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return { jsx: body, setupRanges: [], providesContext: false };
  }
  if (body.type !== 'BlockStatement') {
    return { jsx: null, setupRanges: [], providesContext: false };
  }
  const setupRanges: ComponentBodyInfo['setupRanges'] = [];
  let providesContext = false;
  for (const statement of body.body ?? []) {
    const statementRange = getRange(statement);
    if (statement.type !== 'ReturnStatement') {
      if (statementRange) {
        setupRanges.push(statementRange);
      }
      providesContext ||= containsContextProviderCall(statement, contextProviderImports);
      continue;
    }
    const argument = unwrapExpression(statement.argument);
    if (isJsxNode(argument)) {
      return { jsx: argument, setupRanges, providesContext };
    }
    if (statementRange) {
      setupRanges.push(statementRange);
    }
    providesContext ||= containsContextProviderCall(statement, contextProviderImports);
  }
  return { jsx: null, setupRanges: [], providesContext: false };
}

function getContextProviderImports(ctx: CompilerContext): ContextProviderImports {
  const named = new Set<string>();
  const namespaces = new Set<string>();
  for (const importRecord of ctx.manifest.imports) {
    if (importRecord.typeOnly || importRecord.source !== QwikModule.Spark) {
      continue;
    }
    for (const specifier of importRecord.specifiers) {
      if (specifier.kind === 'namespace') {
        namespaces.add(specifier.localName);
      } else if (
        specifier.kind === 'named' &&
        !specifier.typeOnly &&
        specifier.importedName === QwikSymbol.CreateContextProvider
      ) {
        named.add(specifier.localName);
      }
    }
  }
  return { named, namespaces };
}

function containsContextProviderCall(
  statement: unknown,
  contextProviderImports: ContextProviderImports
): boolean {
  if (contextProviderImports.named.size === 0 && contextProviderImports.namespaces.size === 0) {
    return false;
  }

  let found = false;
  visit(statement, (node) => {
    if (
      !found &&
      isCallExpression(node) &&
      isContextProviderCallee(node.callee, contextProviderImports)
    ) {
      found = true;
    }
  });
  return found;
}

function isContextProviderCallee(
  callee: unknown,
  contextProviderImports: ContextProviderImports
): boolean {
  const unwrapped = unwrapExpression(callee);
  const localName = getIdentifierName(unwrapped);
  if (localName && contextProviderImports.named.has(localName)) {
    return true;
  }
  if (!unwrapped || unwrapped.type !== 'MemberExpression' || unwrapped.computed) {
    return false;
  }
  const propertyName = getIdentifierName(unwrapped.property);
  const objectName = getIdentifierName(unwrapped.object);
  return (
    propertyName === QwikSymbol.CreateContextProvider &&
    objectName !== null &&
    contextProviderImports.namespaces.has(objectName)
  );
}
