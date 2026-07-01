import {
  getIdentifierName,
  getJsxName,
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
  jsxValues: ComponentRecord['jsxValues'];
  styles: ComponentRecord['styles'];
  providesContext: boolean;
}

interface ContextProviderImports {
  named: Set<string>;
  namespaces: Set<string>;
}

interface StyleHookImports {
  named: Map<string, boolean>;
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
  discoverLocalComponents(ctx, program.body);
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
  qrlBoundary: string | null = null,
  exported = true
) {
  const body = getComponentBody(fn, getContextProviderImports(ctx), getStyleHookImports(ctx));
  const component: ComponentRecord = {
    exportName,
    localName,
    declarationKind,
    exported,
    functionRange: getRange(fn),
    qrlBoundary,
    providesContext: body.providesContext,
    idBase: '',
    needsId: false,
    segmentId: null,
    useIdNames: getUseIdNames(ctx),
    styles: body.styles,
    params: getParams(fn),
    setupRanges: body.setupRanges,
    jsxValues: body.jsxValues,
    jsx: body.jsx,
    root: null,
    supported: true,
  };
  ctx.manifest.components.push(component);
  return component;
}

function getUseIdNames(ctx: CompilerContext): string[] {
  const names: string[] = [];
  for (const importRecord of ctx.manifest.imports) {
    if (importRecord.typeOnly || importRecord.source !== QwikModule.Core) {
      continue;
    }
    for (const specifier of importRecord.specifiers) {
      if (
        specifier.kind === 'named' &&
        !specifier.typeOnly &&
        specifier.importedName === QwikSymbol.UseId
      ) {
        names.push(specifier.localName);
      }
    }
  }
  return names;
}

interface LocalComponentCandidate {
  name: string;
  fn: AstFunction;
  declarationKind: 'function' | 'const';
  qrlBoundary: string | null;
}

function discoverLocalComponents(
  ctx: CompilerContext,
  body: NonNullable<CompilerContext['program']>['body']
) {
  if (ctx.manifest.components.length === 0) {
    return;
  }
  const candidates = collectLocalComponentCandidates(body);
  const queue = new Set<string>();
  for (const component of ctx.manifest.components) {
    if (component.jsx) {
      collectJsxComponentNames(component.jsx, queue);
    }
    for (const value of component.jsxValues) {
      collectJsxComponentNames(value.jsx, queue);
    }
  }

  for (const name of queue) {
    if (hasDiscoveredComponent(ctx, name)) {
      continue;
    }
    const candidate = candidates.get(name);
    if (!candidate) {
      continue;
    }
    const component = addFunctionComponent(
      ctx,
      candidate.fn,
      candidate.name,
      candidate.name,
      candidate.declarationKind,
      candidate.qrlBoundary,
      false
    );
    if (component?.jsx) {
      collectJsxComponentNames(component.jsx, queue);
    }
  }
}

function collectLocalComponentCandidates(
  body: NonNullable<CompilerContext['program']>['body']
): Map<string, LocalComponentCandidate> {
  const candidates = new Map<string, LocalComponentCandidate>();
  for (const statement of body) {
    if (statement.type === 'FunctionDeclaration') {
      const name = getIdentifierName(statement.id);
      if (name && isComponentTagName(name)) {
        candidates.set(name, {
          name,
          fn: statement,
          declarationKind: 'function',
          qrlBoundary: null,
        });
      }
      continue;
    }
    if (statement.type !== 'VariableDeclaration') {
      continue;
    }
    for (const declarator of statement.declarations ?? []) {
      const name = getIdentifierName(declarator.id);
      const component = getComponentFunction(declarator.init);
      if (name && isComponentTagName(name) && component) {
        candidates.set(name, {
          name,
          fn: component.fn,
          declarationKind: 'const',
          qrlBoundary: component.qrlBoundary,
        });
      }
    }
  }
  return candidates;
}

function collectJsxComponentNames(node: AstJsxNode, names: Set<string>) {
  visit(node, (current) => {
    if (current.type !== 'JSXElement') {
      return;
    }
    const name = getJsxName(current.openingElement.name);
    if (name && isComponentTagName(name)) {
      names.add(name);
    }
  });
}

function hasDiscoveredComponent(ctx: CompilerContext, name: string) {
  return ctx.manifest.components.some(
    (component) => component.exportName === name || component.localName === name
  );
}

function isComponentTagName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9_$]*$/.test(name);
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
  contextProviderImports: ContextProviderImports,
  styleHookImports: StyleHookImports
): ComponentBodyInfo {
  const body = unwrapExpression(fn.body);
  if (!body) {
    return { jsx: null, setupRanges: [], jsxValues: [], styles: [], providesContext: false };
  }
  if (body.type === 'JSXElement' || body.type === 'JSXFragment') {
    return { jsx: body, setupRanges: [], jsxValues: [], styles: [], providesContext: false };
  }
  if (body.type !== 'BlockStatement') {
    return { jsx: null, setupRanges: [], jsxValues: [], styles: [], providesContext: false };
  }
  const setupRanges: ComponentBodyInfo['setupRanges'] = [];
  const jsxValues: ComponentBodyInfo['jsxValues'] = [];
  const styles: ComponentBodyInfo['styles'] = [];
  let providesContext = false;
  for (const statement of body.body ?? []) {
    const statementRange = getRange(statement);
    if (statement.type !== 'ReturnStatement') {
      if (statementRange) {
        setupRanges.push(statementRange);
      }
      collectStyleHooks(statement, styleHookImports, styles);
      collectJsxValues(statement, jsxValues);
      providesContext ||= containsContextProviderCall(statement, contextProviderImports);
      continue;
    }
    const argument = unwrapExpression(statement.argument);
    if (isJsxNode(argument)) {
      return { jsx: argument, setupRanges, jsxValues, styles, providesContext };
    }
    if (statementRange) {
      setupRanges.push(statementRange);
    }
    collectStyleHooks(statement, styleHookImports, styles);
    collectJsxValues(statement, jsxValues);
    providesContext ||= containsContextProviderCall(statement, contextProviderImports);
  }
  return { jsx: null, setupRanges: [], jsxValues: [], styles: [], providesContext: false };
}

function collectStyleHooks(
  statement: unknown,
  imports: StyleHookImports,
  styles: ComponentBodyInfo['styles']
) {
  if (imports.named.size === 0) {
    return;
  }
  const standaloneExpression =
    statement &&
    typeof statement === 'object' &&
    (statement as { type?: string }).type === 'ExpressionStatement'
      ? unwrapExpression((statement as { expression?: unknown }).expression)
      : null;
  visitStyleHookCalls(statement, statement, (call) => {
    const localName = getIdentifierName(unwrapExpression(call.callee));
    if (localName === null || !imports.named.has(localName)) {
      return;
    }
    const callRange = getRange(call);
    const firstArg = call.arguments?.[0];
    const argRange = getRange(firstArg);
    if (callRange === null || argRange === null) {
      return;
    }
    styles.push({
      scoped: imports.named.get(localName) === true,
      callRange,
      argRange,
      standalone: standaloneExpression === unwrapExpression(call),
      styleId: '',
    });
  });
}

function visitStyleHookCalls(
  node: unknown,
  root: unknown,
  visitor: (node: Extract<AstNode, { type: 'CallExpression' }>) => void
) {
  if (!node || typeof node !== 'object' || !('type' in node)) {
    return;
  }
  if (node !== root && isFunctionLike(node)) {
    return;
  }
  if (isCallExpression(node)) {
    visitor(node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        visitStyleHookCalls(item, root, visitor);
      }
    } else {
      visitStyleHookCalls(value, root, visitor);
    }
  }
}

function collectJsxValues(statement: unknown, jsxValues: ComponentBodyInfo['jsxValues']) {
  if (
    !statement ||
    typeof statement !== 'object' ||
    (statement as { type?: string }).type !== 'VariableDeclaration'
  ) {
    return;
  }
  for (const declarator of (statement as { declarations?: unknown[] }).declarations ?? []) {
    if (!declarator || typeof declarator !== 'object') {
      continue;
    }
    const record = declarator as { id?: unknown; init?: unknown };
    const name = getIdentifierName(record.id);
    const jsx = unwrapExpression(record.init);
    const expressionRange = getRange(record.init);
    if (name && isJsxNode(jsx) && expressionRange) {
      jsxValues.push({
        name,
        factoryName: `__jsxValue${jsxValues.length}`,
        expressionRange,
        jsx,
        root: null,
      });
    }
  }
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

function getStyleHookImports(ctx: CompilerContext): StyleHookImports {
  const named = new Map<string, boolean>();
  for (const importRecord of ctx.manifest.imports) {
    if (importRecord.typeOnly || importRecord.source !== QwikModule.Core) {
      continue;
    }
    for (const specifier of importRecord.specifiers) {
      if (specifier.kind !== 'named' || specifier.typeOnly) {
        continue;
      }
      if (specifier.importedName === QwikSymbol.UseStyles) {
        named.set(specifier.localName, false);
      } else if (specifier.importedName === QwikSymbol.UseStylesScoped) {
        named.set(specifier.localName, true);
      }
    }
  }
  return { named };
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
