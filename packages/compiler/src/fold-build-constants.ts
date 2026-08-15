import type { ModuleAnalysis } from './plan-types';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';

const BUILD_CONSTANT_SOURCES = new Set(['@qwik.dev/core', '@qwik.dev/core/build']);

/**
 * Replaces imported isServer/isBrowser/isDev references with boolean literals for the current emit
 * target, padded to the identifier width so every downstream source range stays valid. References
 * that cannot hold the literal (shorthand properties, short aliases) keep the runtime import, which
 * resolves to the same value.
 */
export function foldBuildConstants(
  analysis: ModuleAnalysis,
  code: string,
  emitTarget: 'ssr' | 'csr',
  options: TransformModulesOptions
): string | null {
  const constantValues = new Map<number, boolean>();
  for (const binding of analysis.bindings) {
    const importInfo = binding.import;
    if (
      importInfo === null ||
      importInfo.typeOnly ||
      !BUILD_CONSTANT_SOURCES.has(importInfo.source)
    ) {
      continue;
    }
    const value = buildConstantValue(importInfo.importedName, emitTarget, options);
    if (value !== null) {
      constantValues.set(binding.id, value);
    }
  }
  if (constantValues.size === 0) {
    return null;
  }
  const edits: { range: readonly [number, number]; text: string }[] = [];
  for (const reference of analysis.references) {
    if (reference.bindingId === null || reference.role !== 'read') {
      continue;
    }
    const value = constantValues.get(reference.bindingId);
    if (value === undefined) {
      continue;
    }
    const literal = value ? 'true' : 'false';
    const width = reference.range[1] - reference.range[0];
    if (width < literal.length) {
      continue;
    }
    edits.push({ range: reference.range, text: literal.padEnd(width) });
  }
  if (edits.length === 0) {
    return null;
  }
  edits.sort((a, b) => a.range[0] - b.range[0]);
  const parts: string[] = [];
  let cursor = 0;
  for (const edit of edits) {
    parts.push(code.slice(cursor, edit.range[0]), edit.text);
    cursor = edit.range[1];
  }
  parts.push(code.slice(cursor));
  return parts.join('');
}

function buildConstantValue(
  importedName: string,
  emitTarget: 'ssr' | 'csr',
  options: TransformModulesOptions
): boolean | null {
  switch (importedName) {
    case 'isServer':
      return emitTarget === 'ssr';
    case 'isBrowser':
      return emitTarget === 'csr';
    case 'isDev':
      // mirrors the rust optimizer: dev and hmr count as dev; unknown mode keeps the runtime import
      return options.mode === undefined ? null : options.mode === 'dev' || options.mode === 'hmr';
    default:
      return null;
  }
}
