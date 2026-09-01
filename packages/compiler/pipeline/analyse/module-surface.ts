import type {
  ExportNamedDeclaration,
  ImportAttribute,
  ImportDeclaration,
  ModuleExportName,
  Program,
  VariableDeclaration,
} from 'oxc-parser';
import {
  BindingScope,
  EsmEdgeKind,
  ExportKind,
  ExportTargetKind,
  type LocalId,
  type ModulePlan,
  type Range,
} from '../schema';
import { bindingIdentifiers, type BindingGraph } from './ast/bindings';

const CORE_SOURCES = new Set(['@qwik.dev/core', '@qwik.dev/core/build']);

/** Records the module's ESM surface and returns bindings imported from Qwik Core. */
export function scanModuleSurface(
  program: Program,
  authoredProgram: Program | null,
  plan: ModulePlan,
  bindings: BindingGraph
): Map<LocalId, string> {
  const coreBindings = new Map<LocalId, string>();
  const normalizedImports = new Map<string, ImportDeclaration[]>();
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      const queue = normalizedImports.get(statement.source.value) ?? [];
      queue.push(statement);
      normalizedImports.set(statement.source.value, queue);
    }
  }

  const importProgram = authoredProgram ?? program;
  for (const statement of importProgram.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    const normalized =
      authoredProgram === null
        ? statement
        : takeNormalizedImport(normalizedImports.get(statement.source.value), statement);
    scanImport(statement, normalized, plan, bindings, coreBindings);
  }

  for (const statement of program.body) {
    switch (statement.type) {
      case 'ExportNamedDeclaration':
        scanNamedExport(statement, plan, bindings);
        break;
      case 'ExportDefaultDeclaration': {
        const declaration = statement.declaration;
        const binding =
          declaration.type === 'Identifier'
            ? bindings.reference(declaration)
            : (declaration.type === 'FunctionDeclaration' ||
                  declaration.type === 'ClassDeclaration') &&
                declaration.id !== null
              ? bindings.declaration(declaration.id)
              : null;
        if (binding !== null) {
          addLocalExport(plan, 'default', binding);
        } else {
          addLocalExport(
            plan,
            'default',
            bindings.addSynthetic('default', BindingScope.Module, [
              declaration.start,
              declaration.end,
            ])
          );
        }
        break;
      }
      case 'ExportAllDeclaration': {
        if (statement.exportKind === 'type') {
          break;
        }
        const edge = pushEdge(
          plan,
          statement.exported === null ? EsmEdgeKind.ExportStar : EsmEdgeKind.Reexport,
          statement.source.value,
          false,
          statement.attributes,
          [statement.start, statement.end],
          [statement.source.start, statement.source.end]
        );
        if (statement.exported === null) {
          plan.exports.push({ e: ExportKind.Star, edge });
        } else {
          plan.exports.push({
            e: ExportKind.Reexport,
            exported: moduleName(statement.exported),
            edge,
            imported: '*',
          });
        }
        break;
      }
    }
  }
  [...plan.edges]
    .sort((left, right) => left.authoredOwnerRange[0] - right.authoredOwnerRange[0])
    .forEach((edge, order) => {
      edge.order = order;
    });

  return coreBindings;
}

function takeNormalizedImport(
  candidates: ImportDeclaration[] | undefined,
  authored: ImportDeclaration
): ImportDeclaration | null {
  if (candidates === undefined) {
    return null;
  }
  const authoredNames = new Set(authored.specifiers.map((specifier) => specifier.local.name));
  const index = candidates.findIndex((candidate) =>
    candidate.specifiers.length === 0
      ? authored.specifiers.length === 0
      : candidate.specifiers.every((specifier) => authoredNames.has(specifier.local.name))
  );
  return index === -1 ? null : candidates.splice(index, 1)[0];
}

function scanImport(
  authored: ImportDeclaration,
  normalized: ImportDeclaration | null,
  plan: ModulePlan,
  bindings: BindingGraph,
  coreBindings: Map<LocalId, string>
): void {
  const source = authored.source.value;
  const entries = authored.specifiers.map((specifier) => {
    const imported =
      specifier.type === 'ImportDefaultSpecifier'
        ? ('default' as const)
        : specifier.type === 'ImportNamespaceSpecifier'
          ? ('*' as const)
          : moduleName(specifier.imported);
    const typeOnly =
      authored.importKind === 'type' ||
      (specifier.type === 'ImportSpecifier' && specifier.importKind === 'type');
    return { specifier, imported, typeOnly };
  });
  const edgeTypeOnly = entries.length > 0 && entries.every((entry) => entry.typeOnly);
  const ownerRange: Range = normalized === null ? [0, 0] : [normalized.start, normalized.end];
  const sourceRange: Range =
    normalized === null ? [0, 0] : [normalized.source.start, normalized.source.end];
  const edge = pushEdge(
    plan,
    authored.specifiers.length === 0 ? EsmEdgeKind.SideEffect : EsmEdgeKind.Static,
    source,
    edgeTypeOnly,
    authored.attributes,
    ownerRange,
    sourceRange,
    { owner: [authored.start, authored.end], source: [authored.source.start, authored.source.end] }
  );
  for (const { specifier, imported, typeOnly } of entries) {
    const normalizedSpecifier = normalized?.specifiers.find(
      (candidate) => candidate.local.name === specifier.local.name
    );
    const binding =
      normalizedSpecifier === undefined
        ? bindings.addSynthetic(specifier.local.name, BindingScope.Import, [
            specifier.local.start,
            specifier.local.end,
          ])
        : bindings.declaration(normalizedSpecifier.local);
    if (binding === null) {
      continue;
    }
    if (!typeOnly && CORE_SOURCES.has(source) && imported !== '*') {
      coreBindings.set(binding, imported);
    }
    plan.imports.push({
      binding,
      edge,
      imported,
      typeOnly,
      specifierRange:
        normalizedSpecifier === undefined
          ? [0, 0]
          : [normalizedSpecifier.local.start, normalizedSpecifier.local.end],
      importedRange:
        normalizedSpecifier === undefined
          ? [0, 0]
          : normalizedSpecifier.type === 'ImportSpecifier'
            ? [normalizedSpecifier.imported.start, normalizedSpecifier.imported.end]
            : [normalizedSpecifier.local.start, normalizedSpecifier.local.end],
      authoredSpecifierRange: [specifier.local.start, specifier.local.end],
      authoredImportedRange:
        specifier.type === 'ImportSpecifier'
          ? [specifier.imported.start, specifier.imported.end]
          : [specifier.local.start, specifier.local.end],
    });
  }
}

function scanNamedExport(
  statement: ExportNamedDeclaration,
  plan: ModulePlan,
  bindings: BindingGraph
): void {
  if (statement.exportKind === 'type') {
    return;
  }
  if (statement.source !== null) {
    const edge = pushEdge(
      plan,
      EsmEdgeKind.Reexport,
      statement.source.value,
      false,
      statement.attributes,
      [statement.start, statement.end],
      [statement.source.start, statement.source.end]
    );
    for (const specifier of statement.specifiers) {
      if (specifier.exportKind !== 'type') {
        plan.exports.push({
          e: ExportKind.Reexport,
          exported: moduleName(specifier.exported),
          edge,
          imported: moduleName(specifier.local),
        });
      }
    }
    return;
  }
  if (statement.declaration?.type === 'VariableDeclaration') {
    scanVariableExports(statement.declaration, plan, bindings);
  } else if (
    (statement.declaration?.type === 'FunctionDeclaration' ||
      statement.declaration?.type === 'ClassDeclaration') &&
    statement.declaration.id !== null
  ) {
    const binding = bindings.declaration(statement.declaration.id);
    if (binding !== null) {
      addLocalExport(plan, statement.declaration.id.name, binding);
    }
  }
  for (const specifier of statement.specifiers) {
    if (specifier.exportKind === 'type' || specifier.local.type !== 'Identifier') {
      continue;
    }
    const binding = bindings.reference(specifier.local);
    if (binding !== null) {
      addLocalExport(plan, moduleName(specifier.exported), binding);
    }
  }
}

function scanVariableExports(
  declaration: VariableDeclaration,
  plan: ModulePlan,
  bindings: BindingGraph
): void {
  for (const declarator of declaration.declarations) {
    for (const identifier of bindingIdentifiers(declarator.id)) {
      const binding = bindings.declaration(identifier);
      if (binding !== null) {
        addLocalExport(plan, identifier.name, binding);
      }
    }
  }
}

function addLocalExport(plan: ModulePlan, exported: string, binding: LocalId): void {
  plan.exports.push({
    e: ExportKind.Local,
    exported,
    target: { t: ExportTargetKind.Binding, binding },
  });
}

function pushEdge(
  plan: ModulePlan,
  kind: EsmEdgeKind,
  specifier: string,
  typeOnly: boolean,
  attributes: ImportAttribute[],
  ownerRange: Range,
  sourceRange: Range,
  authored?: { owner: Range; source: Range }
): number {
  const id = plan.edges.length;
  plan.edges.push({
    id,
    kind,
    specifier,
    typeOnly,
    attributes: attributes.map((attribute) => ({
      key: moduleName(attribute.key),
      value: attribute.value.value,
    })),
    ownerRange,
    sourceRange,
    authoredOwnerRange: authored?.owner ?? ownerRange,
    authoredSourceRange: authored?.source ?? sourceRange,
    order: id,
  });
  return id;
}

function moduleName(name: ModuleExportName): string {
  return name.type === 'Literal' ? String(name.value) : name.name;
}
