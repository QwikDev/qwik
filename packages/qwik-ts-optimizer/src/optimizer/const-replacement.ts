/**
 * Const replacement module for the Qwik optimizer.
 *
 * Replaces isServer/isBrowser/isDev identifiers imported from Qwik packages
 * with boolean literals based on build configuration.
 *
 * Implements: MODE-07
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import type { ImportInfo } from './marker-detection.js';

/**
 * Qwik package sources that can export isServer/isBrowser/isDev.
 */
const CONST_SOURCES = [
  '@qwik.dev/core',
  '@qwik.dev/core/build',
  '@builder.io/qwik',
  '@builder.io/qwik/build',
  '@builder.io/qwik-city/build',
];

/**
 * Check if a source is a recognized Qwik package for const replacement.
 */
function isConstSource(source: string): boolean {
  return CONST_SOURCES.includes(source);
}

/**
 * Result of const replacement processing.
 */
export interface ConstReplacementResult {
  /** Number of identifier references replaced. */
  replacedCount: number;
}

/**
 * Replace isServer/isBrowser/isDev identifiers with boolean literals.
 *
 * Walks the AST to find Identifier nodes that match imported constants
 * from Qwik packages. Only replaces identifiers that trace to actual imports --
 * user-defined variables with the same name are NOT replaced.
 *
 * After replacement, removes the import bindings for replaced identifiers.
 *
 * @param source - Original source text
 * @param s - MagicString instance (mutated in place)
 * @param program - Parsed AST program node
 * @param importMap - Import map from collectImports()
 * @param isServer - Server mode (true=server, false=browser, undefined=skip)
 * @param isDev - Dev mode (true=dev, false=prod, undefined=skip)
 * @returns Number of replacements made
 */
export function replaceConstants(
  source: string,
  s: MagicString,
  program: any,
  importMap: Map<string, ImportInfo>,
  isServer?: boolean,
  isDev?: boolean,
): ConstReplacementResult {
  // Build a map of local name -> replacement value
  const replacements = new Map<string, string>();

  for (const [localName, info] of importMap) {
    if (!isConstSource(info.source)) continue;

    const importedName = info.importedName;

    if (isServer !== undefined) {
      if (importedName === 'isServer') {
        replacements.set(localName, String(isServer));
      } else if (importedName === 'isBrowser') {
        replacements.set(localName, String(!isServer));
      }
    }

    if (isDev !== undefined) {
      if (importedName === 'isDev') {
        replacements.set(localName, String(isDev));
      }
    }
  }

  if (replacements.size === 0) {
    return { replacedCount: 0 };
  }

  // Track which identifiers were actually replaced
  let replacedCount = 0;
  const replacedLocalNames = new Set<string>();

  // Walk AST to find all Identifier references (not declarations/imports)
  // We need to skip identifiers that are:
  // 1. Import specifier local names (the import declaration itself)
  // 2. Property keys (obj.isServer -- the isServer after the dot)
  // 3. Variable declarations (const isServer = ...)

  // Collect import declaration ranges to skip
  const importRanges = new Set<string>();
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      for (const spec of node.specifiers) {
        // Mark the local identifier position so we skip it
        importRanges.add(`${spec.local.start}:${spec.local.end}`);
      }
    }
  }

  walk(program, {
    enter(node: any, parent: any) {
      if (node.type !== 'Identifier') return;

      const name = node.name;
      const replacement = replacements.get(name);
      if (replacement === undefined) return;

      // Skip import declaration identifiers
      const key = `${node.start}:${node.end}`;
      if (importRanges.has(key)) return;

      // Skip property access (member expression property: obj.isServer)
      if (parent?.type === 'MemberExpression' && parent.property === node && !parent.computed) {
        return;
      }

      // Skip variable declarator id (const isServer = ...)
      if (parent?.type === 'VariableDeclarator' && parent.id === node) {
        return;
      }

      // Skip import specifier imported name
      if (parent?.type === 'ImportSpecifier' && parent.imported === node) {
        return;
      }

      // Replace the identifier with the boolean literal
      s.overwrite(node.start, node.end, replacement);
      replacedCount++;
      replacedLocalNames.add(name);
    },
  });

  // Remove import bindings for replaced identifiers
  if (replacedLocalNames.size > 0) {
    removeReplacedImports(source, s, program, replacedLocalNames);
  }

  return { replacedCount };
}

/**
 * Remove import specifiers for replaced constants.
 * If all specifiers in an import are removed, remove the whole import statement.
 */
function removeReplacedImports(
  source: string,
  s: MagicString,
  program: any,
  replacedNames: Set<string>,
): void {
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    if (!specifiers || specifiers.length === 0) continue;

    // Check which specifiers were replaced
    const toRemove: number[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      const localName = specifiers[i].local.name;
      if (replacedNames.has(localName)) {
        toRemove.push(i);
      }
    }

    if (toRemove.length === 0) continue;

    if (toRemove.length === specifiers.length) {
      // All specifiers replaced: remove entire import
      let end = node.end;
      if (end < source.length && source[end] === '\n') end++;
      s.overwrite(node.start, end, '');
    } else {
      // Partial removal: rebuild import
      const sourceNode = node.source;
      let defaultPart = '';
      const namedParts: string[] = [];

      for (let i = 0; i < specifiers.length; i++) {
        if (toRemove.includes(i)) continue;
        const spec = specifiers[i];
        if (spec.type === 'ImportDefaultSpecifier') {
          defaultPart = spec.local.name;
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          defaultPart = `* as ${spec.local.name}`;
        } else {
          const localName = spec.local.name;
          const importedName = spec.imported?.name ?? localName;
          if (importedName !== localName) {
            namedParts.push(`${importedName} as ${localName}`);
          } else {
            namedParts.push(localName);
          }
        }
      }

      let importParts = '';
      if (namedParts.length > 0) {
        importParts = defaultPart
          ? `${defaultPart}, { ${namedParts.join(', ')} }`
          : `{ ${namedParts.join(', ')} }`;
      } else if (defaultPart) {
        importParts = defaultPart;
      }

      const newImport = `import ${importParts} from ${source.slice(sourceNode.start, sourceNode.end)};`;
      let end = node.end;
      if (end < source.length && source[end] === '\n') end++;
      s.overwrite(node.start, end, newImport + '\n');
    }
  }
}
