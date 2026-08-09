import { getIdentifierName, getRange, unwrapExpression, visit } from './ast-utils';
import { canonicalModuleId, type PluginFnPlan } from './expr-lower';
import type { ModuleAnalysis } from './plan-types';
import type { AstNode, SourceRange } from './types';

/**
 * `native$(impl, { rust: … })` collection (specs/09).
 *
 * The marker is build-time only: the JS implementation stays the module's export and the target
 * sources ride the plan so native engines can call the function without a JS runtime.
 */
export interface NativeMarker {
  /** The whole `native$(...)` call, replaced by its implementation argument. */
  readonly range: SourceRange;
  readonly implementationRange: SourceRange;
  readonly exportName: string;
  readonly targets: Record<string, { readonly source?: string; readonly path?: string }>;
}

export interface NativeCollection {
  readonly markers: readonly NativeMarker[];
  readonly diagnostics: readonly { readonly range: SourceRange; readonly message: string }[];
}

const NATIVE_MARKER = 'native$';
const SOURCE_TAG = 'nativeCode';
const PATH_HELPER = 'nativeFrom';

function isCoreImport(binding: { import?: unknown } | undefined, name: string): boolean {
  const imported = binding?.import as { source?: string; importedName?: string } | null | undefined;
  return imported?.importedName === name && imported.source?.startsWith('@qwik.dev/') === true;
}

export function collectNativeMarkers(
  program: AstNode,
  analysis: ModuleAnalysis,
  source: string
): NativeCollection {
  const markers: NativeMarker[] = [];
  const diagnostics: { range: SourceRange; message: string }[] = [];
  const importedAs = (name: string | null): string | null => {
    if (name === null) {
      return null;
    }
    const binding = analysis.bindings.find(
      (candidate) => candidate.name === name && candidate.import !== null
    );
    const imported = binding?.import;
    return imported != null && imported.source.startsWith('@qwik.dev/')
      ? imported.importedName
      : null;
  };

  visit(program, (node) => {
    if (node.type !== 'VariableDeclarator') {
      return;
    }
    const declarator = node as { id: unknown; init: unknown };
    const call = unwrapExpression(declarator.init);
    if (call?.type !== 'CallExpression') {
      return;
    }
    const callee = unwrapExpression((call as { callee: unknown }).callee);
    if (importedAs(getIdentifierName(callee)) !== NATIVE_MARKER) {
      return;
    }
    const range = getRange(call);
    const exportName = getIdentifierName(unwrapExpression(declarator.id));
    const args = (call as { arguments: unknown[] }).arguments;
    const implementationRange = getRange(unwrapExpression(args[0]));
    if (range === null || exportName === null || implementationRange === null) {
      return;
    }
    const targets = readTargets(unwrapExpression(args[1]), analysis, source, range, diagnostics);
    if (targets === null) {
      return;
    }
    markers.push({ range, implementationRange, exportName, targets });
  });
  return { markers, diagnostics };
}

function readTargets(
  options: AstNode | null | undefined,
  analysis: ModuleAnalysis,
  source: string,
  callRange: SourceRange,
  diagnostics: { range: SourceRange; message: string }[]
): NativeMarker['targets'] | null {
  if (options?.type !== 'ObjectExpression') {
    diagnostics.push({
      range: callRange,
      message: 'native$ needs an object of target implementations, like { rust: nativeCode`…` }.',
    });
    return null;
  }
  const targets: Record<string, { source?: string; path?: string }> = {};
  for (const property of (options as { properties: unknown[] }).properties) {
    const entry = property as { type: string; key?: unknown; value?: unknown; computed?: boolean };
    const target = entry.type === 'Property' ? getIdentifierName(entry.key) : null;
    if (target === null || entry.computed === true) {
      diagnostics.push({ range: callRange, message: 'native$ targets must be plain names.' });
      return null;
    }
    const value = readTargetSource(unwrapExpression(entry.value), analysis, source);
    if (value === null) {
      diagnostics.push({
        range: getRange(entry.value as AstNode) ?? callRange,
        message: `native$ target "${target}" must be a nativeCode\`…\` template without interpolation, or nativeFrom('./impl.rs').`,
      });
      return null;
    }
    targets[target] = value;
  }
  return targets;
}

function readTargetSource(
  value: AstNode | null | undefined,
  analysis: ModuleAnalysis,
  source: string
): { source?: string; path?: string } | null {
  if (value === null || value === undefined) {
    return null;
  }
  // nativeCode`…` — a single quasi, since interpolation cannot be read statically
  if (value.type === 'TaggedTemplateExpression') {
    const tagged = value as { tag: unknown; quasi: { quasis: unknown[]; expressions: unknown[] } };
    const binding = analysis.bindings.find(
      (candidate) => candidate.name === getIdentifierName(unwrapExpression(tagged.tag))
    );
    if (!isCoreImport(binding, SOURCE_TAG) || tagged.quasi.expressions.length > 0) {
      return null;
    }
    // raw text: Rust source must not go through JS escape processing
    const raw = (tagged.quasi.quasis[0] as { value?: { raw?: string } }).value?.raw;
    return typeof raw === 'string' ? { source: raw } : null;
  }
  // nativeFrom('./impl.rs') — a file, or a package directory the build resolves
  if (value.type === 'CallExpression') {
    const call = value as { callee: unknown; arguments: unknown[] };
    const binding = analysis.bindings.find(
      (candidate) => candidate.name === getIdentifierName(unwrapExpression(call.callee))
    );
    if (!isCoreImport(binding, PATH_HELPER)) {
      return null;
    }
    const literal = unwrapExpression(call.arguments[0]) as { type: string; value?: unknown };
    return literal?.type === 'Literal' && typeof literal.value === 'string'
      ? { path: literal.value }
      : null;
  }
  return null;
}

/**
 * Plan entries for the collected markers; `module` is how other modules import them. Sidecar paths
 * stay unresolved — the compiler is a pure transform, so the native build reads them.
 */
export function nativePluginFns(
  markers: readonly NativeMarker[],
  modulePath: string
): PluginFnPlan[] {
  const moduleSpecifier = canonicalModuleId(modulePath);
  return markers.map((marker) => {
    const targets: PluginFnPlan['targets'] = {};
    for (const [target, value] of Object.entries(marker.targets)) {
      targets[target] =
        value.source !== undefined ? { source: value.source } : { path: value.path };
    }
    return {
      fnId: `plugin:${moduleSpecifier}:${marker.exportName}`,
      module: moduleSpecifier,
      exportName: marker.exportName,
      targets,
    };
  });
}
