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
  ImportSpecifier,
} from '../ast-types.js';
import type { ImportInfo } from './marker-detection.js';

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
 * After replacement, removes the corresponding import bindings.
 */
export function replaceConstants(
  source: string,
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
  const replacedLocalNames = new Set<string>();

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
      replacedLocalNames.add(node.name);
    },
  });

  if (replacedLocalNames.size > 0) {
    removeReplacedImports(source, s, program, replacedLocalNames);
  }

  return { replacedCount };
}

/** Remove import specifiers for replaced constants, or the whole import if all were replaced. */
function removeReplacedImports(
  source: string,
  s: MagicString,
  program: AstProgram,
  replacedNames: Set<string>,
): void {
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    if (!specifiers || specifiers.length === 0) continue;

    const removedIndices = new Set<number>();
    for (let i = 0; i < specifiers.length; i++) {
      if (replacedNames.has(specifiers[i].local.name)) removedIndices.add(i);
    }

    if (removedIndices.size === 0) continue;

    let end = node.end;
    if (end < source.length && source[end] === '\n') end++;

    if (removedIndices.size === specifiers.length) {
      s.overwrite(node.start, end, '');
      continue;
    }

    // Partial removal: rebuild the import statement with remaining specifiers
    let defaultPart = '';
    const namedParts: string[] = [];

    for (let i = 0; i < specifiers.length; i++) {
      if (removedIndices.has(i)) continue;

      const spec = specifiers[i];
      if (spec.type === 'ImportDefaultSpecifier') {
        defaultPart = spec.local.name;
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        defaultPart = `* as ${spec.local.name}`;
      } else {
        const localName = spec.local.name;
        const importedName = getImportSpecifierName(spec) ?? localName;
        namedParts.push(
          importedName !== localName ? `${importedName} as ${localName}` : localName,
        );
      }
    }

    const importParts = namedParts.length > 0
      ? defaultPart
        ? `${defaultPart}, { ${namedParts.join(', ')} }`
        : `{ ${namedParts.join(', ')} }`
      : defaultPart;

    const sourceSlice = source.slice(node.source.start, node.source.end);
    s.overwrite(node.start, end, `import ${importParts} from ${sourceSlice};\n`);
  }
}

function getImportSpecifierName(spec: ImportSpecifier): string | undefined {
  if (spec.imported.type === 'Identifier') {
    return spec.imported.name;
  }
  return spec.imported.value;
}
