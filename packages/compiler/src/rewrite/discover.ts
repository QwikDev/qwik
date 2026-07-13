import type {
  ArrowFunctionExpression,
  Declaration,
  ExportDefaultDeclarationKind,
  Function as OxcFunction,
  Program,
} from 'oxc-parser';
import {
  getIdentifierName,
  getParams,
  getRange,
  isCallExpression,
  unwrapExpression,
} from '../ast-utils';
import type {
  RewriteComponent,
  RewriteContextProviderImports,
  RewriteSlotImports,
  RewriteSourceFactoryImports,
} from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

type RewriteComponentFunction = OxcFunction | ArrowFunctionExpression;

const SOURCE_FACTORY_NAMES = new Set<string>([
  QwikHooks.UseSignal,
  QwikHooks.UseComputed,
  QwikHooks.UseAsync,
  QwikHooks.UseSerializer,
]);

interface RewriteQwikImports {
  sourceFactoryImports: RewriteSourceFactoryImports;
  contextProviderImports: RewriteContextProviderImports;
  slotImports: RewriteSlotImports;
  componentImports: Set<string>;
}

export function discoverRewriteComponents(
  program: Program,
  componentReferences: readonly string[] = []
): RewriteComponent[] {
  const components: RewriteComponent[] = [];
  const { sourceFactoryImports, contextProviderImports, slotImports, componentImports } =
    collectQwikImports(program);
  const localComponentNames = new Set(componentReferences);
  for (const statement of program.body) {
    switch (statement.type) {
      case 'FunctionDeclaration':
      case 'VariableDeclaration': {
        const names =
          statement.type === 'VariableDeclaration'
            ? statement.declarations.map((declarator) => getIdentifierName(declarator.id))
            : [getIdentifierName(statement.id)];
        if (names.some((name) => name !== null && localComponentNames.has(name))) {
          handleComponentDeclaration(
            statement,
            false,
            sourceFactoryImports,
            contextProviderImports,
            slotImports,
            componentImports,
            (name) => name,
            components
          );
        }
        break;
      }
      case 'ExportNamedDeclaration': {
        const declaration = statement.declaration;
        if (declaration) {
          handleComponentDeclaration(
            declaration,
            true,
            sourceFactoryImports,
            contextProviderImports,
            slotImports,
            componentImports,
            (name) => name,
            components
          );
        }
        break;
      }
      case 'ExportDefaultDeclaration': {
        const declaration = statement.declaration;
        if (declaration) {
          handleComponentDeclaration(
            declaration,
            true,
            sourceFactoryImports,
            contextProviderImports,
            slotImports,
            componentImports,
            () => 'default',
            components
          );
        }
        break;
      }
      default:
        break;
    }
  }
  return components;
}

function handleComponentDeclaration(
  declaration: Declaration | ExportDefaultDeclarationKind,
  exported: boolean,
  sourceFactoryImports: RewriteSourceFactoryImports,
  contextProviderImports: RewriteContextProviderImports,
  slotImports: RewriteSlotImports,
  componentImports: ReadonlySet<string>,
  getExportName: (localName: string) => string | 'default',
  components: RewriteComponent[]
): void {
  switch (declaration.type) {
    case 'FunctionDeclaration': {
      const name = getIdentifierName(declaration.id);
      if (name && declaration.body) {
        components.push({
          exported,
          declarationKind: getExportName(name) === 'default' ? 'defaultFunction' : 'function',
          exportName: getExportName(name),
          localName: name,
          functionRange: getRange(declaration),
          params: getParams(declaration),
          body: declaration.body,
          sourceFactoryImports,
          contextProviderImports,
          slotImports,
        });
      }
      break;
    }
    case 'VariableDeclaration':
      for (const declarator of declaration.declarations) {
        if (declarator.id.type !== 'Identifier') {
          continue;
        }
        const name = getIdentifierName(declarator.id);
        if (!name) {
          continue;
        }
        const fn = getComponentFunction(declarator.init, componentImports);
        if (fn?.body) {
          components.push({
            exported,
            declarationKind: 'const',
            exportName: getExportName(name),
            localName: name,
            functionRange: getRange(fn),
            params: getParams(fn),
            body: fn.body,
            sourceFactoryImports,
            contextProviderImports,
            slotImports,
          });
        }
      }
      break;
    default: {
      const fn = getComponentFunction(declaration, componentImports);
      if (fn?.body) {
        components.push({
          exported,
          declarationKind:
            fn.type === 'ArrowFunctionExpression' ? 'defaultArrow' : 'defaultFunction',
          exportName: 'default',
          localName: getComponentFunctionName(fn),
          functionRange: getRange(fn),
          params: getParams(fn),
          body: fn.body,
          sourceFactoryImports,
          contextProviderImports,
          slotImports,
        });
      }
      break;
    }
  }
}

function collectQwikImports(program: Program): RewriteQwikImports {
  const sourceFactoryImports: RewriteSourceFactoryImports = {
    named: new Set(),
    namespaces: new Set(),
  };
  const contextProviderImports: RewriteContextProviderImports = {
    named: new Set(),
    namespaces: new Set(),
  };
  const slotImports: RewriteSlotImports = { named: new Set() };
  const componentImports = new Set<string>();
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      if (statement.importKind === 'type') {
        continue;
      }
      for (const specifier of statement.specifiers) {
        const localName = getIdentifierName(specifier.local);
        if (localName === null) {
          continue;
        }
        switch (specifier.type) {
          case 'ImportSpecifier': {
            const importedName = getIdentifierName(specifier.imported);
            if (
              (statement.source.value === QWIK_CORE_IMPORT ||
                statement.source.value === QWIK_IMPORT) &&
              specifier.importKind !== 'type' &&
              importedName === QwikHooks.Slot
            ) {
              slotImports.named.add(localName);
            }
            if (statement.source.value === QWIK_CORE_IMPORT) {
              if (specifier.importKind !== 'type' && importedName === QwikHooks.Component) {
                componentImports.add(localName);
              }
            } else if (
              statement.source.value === QWIK_IMPORT &&
              specifier.importKind !== 'type' &&
              importedName &&
              SOURCE_FACTORY_NAMES.has(importedName)
            ) {
              sourceFactoryImports.named.add(localName);
            } else if (
              statement.source.value === QWIK_IMPORT &&
              specifier.importKind !== 'type' &&
              importedName === QwikHooks.UseContextProvider
            ) {
              contextProviderImports.named.add(localName);
            }
            break;
          }
          case 'ImportNamespaceSpecifier':
            if (statement.source.value === QWIK_IMPORT) {
              sourceFactoryImports.namespaces.add(localName);
              contextProviderImports.namespaces.add(localName);
            }
            break;
          default:
            break;
        }
      }
    }
  }
  return { sourceFactoryImports, contextProviderImports, slotImports, componentImports };
}

export function isRewriteSourceFactoryName(name: string): boolean {
  return SOURCE_FACTORY_NAMES.has(name);
}

function getComponentFunction(
  node: unknown,
  componentImports: ReadonlySet<string>
): RewriteComponentFunction | null {
  const expr = unwrapExpression(node);
  if (isComponentFunction(expr)) {
    return expr;
  }
  if (!isCallExpression(expr) || !isComponentCallee(expr.callee, componentImports)) {
    return null;
  }
  const [arg] = expr.arguments ?? [];
  const fn = unwrapExpression(arg);
  return isComponentFunction(fn) ? fn : null;
}

function isComponentFunction(node: unknown): node is RewriteComponentFunction {
  return (
    hasNodeType(node) &&
    (node.type === 'FunctionDeclaration' ||
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression')
  );
}

function hasNodeType(node: unknown): node is { type: string } {
  return typeof node === 'object' && node !== null && 'type' in node;
}

function isComponentCallee(node: unknown, componentImports: ReadonlySet<string>): boolean {
  const name = getIdentifierName(unwrapExpression(node));
  return name !== null && componentImports.has(name);
}

function getComponentFunctionName(fn: RewriteComponentFunction): string | null {
  return fn.type === 'ArrowFunctionExpression' ? null : getIdentifierName(fn.id);
}
