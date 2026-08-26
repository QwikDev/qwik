import type { ImportSpecifier, Program } from 'oxc-parser';
import { EsmEdgeKind, type ModulePlan } from '../schema';
import { UnsupportedError } from '../errors';

const CORE_SOURCES = new Set(['@qwik.dev/core', '@qwik.dev/core/build']);

/**
 * Records `@qwik.dev/core` imports as edges + import rows; returns the local binding → imported
 * name map (hooks and build constants resolve through it).
 */
export function scanCoreImports(
  program: Program,
  plan: ModulePlan,
  bindingNames: readonly string[]
): Map<string, string> {
  const coreBindings = new Map<string, string>();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    const source = statement.source.value;
    if (!CORE_SOURCES.has(source)) {
      continue;
    }
    const specifiers = statement.specifiers.filter(
      (specifier): specifier is ImportSpecifier => specifier.type === 'ImportSpecifier'
    );
    if (specifiers.length !== statement.specifiers.length) {
      throw new UnsupportedError('a default or namespace import from @qwik.dev/core');
    }
    const edgeId = plan.edges.length;
    plan.edges.push({
      id: edgeId,
      kind: EsmEdgeKind.Static,
      specifier: source,
      typeOnly: false,
      attributes: [],
      authoredOwnerRange: [statement.start, statement.end],
      authoredSourceRange: [statement.source.start, statement.source.end],
      order: edgeId,
    });
    for (const specifier of specifiers) {
      const imported = specifier.imported;
      const local = specifier.local;
      if (imported.type !== 'Identifier') {
        throw new UnsupportedError('a string-named import from @qwik.dev/core');
      }
      coreBindings.set(local.name, imported.name);
      plan.imports.push({
        binding: Math.max(0, bindingNames.indexOf(local.name)),
        edge: edgeId,
        imported: imported.name,
        authoredSpecifierRange: [local.start, local.end],
        authoredImportedRange: [imported.start, imported.end],
      });
    }
  }
  return coreBindings;
}
