/**
 * Strip exports module for the Qwik optimizer.
 *
 * When the `stripExports` option specifies export names, their bodies are
 * replaced with a throw statement. Imports that become unused after stripping
 * are removed.
 *
 * Implements: MODE-06
 */

import type MagicString from 'magic-string';
import type { ImportInfo } from './marker-detection.js';

/**
 * The exact throw message used by the Qwik optimizer for stripped exports.
 */
const STRIP_THROW_MSG =
  'Symbol removed by Qwik Optimizer, it can not be called from current platform';

/**
 * Result of strip exports processing.
 */
export interface StripExportsResult {
  /** Names of exports that were stripped. */
  strippedNames: string[];
}

/**
 * Replace specified exports with throw statements and remove unused imports.
 *
 * Walks program.body for ExportNamedDeclaration nodes. For each whose exported
 * name is in stripExports, replaces the initializer with a throw arrow function.
 * After all replacements, scans remaining code for import usage and removes
 * import specifiers no longer referenced.
 *
 * @param source - Original source text
 * @param s - MagicString instance (mutated in place)
 * @param program - Parsed AST program node
 * @param stripExports - List of export names to strip
 * @param importMap - Import map from collectImports()
 * @returns Names of exports that were stripped
 */
export function stripExportDeclarations(
  source: string,
  s: MagicString,
  program: any,
  stripExports: string[],
  importMap: Map<string, ImportInfo>,
): StripExportsResult {
  if (stripExports.length === 0) {
    return { strippedNames: [] };
  }

  const stripSet = new Set(stripExports);
  const strippedNames: string[] = [];

  // Track which import local names are used by stripped code (to potentially remove)
  const strippedRanges: Array<{ start: number; end: number }> = [];

  // Walk top-level export declarations
  for (const node of program.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;

    const decl = node.declaration;
    if (!decl) continue;

    if (decl.type === 'VariableDeclaration') {
      // export const name = ...;
      for (const declarator of decl.declarations) {
        if (declarator.id?.type !== 'Identifier') continue;
        const name = declarator.id.name;

        if (!stripSet.has(name)) continue;

        // Replace the initializer with throw arrow function
        if (declarator.init) {
          const throwBody = `()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
          s.overwrite(declarator.init.start, declarator.init.end, throwBody);
          strippedNames.push(name);
          strippedRanges.push({ start: declarator.init.start, end: declarator.init.end });
        }
      }
    } else if (decl.type === 'FunctionDeclaration') {
      // export function name() { ... }
      if (decl.id?.type !== 'Identifier') continue;
      const name = decl.id.name;

      if (!stripSet.has(name)) continue;

      // Replace the entire function with const name = throw arrow
      const throwBody = `const ${name} = ()=>{\n    throw "${STRIP_THROW_MSG}";\n}`;
      s.overwrite(decl.start, decl.end, throwBody);
      strippedNames.push(name);
      strippedRanges.push({ start: decl.start, end: decl.end });
    }
  }

  if (strippedNames.length === 0) {
    return { strippedNames: [] };
  }

  // Now remove unused imports. We need to determine which import local names
  // are still referenced in the non-stripped code.
  removeUnusedImports(source, s, program, strippedRanges, importMap);

  return { strippedNames };
}

/**
 * Remove import specifiers that are no longer referenced after stripping.
 *
 * Strategy: collect all identifiers in non-stripped code regions. Any import
 * whose local name doesn't appear is unused and should be removed.
 */
function removeUnusedImports(
  source: string,
  s: MagicString,
  program: any,
  strippedRanges: Array<{ start: number; end: number }>,
  importMap: Map<string, ImportInfo>,
): void {
  // Collect all identifier references in non-stripped, non-import code
  const usedNames = new Set<string>();

  // Simple approach: scan the source text outside of stripped ranges and import declarations
  // for occurrences of each import local name. This is intentionally simple --
  // we look for word-boundary matches in non-stripped code.
  const importDeclarationRanges: Array<{ start: number; end: number }> = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') {
      importDeclarationRanges.push({ start: node.start, end: node.end });
    }
  }

  // Build a set of ranges to exclude (stripped + imports)
  const excludeRanges = [...strippedRanges, ...importDeclarationRanges].sort(
    (a, b) => a.start - b.start,
  );

  // Build "live code" by excluding ranges
  let liveCode = '';
  let pos = 0;
  for (const range of excludeRanges) {
    if (pos < range.start) {
      liveCode += source.slice(pos, range.start);
    }
    pos = range.end;
  }
  if (pos < source.length) {
    liveCode += source.slice(pos);
  }

  // Check each import name against the live code using word boundary regex
  for (const [localName] of importMap) {
    const pattern = new RegExp(`\\b${escapeRegex(localName)}\\b`);
    if (pattern.test(liveCode)) {
      usedNames.add(localName);
    }
  }

  // Remove unused import specifiers
  for (const node of program.body) {
    if (node.type !== 'ImportDeclaration') continue;

    const specifiers = node.specifiers;
    if (!specifiers || specifiers.length === 0) continue;

    // Check which specifiers are unused
    const unusedIndices: number[] = [];
    for (let i = 0; i < specifiers.length; i++) {
      const localName = specifiers[i].local.name;
      if (!usedNames.has(localName)) {
        unusedIndices.push(i);
      }
    }

    if (unusedIndices.length === 0) continue;

    if (unusedIndices.length === specifiers.length) {
      // All specifiers unused: remove the entire import statement
      let end = node.end;
      if (end < source.length && source[end] === '\n') end++;
      s.overwrite(node.start, end, '');
    } else {
      // Partial removal: rebuild import without unused specifiers
      const sourceNode = node.source;
      let defaultPart = '';
      const namedParts: string[] = [];

      for (let i = 0; i < specifiers.length; i++) {
        if (unusedIndices.includes(i)) continue;
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

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
