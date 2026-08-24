import { EsmEdgeKind, type ModulePlan } from '../schema';
import type { AstNode } from './ast/ast-types';
import { UnsupportedError } from '../errors';

const CORE_SOURCES = new Set(['@qwik.dev/core', '@qwik.dev/core/build']);

/**
 * Records `@qwik.dev/core` imports as edges + import rows; returns the local binding → imported
 * name map (hooks and build constants resolve through it).
 */
export function scanCoreImports(
  program: AstNode,
  plan: ModulePlan,
  bindingNames: readonly string[]
): Map<string, string> {
  const coreBindings = new Map<string, string>();
  for (const statement of program.body as AstNode[]) {
    if (statement.type !== 'ImportDeclaration') {
      continue;
    }
    const source = String((statement.source as AstNode & { value?: string }).value ?? '');
    if (!CORE_SOURCES.has(source)) {
      continue;
    }
    const specifiers = (statement.specifiers as AstNode[]).filter(
      (specifier) => specifier.type === 'ImportSpecifier'
    );
    if (specifiers.length !== (statement.specifiers as AstNode[]).length) {
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
      authoredSourceRange: [(statement.source as AstNode).start, (statement.source as AstNode).end],
      order: edgeId,
    });
    for (const specifier of specifiers) {
      const imported = specifier.imported as AstNode & { name: string };
      const local = specifier.local as AstNode & { name: string };
      if (imported.type !== 'Identifier') {
        throw new UnsupportedError('a string-named import from @qwik.dev/core');
      }
      coreBindings.set(String(local.name), String(imported.name));
      plan.imports.push({
        binding: Math.max(0, bindingNames.indexOf(String(local.name))),
        edge: edgeId,
        imported: String(imported.name),
        authoredSpecifierRange: [local.start, local.end],
        authoredImportedRange: [imported.start, imported.end],
      });
    }
  }
  return coreBindings;
}
