/**
 * Const replacement module for the Qwik optimizer.
 *
 * Replaces isServer/isBrowser/isDev identifiers imported from Qwik packages
 * with boolean literals based on build configuration.
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type {
  AstNode,
  AstParentNode,
  AstProgram,
} from '../../ast-types.js';
import type { ImportInfo } from '../extraction/marker-detection.js';

const CONST_SOURCES = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

function isConstSource(source: string): boolean {
  return CONST_SOURCES.includes(source);
}

interface ConstReplacementResult {
  replacedCount: number;
}

/**
 * Replace isServer/isBrowser/isDev identifiers with boolean literals.
 * Only replaces identifiers that trace to actual Qwik package imports.
 * Does NOT touch the import declarations — import cleanup is owned by the
 * parent rewrite (processImports + the surviving-imports usage filter); see
 * the note at the end of the function body.
 */
export function replaceConstants(
  s: MagicString,
  program: AstProgram,
  importMap: Map<string, ImportInfo>,
  isServer?: boolean,
  isDev?: boolean,
): ConstReplacementResult {
  const replacements = new Map<string, string>();

  for (const [localName, info] of importMap) {
    if (!isConstSource(info.source)) continue;

    const { importedName } = info;

    if (isServer !== undefined) {
      if (importedName === 'isServer') replacements.set(localName, String(isServer));
      else if (importedName === 'isBrowser') replacements.set(localName, String(!isServer));
    }

    if (isDev !== undefined && importedName === 'isDev') {
      replacements.set(localName, String(isDev));
    }
  }

  if (replacements.size === 0) {
    return { replacedCount: 0 };
  }

  let replacedCount = 0;

  // Collect import specifier positions to skip during walk
  const importRanges = new Set<string>();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        importRanges.add(`${spec.local.start}:${spec.local.end}`);
      }
    }
  }

  walk(program, {
    enter(node: AstNode, parent: AstParentNode) {
      if (node.type !== 'Identifier') return;

      const replacement = replacements.get(node.name);
      if (replacement === undefined) return;

      if (importRanges.has(`${node.start}:${node.end}`)) return;
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) return;
      if (parent?.type === 'VariableDeclarator' && parent.id === node) return;
      if (parent?.type === 'ImportSpecifier' && parent.imported === node) return;

      s.overwrite(node.start, node.end, replacement);
      replacedCount++;
    },
  });

  // No import-side cleanup of the replaced const bindings here. This runs only
  // inside the parent rewrite, *after* `processImports` has already removed
  // every original import and rebuilt the survivors into the preamble; the
  // surviving-imports usage filter then drops any binding the literal
  // substitution above left unreferenced. A removal pass at this point edits
  // the already-removed original range and re-introduces the import into the
  // module body — which surfaced as a duplicate `@qwik.dev/core` import (one
  // trimmed copy in the preamble, one stale copy at body start) that broke
  // bundlers with "identifier already declared".
  return { replacedCount };
}
